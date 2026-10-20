// com-bridge.js
// ---------------------------------------------------------------------
// Photoshop 안에서 플러그인 패널을 열지 않아도 이 오버레이 앱이
// Photoshop을 직접 제어할 수 있게 해주는 Windows COM 자동화 브릿지.
//
// v4 재설계 — 속도 문제 해결.
//
// v3(직전 버전)는 신뢰성은 확보했지만(SET_OK가 실제로 오고 브러시에
// 반영됨), 색 하나 적용하는 데마다 새 PowerShell 프로세스를 처음부터
// 띄워서 매번 600ms~1초가 걸렸다. 이건 컴퓨터 사양 문제가 아니라
// PowerShell 자체를 새로 시작하는 고정 비용(.NET 런타임 초기화 등) 때문.
//
// 이번엔 "왜 stdin 방식이 안 됐는가"를 다시 짚었다: 문제는 PowerShell의
// stdin 자체가 아니라, 리다이렉트된 Console 스트림에서 `[Console]::In
// .Peek()`으로 논블로킹 확인하는 방식이 신뢰할 수 없었던 것이다. .NET
// 소켓 API(NetworkStream.DataAvailable)는 이런 문제가 없는, 훨씬 안정적인
// 논블로킹 확인 방법이다. 그래서 stdin/stdout 파이프 대신 **로컬 TCP
// 소켓**으로 Node <-> PowerShell을 연결했다:
//
//   - Node가 로컬(127.0.0.1) TCP 서버를 띄운다.
//   - PowerShell 프로세스 하나가 딱 한 번 그 서버에 접속한다.
//   - 그 프로세스 안에서 COM 객체($app)도 딱 한 번만 만들어서 계속
//     재사용한다.
//   - 그 프로세스의 메인 루프가 소켓에서 명령(SET/TOOL/TEST)을
//     비블로킹으로 확인하고 처리하는 것과, 전경색을 주기적으로 읽어
//     보고하는 것을 **같이** 한다.
//
// 이러면 PowerShell 시작 비용도, COM 객체 생성 비용도 앱 실행 중 딱
// 한 번만 치르고, 이후 모든 명령은 이미 열려있는 연결에 실어 보내기만
// 하면 되니 훨씬 빠르다.
//
// *** 이 코드는 실제 Windows + Photoshop 환경에서 검증되지 않았습니다 ***
// (이 작업 환경엔 Windows/Photoshop 자체가 없음). Node 쪽 프로토콜
// 로직(명령 큐, 줄 단위 파싱)은 순수 JS라서 이 환경에서 직접 검증했지만,
// PowerShell 스크립트 자체(TcpClient, ActionManager 호출)는 실행 후
// 콘솔/로그 파일의 [com-bridge] 로그를 확인해주셔야 합니다.
// ---------------------------------------------------------------------

const net = require("net");
const { spawn } = require("child_process");

const TCP_PORT = 51900;
const RECONNECT_DELAY_MS = 3000;
const LOOP_INTERVAL_MS = 100; // 명령 확인 + 색 폴링을 도는 주기 (기존 300~500ms보다 훨씬 짧음 - 이제 COM 객체 재생성 비용이 없어서 부담 없음)
const COMMAND_TIMEOUT_MS = 6000;
const CONNECT_WATCHDOG_MS = 8000; // 프로세스가 떠도 이 시간 안에 연결이 안 되면 강제 재시작
const PS_COMMON_ARGS = ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass"];

let tcpServer = null;
let clientSocket = null;
let psProcess = null;
let watcherCallback = null;
let photoshopGoneCallback = null;
let photoshopAliveCallback = null;
let bridgeStopped = false;
let pendingQueue = []; // 명령 응답을 순서대로 매칭하기 위한 FIFO 큐
let lastSpawnTime = 0;
let watchdogTimer = null;
let desiredPolling = true; // main.js가 원하는 COM 전경색 폴링 상태 (재연결 시 다시 전송)

