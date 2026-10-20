// mac-bridge.js
// ---------------------------------------------------------------------
// com-bridge.js(Windows, PowerShell+COM)와 완전히 동일한 공개 인터페이스
// (startBridge/setForegroundColor/activateTool/testConnection/stopBridge)
// 를 제공하는 macOS 버전. main.js는 플랫폼에 따라 이 둘 중 하나를 골라
// require하기만 하면 되고, 나머지 코드는 손댈 필요가 없다.
//
// Windows에서 PowerShell + COM(Photoshop.Application)을 썼던 것처럼,
// macOS에서는 `osascript`로 AppleScript를 실행해서 Photoshop의
// **ExtendScript 엔진**을 호출한다 —
//   tell application "Adobe Photoshop 2025" to do javascript "..."
// 이 "do javascript" 안에 들어가는 문자열이 곧 ExtendScript(JavaScript)
// 코드이고, 여기서 Windows COM 브릿지와 완전히 같은 방식(Action Manager:
// executeAction/ActionDescriptor/ActionReference)으로 전경색을 설정한다.
// 직접 프로퍼티 대입(app.foregroundColor = ...)이 최신 Photoshop에서
// 안 먹는다는 보고가 있었던 건 UXP의 DOM 이야기였고, ExtendScript는
// 훨씬 오래되고 안정적인 엔진이라 다를 수 있지만, 안전하게 Windows와
// 동일한 Action Manager 방식으로 통일했다.
//
// *** 이 코드는 실제 macOS + Photoshop 환경에서 검증되지 않았습니다 ***
// (이 작업 환경엔 macOS 자체가 없음). 실행 후 이상하면 콘솔/로그
// 파일의 [mac-bridge] 로그를 그대로 알려주시면 바로 고치겠습니다.
// ---------------------------------------------------------------------

const { execFile } = require("child_process");

const POLL_INTERVAL_MS = 500;
const COMMAND_TIMEOUT_MS = 8000;

let watcherCallback = null;
let photoshopGoneCallback = null;
let photoshopAliveCallback = null;
let watcherStopped = false;

// Photoshop이 지금 실행 중인지 확인하는 AppleScript 조각. Windows의
// Get-Process 역할과 동일 — COM처럼 "Photoshop이 안 떠있는데 automation
// 객체를 부르면 자동으로 실행시켜버리는" 부작용이 AppleScript의
// `tell application` 자체에도 있을 수 있어서(대상 앱이 없으면 Launch
// Services가 자동으로 실행시킴), 반드시 먼저 System Events로 프로세스
// 존재 여부를 확인한 뒤에만 Photoshop에 말을 건다.
function psRunningAppleScript() {
  return `
tell application "System Events"
  set psRunning to (count of (every process whose name contains "Photoshop")) > 0
end tell
return psRunning
`;
}

function findPhotoshopProcessNameAppleScript() {
  return `
tell application "System Events"
  set psProcs to (every process whose name contains "Photoshop")
  if (count of psProcs) > 0 then
    return name of item 1 of psProcs
  else
    return ""
  end if
end tell
`;
}

function runOsascript(script, callback) {
  execFile("osascript", ["-e", script], { timeout: COMMAND_TIMEOUT_MS }, (err, stdout, stderr) => {
    if (callback) callback(err, (stdout || "").trim(), stderr);
  });
}