// PowerShell이 Node의 TCP 서버에 접속해서 계속 도는 스크립트.
// - Test-PhotoshopRunning으로 매번 확인 후에만 COM 호출 (Photoshop이
//   꺼져있는데 COM을 부르면 Windows가 자동으로 다시 켜버리는 문제 방지)
// - $app을 한 번만 만들어서 재사용 (매번 새로 안 만듦 -> 빠름)
// - $stream.DataAvailable로 소켓에 온 명령을 논블로킹 확인 (Console::In
//   .Peek()과 달리 신뢰할 수 있음)
// - ExecuteAction 결과는 [void]로 버려서 프로토콜(한 줄 = 한 메시지)이
//   안 깨지게 함
// - RPC_E_SERVERCALL_RETRYLATER 등 "바쁨" 에러는 짧게 재시도
const PS_SCRIPT = `
$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Test-PhotoshopRunning(내부적으로 Get-Process로 전체 프로세스 목록을
# 뒤짐)이 한 루프 반복마다 최대 4번(들어온 명령 처리 경로에서 2번,
# 폴링 경로에서 2번)씩 불리고 있었다. Get-Process는 생각보다 무거운
# 작업이라, 100ms 주기로 도는 루프 안에서 이걸 그렇게 자주 부르면 루프
# 자체가 밀려서 명령 처리가 몇 초씩 지연되는 원인이 됐을 가능성이 크다
# (실제로 SET 명령 하나 처리에 2~6초가 걸리는 게 관찰됨). 이제
# 800ms에 한 번만 실제로 Get-Process를 부르고, 그 사이엔 캐시된 값을
# 재사용한다.
$script:psRunningCache = $false
$script:psRunningCacheTime = [DateTime]::MinValue
$PS_CHECK_INTERVAL_MS = 800

function Test-PhotoshopRunning {
  $now = Get-Date
  if (($now - $script:psRunningCacheTime).TotalMilliseconds -ge $PS_CHECK_INTERVAL_MS) {
    $proc = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "*Photoshop*" }
    $script:psRunningCache = ($null -ne $proc)
    $script:psRunningCacheTime = $now
  }
  return $script:psRunningCache
}

$client = New-Object System.Net.Sockets.TcpClient
try {
  $client.Connect("127.0.0.1", ${TCP_PORT})
} catch {
  [Console]::Error.WriteLine("CONNECT_ERR: $($_.Exception.Message)")
  exit 1
}
$stream = $client.GetStream()
$reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
$writer = New-Object System.IO.StreamWriter($stream, [System.Text.Encoding]::UTF8)
$writer.AutoFlush = $true

$app = $null
$lastReported = $null
$prevRead = $null
$sameCount = 0
$everReportedAlive = $false
# UXP 패널이 연결되면 Node가 POLL OFF를 보내서 COM 전경색 읽기를 멈춘다
# (UXP set 이벤트가 정답을 주므로, 펜 스트로크 중 COM을 계속 두드릴
# 이유가 없다 — 오히려 Photoshop을 바쁘게 만든다). Photoshop 생존 확인은
# 계속한다.
$pollEnabled = $true
# 검정은 일반 색보다 훨씬 길게 연속으로 읽혀야만 보고한다. 글리치 검정은
# 펜 스트로크 동안 "순간적으로" 나타났다 원래 색으로 돌아오므로 이
# 안정화 구간을 통과하지 못한다. 스포이드/D키로 고른 진짜 검정은 계속
# 검정으로 남아 있으니 약 0.5초 뒤에 정상 보고된다.
$STABLE_READS_NORMAL = 2
$STABLE_READS_BLACK = 5

# 전경색을 "검증해서" 읽는다. 예전 코드는
#   $c = $app.ForegroundColor.RGB; "$([int]$c.Red),..."
# 였는데, Photoshop이 펜 입력 처리로 바쁠 때 COM 속성 읽기가 예외 없이
# $null을 돌려주면 [int]$null = 0 이라서 그대로 "0,0,0"(검정)이 보고됐다.
# 이것이 와콤 펜 검정 전환의 유력한 근본 원인이다. 이제 중간 객체나
# 채널 값이 하나라도 $null이면 "읽기 실패"($null)로 처리해서 보고하지
# 않고, 검정일 때는 HexValue까지 교차 확인한다.
function Read-ForegroundColor {
  try {
    $fg = $app.ForegroundColor
    if ($null -eq $fg) { return $null }
    $rgb = $fg.RGB
    if ($null -eq $rgb) { return $null }
    $cr = $rgb.Red
    $cg = $rgb.Green
    $cb = $rgb.Blue
    if ($null -eq $cr -or $null -eq $cg -or $null -eq $cb) { return $null }
    $ir = [int][Math]::Round([double]$cr)
    $ig = [int][Math]::Round([double]$cg)
    $ib = [int][Math]::Round([double]$cb)
    if ($ir -lt 0 -or $ir -gt 255 -or $ig -lt 0 -or $ig -gt 255 -or $ib -lt 0 -or $ib -gt 255) { return $null }
    if ($ir -eq 0 -and $ig -eq 0 -and $ib -eq 0) {
      $hex = $rgb.HexValue
      if ($null -eq $hex -or "$hex" -ne "000000") { return $null }
    }
    return "$($ir),$($ig),$($ib)"
  } catch {
    return $null
  }
}

function Get-App {
  if (-not (Test-PhotoshopRunning)) { $script:app = $null; return $null }
  if ($null -eq $script:app) {
    try { $script:app = New-Object -ComObject Photoshop.Application } catch { $script:app = $null }
  }
  return $script:app
}

# [v7.7에서 시도했다가 되돌림] ExecuteActionGet으로 읽기도 SET과 같은
# 경로를 타게 해보려 했는데, 실측 결과 이 Photoshop 버전에서 "얻기"
# 명령 자체가 지원되지 않는다는 확정적 오류("이 기능을 사용할 수
# 없습니다")가 매번 발생했다 — 이건 "바빠서 재시도하라"가 아니라
# 애초에 이 경로 자체가 막혀있다는 뜻이라, 재시도해도 절대 성공하지
# 않는다. 그 결과 매 폴링마다 5번의 실패한 재시도(80ms x 5 = 400ms)만
# 낭비하고 결국 항상 예전 방식으로 폴백하고 있었다 — 검정 문제
# 개선에는 전혀 기여를 못 하면서 폴링 주기만 늘리고 로그만 폭증시킨
# 것으로 확인돼서 완전히 제거했다.
function Invoke-SetColor($r, $g, $b) {
  $success = $false
  $lastErr = ""
  # 재시도 예산을 5회x100ms(최대 0.5초)에서 20회x150ms(최대 3초)로
  # 넓혔다 — 실제 로그에서 "색을 고르고 바로 그리기 시작"할 때 혼잡이
  # 수 초씩 지속되는 게 확인됐는데(응답 타임아웃 6초까지 발생), 기존
  # 예산이 그 정도 혼잡을 버티기엔 너무 짧았다.
  for ($i = 0; $i -lt 20 -and -not $success; $i++) {
    try {
      $idSet = $app.StringIDToTypeID("set")
      $desc = New-Object -ComObject Photoshop.ActionDescriptor
      $ref = New-Object -ComObject Photoshop.ActionReference
      $idColor = $app.StringIDToTypeID("color")
      $idForegroundColor = $app.StringIDToTypeID("foregroundColor")
      $ref.PutProperty($idColor, $idForegroundColor)
      $idNull = $app.StringIDToTypeID("null")
      $desc.PutReference($idNull, $ref)
      $colorDesc = New-Object -ComObject Photoshop.ActionDescriptor
      $idRGBColor = $app.StringIDToTypeID("RGBColor")
      $colorDesc.PutDouble($app.StringIDToTypeID("red"), [double]$r)
      $colorDesc.PutDouble($app.StringIDToTypeID("green"), [double]$g)
      $colorDesc.PutDouble($app.StringIDToTypeID("blue"), [double]$b)
      $idTo = $app.StringIDToTypeID("to")
      $desc.PutObject($idTo, $idRGBColor, $colorDesc)
      [void]$app.ExecuteAction($idSet, $desc, 3)
      $success = $true
    } catch {
      $lastErr = $_.Exception.Message
      Start-Sleep -Milliseconds 150
    }
  }
  if ($success) { return "SET_OK" }
  return "SET_ERR $($lastErr -replace '[\\r\\n]+', ' ')"
}

function Invoke-SelectTool($toolName) {
  $success = $false
  $lastErr = ""
  for ($i = 0; $i -lt 5 -and -not $success; $i++) {
    try {
      $idSelect = $app.StringIDToTypeID("select")
      $desc = New-Object -ComObject Photoshop.ActionDescriptor
      $ref = New-Object -ComObject Photoshop.ActionReference
      $idToolRef = $app.StringIDToTypeID($toolName)
      $ref.PutClass($idToolRef)
      $idNull = $app.StringIDToTypeID("null")
      $desc.PutReference($idNull, $ref)
      [void]$app.ExecuteAction($idSelect, $desc, 3)
      $success = $true
    } catch {
      $lastErr = $_.Exception.Message
      Start-Sleep -Milliseconds 100
    }
  }
  if ($success) { return "TOOL_OK" }
  return "TOOL_ERR $($lastErr -replace '[\\r\\n]+', ' ')"
}

while ($client.Connected) {
  if ($stream.DataAvailable) {
    $line = $reader.ReadLine()
    if ($null -ne $line) {
      if (-not (Test-PhotoshopRunning)) {
        $writer.WriteLine("PS_NOT_RUNNING")
      } else {
        $app = Get-App
        if ($null -eq $app) {
          $writer.WriteLine("APP_NOT_READY")
        } elseif ($line -match '^SET (\\d{1,3}),(\\d{1,3}),(\\d{1,3})$') {
          $writer.WriteLine((Invoke-SetColor $matches[1] $matches[2] $matches[3]))
        } elseif ($line -match '^TOOL (.+)$') {
          $writer.WriteLine((Invoke-SelectTool $matches[1]))
        } elseif ($line -eq "POLL ON") {
          $pollEnabled = $true
          # 재개 직후 현재 색을 한 번 다시 보고하도록 상태를 비운다
          $lastReported = $null
          $prevRead = $null
          $sameCount = 0
          $writer.WriteLine("POLL_OK")
        } elseif ($line -eq "POLL OFF") {
          $pollEnabled = $false
          $writer.WriteLine("POLL_OK")
        } elseif ($line -eq "TEST") {
          try {
            $c = $app.ForegroundColor.RGB
            $writer.WriteLine("TEST_OK APPNAME:$($app.Name) VERSION:$($app.Version) COLOR:$([int]$c.Red),$([int]$c.Green),$([int]$c.Blue)")
          } catch {
            $writer.WriteLine("TEST_ERR $($_.Exception.Message -replace '[\\r\\n]+', ' ')")
          }
        }
      }
    }
  }

  if (Test-PhotoshopRunning) {
    if (-not $script:everReportedAlive) {
      $writer.WriteLine("PS_ALIVE")
      $script:everReportedAlive = $true
    }
    $app = Get-App
    if ($null -ne $app -and $pollEnabled) {
      $current = Read-ForegroundColor
      # 읽기 실패($null)는 아예 없었던 일로 친다 — 안정화 카운트도
      # 초기화하지 않고 다음 루프에서 다시 읽는다.
      if ($null -ne $current) {
        if ($current -eq $prevRead) { $sameCount++ } else { $sameCount = 1 }
        $prevRead = $current
        $need = $STABLE_READS_NORMAL
        if ($current -eq "0,0,0") { $need = $STABLE_READS_BLACK }
        if ($sameCount -ge $need -and $current -ne $lastReported) {
          # [v7.3, v7.7에서 시도했다가 둘 다 되돌림] 도구 태그(CurrentTool
          # 직접 읽기, DoJavaScript로 우회) 둘 다 실측 결과 매번
          # toolName=''만 반환해서 사실상 죽은 신호였다. 태그 없이 보고한다.
          $writer.WriteLine("COLOR $current")
          $lastReported = $current
        }
      }
    }
  } else {
    if ($null -ne $app -or $null -eq $lastReported) {
      $writer.WriteLine("PS_GONE")
    }
    $app = $null
    $lastReported = $null
    $prevRead = $null
    $sameCount = 0
  }

  Start-Sleep -Milliseconds ${LOOP_INTERVAL_MS}
}
`;

function startBridge(onColorChanged, onPhotoshopGone, onPhotoshopAlive) {
  watcherCallback = onColorChanged;
  photoshopGoneCallback = onPhotoshopGone;
  photoshopAliveCallback = onPhotoshopAlive;
  bridgeStopped = false;

  tcpServer = net.createServer((socket) => {
    console.log("[com-bridge] PowerShell 브릿지 연결됨");
    clientSocket = socket;
    socket.setEncoding("utf8");
    // PowerShell 프로세스가 재시작되면 폴링 상태가 기본값(ON)으로
    // 돌아가므로, 꺼둔 상태였다면 다시 알려준다.
    if (!desiredPolling) sendCommand("POLL OFF");

    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) handleLine(line.trim());
    });

    socket.on("close", () => {
      console.warn("[com-bridge] PowerShell 브릿지 연결 끊김");
      if (clientSocket === socket) clientSocket = null;
      failAllPending("연결 끊김");
    });

    socket.on("error", (e) => {
      console.error("[com-bridge] 소켓 에러:", e.message);
    });
  });

  tcpServer.on("error", (e) => {
    console.error("[com-bridge] TCP 서버 에러:", e.message);
  });

  tcpServer.listen(TCP_PORT, "127.0.0.1", () => {
    console.log(`[com-bridge] TCP 서버 시작됨 (127.0.0.1:${TCP_PORT}), PowerShell 스폰 중...`);
    spawnPowerShellClient();
  });

  // 감시(watchdog): PowerShell 프로세스가 종료되지 않았는데도(exit 이벤트가
  // 안 와서 자동 재시작 로직이 안 걸림) 연결이 오래도록 안 되는 상황을
  // 대비한다. 실제로 "명령을 계속 보내는데도 clientSocket이 계속 null"인
  // 상태가 관찰됐는데, 정상적인 종료 경로를 안 탄 것으로 보인다. 이제는
  // 프로세스를 새로 띄운 지 CONNECT_WATCHDOG_MS가 지났는데도 연결이 안
  // 됐으면, 그 프로세스를 강제로 죽이고(그러면 exit 이벤트가 발생해서
  // 기존 재시작 로직이 자연스럽게 이어짐) 다시 시도한다.
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = setInterval(() => {
    if (bridgeStopped) return;
    if (psProcess && !clientSocket && Date.now() - lastSpawnTime > CONNECT_WATCHDOG_MS) {
      console.warn(`[com-bridge] 연결 감시: 프로세스를 띄운 지 ${CONNECT_WATCHDOG_MS}ms가 지났는데도 연결이 안 됨 -> 강제 재시작`);
      try { psProcess.kill(); } catch (e) { /* 이미 죽었을 수도 있음 */ }
    }
  }, 2000);
}