// ExtendScript(JavaScript) 코드를 만들어서 AppleScript의 "do javascript"로
// 감싸 실행한다. Windows COM 브릿지의 Invoke-SetColor/Invoke-SelectTool과
// 정확히 같은 논리를 ExtendScript로 옮긴 것 — StringIDToTypeID 대신
// ExtendScript는 stringIDToTypeID(소문자 시작)를 쓴다는 것만 다르다.
function buildSetColorExtendScript(r, g, b) {
  return `
(function() {
  try {
    var idSet = app.stringIDToTypeID("set");
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    var idColor = app.stringIDToTypeID("color");
    var idForegroundColor = app.stringIDToTypeID("foregroundColor");
    ref.putProperty(idColor, idForegroundColor);
    var idNull = app.stringIDToTypeID("null");
    desc.putReference(idNull, ref);
    var colorDesc = new ActionDescriptor();
    var idRGBColor = app.stringIDToTypeID("RGBColor");
    colorDesc.putDouble(app.stringIDToTypeID("red"), ${r});
    colorDesc.putDouble(app.stringIDToTypeID("green"), ${g});
    colorDesc.putDouble(app.stringIDToTypeID("blue"), ${b});
    var idTo = app.stringIDToTypeID("to");
    desc.putObject(idTo, idRGBColor, colorDesc);
    executeAction(idSet, desc, DialogModes.NO);
    "SET_OK";
  } catch (e) {
    "SET_ERR " + e.message;
  }
})()
`.replace(/\n/g, " ");
}

function buildSelectToolExtendScript(toolName) {
  return `
(function() {
  try {
    var idSelect = app.stringIDToTypeID("select");
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    var idToolRef = app.stringIDToTypeID("${toolName}");
    ref.putClass(idToolRef);
    var idNull = app.stringIDToTypeID("null");
    desc.putReference(idNull, ref);
    executeAction(idSelect, desc, DialogModes.NO);
    "TOOL_OK";
  } catch (e) {
    "TOOL_ERR " + e.message;
  }
})()
`.replace(/\n/g, " ");
}

function buildGetColorExtendScript() {
  return `
(function() {
  try {
    var c = app.foregroundColor.rgb;
    var toolName = "";
    try { toolName = app.currentTool; } catch (te) {}
    var isPainting = /brush|pencil|eraser|clone|heal|smudge|dodge|burn|sponge|mixer|stamp/i.test(toolName);
    var tag = isPainting ? "PAINTING" : "PICKING";
    "COLOR_OK " + Math.round(c.red) + "," + Math.round(c.green) + "," + Math.round(c.blue) + " " + tag;
  } catch (e) {
    "COLOR_ERR " + e.message;
  }
})()
`.replace(/\n/g, " ");
}

// AppleScript 문자열 리터럴 안에 ExtendScript 코드를 넣으려면 큰따옴표를
// 이스케이프해야 한다.
function wrapDoJavascript(psAppName, extendScript) {
  const escaped = extendScript.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `tell application "${psAppName}" to do javascript "${escaped}"`;
}

let cachedAppName = null;
function withPhotoshopAppName(onReady) {
  if (cachedAppName) { onReady(cachedAppName); return; }
  runOsascript(findPhotoshopProcessNameAppleScript(), (err, out) => {
    if (err || !out) {
      console.error("[mac-bridge] Photoshop 프로세스 이름을 찾을 수 없음 (안 켜져 있을 수 있음):", err && err.message);
      onReady(null);
      return;
    }
    cachedAppName = out;
    onReady(cachedAppName);
  });
}

function setForegroundColor(r, g, b, onDone) {
  const t0 = Date.now();
  withPhotoshopAppName((appName) => {
    if (!appName) { console.warn("[mac-bridge] setForegroundColor 무시됨: Photoshop이 안 켜져 있음"); if (onDone) onDone(false); return; }
    const script = wrapDoJavascript(appName, buildSetColorExtendScript(r, g, b));
    runOsascript(script, (err, out, stderr) => {
      const ms = Date.now() - t0;
      if (err) { console.error(`[mac-bridge] setForegroundColor 실패(${ms}ms):`, err.message, stderr); if (onDone) onDone(false); return; }
      if (out === "SET_OK") { console.log(`[mac-bridge] setForegroundColor 성공 (${ms}ms)`); if (onDone) onDone(true); return; }
      console.error(`[mac-bridge] setForegroundColor 실패(${ms}ms):`, out);
      if (onDone) onDone(false);
    });
  });
}