function spawnPowerShellClient() {
  lastSpawnTime = Date.now();
  psProcess = spawn("powershell.exe", [...PS_COMMON_ARGS, "-Command", PS_SCRIPT], { windowsHide: true });

  psProcess.stderr.on("data", (chunk) => {
    console.error("[com-bridge] PowerShell stderr:", chunk.toString().trim());
  });

  psProcess.on("exit", (code) => {
    console.warn(`[com-bridge] PowerShell 프로세스 종료(code=${code})`);
    psProcess = null;
    clientSocket = null;
    failAllPending("PowerShell 프로세스 종료");
    if (!bridgeStopped) {
      setTimeout(spawnPowerShellClient, RECONNECT_DELAY_MS);
    }
  });

  psProcess.on("error", (e) => {
    console.error("[com-bridge] PowerShell 시작 실패 (Windows가 아니거나 PowerShell을 못 찾음):", e.message);
  });
}

function failAllPending(reason) {
  const queue = pendingQueue;
  pendingQueue = [];
  for (const p of queue) {
    clearTimeout(p.timer);
    p.resolve(null, reason);
  }
}

function handleLine(line) {
  if (!line) return;

  // "COLOR r,g,b TAG" 형식(TAG: PAINTING|PICKING) — 지금 선택된 도구가
  // 칠하는 도구인지 아닌지를 함께 실어 보낸다. 혹시 구버전 PowerShell
  // 스크립트가 살아있는 경우(재시작 직후 등)를 대비해 태그 없는 옛
  // 형식("COLOR r,g,b")도 계속 인식하되, 그땐 태그를 null로 전달한다.
  const colorMatch = line.match(/^COLOR (\d{1,3}),(\d{1,3}),(\d{1,3})(?:\s+(PAINTING|PICKING))?$/);
  if (colorMatch) {
    if (watcherCallback) {
      watcherCallback(
        parseInt(colorMatch[1], 10),
        parseInt(colorMatch[2], 10),
        parseInt(colorMatch[3], 10),
        colorMatch[4] || null
      );
    }
    return;
  }

  if (line === "PS_GONE") {
    console.warn("[com-bridge] Photoshop 프로세스가 감지되지 않음");
    if (photoshopGoneCallback) photoshopGoneCallback();
    return;
  }

  if (line === "PS_ALIVE") {
    console.log("[com-bridge] Photoshop이 실행 중임을 처음 확인함");
    if (photoshopAliveCallback) photoshopAliveCallback();
    return;
  }

  // 나머지(SET_OK/SET_ERR/TOOL_OK/TOOL_ERR/TEST_OK/TEST_ERR/PS_NOT_RUNNING/
  // APP_NOT_READY)는 전부 "가장 먼저 보낸 명령에 대한 응답"이다. PowerShell
  // 스크립트가 한 번에 한 명령만 순서대로 처리하므로 큐 순서와 항상
  // 일치한다.
  const pending = pendingQueue.shift();
  if (pending) {
    clearTimeout(pending.timer);
    pending.resolve(line, null);
  } else {
    console.log("[com-bridge] (주인 없는 응답)", line);
  }
}

function sendCommand(cmd, onResponse) {
  if (!clientSocket) {
    console.warn("[com-bridge] 아직 연결 안 됨, 명령 무시:", cmd);
    if (onResponse) onResponse(null, "연결 안 됨");
    return;
  }
  const entry = { resolve: onResponse || (() => {}) };
  entry.timer = setTimeout(() => {
    const idx = pendingQueue.indexOf(entry);
    if (idx !== -1) pendingQueue.splice(idx, 1);
    entry.resolve(null, "응답 타임아웃");
  }, COMMAND_TIMEOUT_MS);
  pendingQueue.push(entry);
  console.log("[com-bridge] 명령 전송:", cmd);
  clientSocket.write(cmd + "\n");
}

function setForegroundColor(r, g, b, onDone) {
  const t0 = Date.now();
  sendCommand(`SET ${r},${g},${b}`, (out, err) => {
    const ms = Date.now() - t0;
    if (err) { console.error(`[com-bridge] setForegroundColor 실패(${ms}ms):`, err); if (onDone) onDone(false); return; }
    if (out === "SET_OK") { console.log(`[com-bridge] setForegroundColor 성공 (${ms}ms)`); if (onDone) onDone(true); return; }
    if (out === "PS_NOT_RUNNING") { console.warn("[com-bridge] setForegroundColor 무시됨: Photoshop이 안 켜져 있음"); if (onDone) onDone(false); return; }
    console.error(`[com-bridge] setForegroundColor 실패(${ms}ms):`, out);
    if (onDone) onDone(false);
  });
}