function activateTool(toolName) {
  withPhotoshopAppName((appName) => {
    if (!appName) { console.warn("[mac-bridge] activateTool 무시됨: Photoshop이 안 켜져 있음"); return; }
    const script = wrapDoJavascript(appName, buildSelectToolExtendScript(toolName));
    runOsascript(script, (err, out, stderr) => {
      if (err) { console.error("[mac-bridge] activateTool 실패:", err.message, stderr); return; }
      if (out === "TOOL_OK") { console.log("[mac-bridge] activateTool 성공"); return; }
      console.error("[mac-bridge] activateTool 실패:", out);
    });
  });
}

function testConnection() {
  console.log("[mac-bridge] === 진단 테스트 요청 ===");
  const t0 = Date.now();
  withPhotoshopAppName((appName) => {
    if (!appName) { console.warn("[mac-bridge] === 진단 테스트: Photoshop이 안 켜져 있음 ==="); return; }
    const script = wrapDoJavascript(appName, buildGetColorExtendScript());
    runOsascript(script, (err, out, stderr) => {
      const ms = Date.now() - t0;
      if (err) { console.error(`[mac-bridge] === 진단 테스트 실패(${ms}ms) ===`, err.message, stderr); return; }
      console.log(`[mac-bridge] === 진단 테스트 성공 (${ms}ms) === APPNAME:${appName} ${out}`);
    });
  });
}

// 폴링(외부 스포이드 감지) — Windows처럼 상시 소켓 연결 대신, 매 주기마다
// osascript를 새로 실행하는 더 단순한 방식을 쓴다. AppleScript는 .NET
// TcpClient 같은 상시 소켓 기반 루프를 짜기가 마땅치 않아서, 여기서는
// 신뢰성을 우선해 "한 번에 하나씩, 매번 새로 실행"하는 v1 스타일로
// 시작한다. 실제로 느리면(Windows COM 초기 버전이 그랬듯) 나중에
// JXA(JavaScript for Automation) + 소켓으로 최적화할 수 있다.
function pollTick() {
  if (watcherStopped) return;
  runOsascript(psRunningAppleScript(), (err, out) => {
    if (watcherStopped) return;
    const running = !err && out === "true";
    if (!running) {
      cachedAppName = null;
      if (photoshopGoneCallback) photoshopGoneCallback();
      scheduleNextPoll();
      return;
    }
    if (photoshopAliveCallback) photoshopAliveCallback();
    withPhotoshopAppName((appName) => {
      if (!appName) { scheduleNextPoll(); return; }
      const script = wrapDoJavascript(appName, buildGetColorExtendScript());
      runOsascript(script, (err2, out2) => {
        if (!err2 && out2 && out2.startsWith("COLOR_OK")) {
          const m = out2.match(/COLOR_OK (\d{1,3}),(\d{1,3}),(\d{1,3})(?:\s+(PAINTING|PICKING))?/);
          if (m && watcherCallback) {
            watcherCallback(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), m[4] || null);
          }
        }
        scheduleNextPoll();
      });
    });
  });
}

let pollTimer = null;
function scheduleNextPoll() {
  if (watcherStopped) return;
  pollTimer = setTimeout(pollTick, POLL_INTERVAL_MS);
}

function startBridge(onColorChanged, onPhotoshopGone, onPhotoshopAlive) {
  watcherCallback = onColorChanged;
  photoshopGoneCallback = onPhotoshopGone;
  photoshopAliveCallback = onPhotoshopAlive;
  watcherStopped = false;
  console.log("[mac-bridge] AppleScript 기반 감시 시작됨 (폴링 방식)");
  pollTick();
}

// com-bridge.js와 인터페이스를 맞추기 위한 자리. macOS 폴링은 아직
// 일시정지를 지원하지 않는다(실기 검증 전).
function setPolling(_enabled) {}

function stopBridge() {
  watcherStopped = true;
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
}

module.exports = {
  startBridge,
  setForegroundColor,
  activateTool,
  testConnection,
  setPolling,
  stopBridge
};