function activateTool(toolName) {
  const t0 = Date.now();
  sendCommand(`TOOL ${toolName}`, (out, err) => {
    const ms = Date.now() - t0;
    if (err) { console.error(`[com-bridge] activateTool 실패(${ms}ms):`, err); return; }
    if (out === "TOOL_OK") { console.log(`[com-bridge] activateTool 성공 (${ms}ms)`); return; }
    if (out === "PS_NOT_RUNNING") { console.warn("[com-bridge] activateTool 무시됨: Photoshop이 안 켜져 있음"); return; }
    console.error(`[com-bridge] activateTool 실패(${ms}ms):`, out);
  });
}

function testConnection() {
  console.log("[com-bridge] === 진단 테스트 요청 ===");
  const t0 = Date.now();
  sendCommand("TEST", (out, err) => {
    const ms = Date.now() - t0;
    if (err) { console.error(`[com-bridge] === 진단 테스트 실패(${ms}ms) ===`, err); return; }
    if (out === "PS_NOT_RUNNING") { console.warn("[com-bridge] === 진단 테스트: Photoshop이 안 켜져 있음 ==="); return; }
    if (out && out.startsWith("TEST_OK")) { console.log(`[com-bridge] === 진단 테스트 성공 (${ms}ms) ===`, out); return; }
    console.error(`[com-bridge] === 진단 테스트 실패(${ms}ms) ===`, out);
  });
}

// UXP 패널이 연결돼 있는 동안에는 COM 전경색 읽기를 멈춘다(펜 스트로크
// 중 Photoshop을 불필요하게 두드리지 않도록). Photoshop 생존 감지는 계속된다.
function setPolling(enabled) {
  enabled = !!enabled;
  if (enabled === desiredPolling) return;
  desiredPolling = enabled;
  if (clientSocket) sendCommand(enabled ? "POLL ON" : "POLL OFF");
}

function stopBridge() {
  bridgeStopped = true;
  if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
  if (psProcess) { psProcess.kill(); psProcess = null; }
  if (tcpServer) { tcpServer.close(); tcpServer = null; }
}

module.exports = {
  startBridge,
  setForegroundColor,
  activateTool,
  testConnection,
  setPolling,
  stopBridge
};
