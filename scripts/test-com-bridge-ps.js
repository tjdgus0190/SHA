#!/usr/bin/env node
// com-bridge.js의 실제 PS_SCRIPT를 Windows PowerShell로 실행해 검증한다.
//  1) Read-ForegroundColor: 가짜 $app(COM 흉내)으로 "바쁠 때 $null" 상황이
//     검정("0,0,0")으로 새지 않는지
//  2) 전체 스크립트: TCP 접속, PS_GONE/PS_ALIVE, POLL ON/OFF -> POLL_OK, TEST 응답
// Windows 전용. 실제 Photoshop COM 동작은 여기서 검증하지 않는다.
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync, spawn } = require('child_process');

if (process.platform !== 'win32') { console.log('SKIP (Windows 전용)'); process.exit(0); }

const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'com-bridge.js'), 'utf8');
const m = src.match(/const PS_SCRIPT = `([\s\S]*?)`;/);
if (!m) { console.error('PS_SCRIPT 추출 실패'); process.exit(2); }

let fail = 0;
const check = (name, cond, extra = '') => { console.log((cond ? 'OK   ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) fail++; };

// ---- 1) Read-ForegroundColor 단위 테스트 ----
const scriptText = new Function('TCP_PORT', 'LOOP_INTERVAL_MS', 'return `' + m[1] + '`;')(1, 100);
const fn = scriptText.match(/function Read-ForegroundColor \{[\s\S]*?\n\}\n/);
check('Read-ForegroundColor 함수 존재', !!fn);
if (fn) {
  const cases = [
    ['ForegroundColor가 $null', '$app = [pscustomobject]@{ ForegroundColor = $null }', 'NULL'],
    ['RGB가 $null', '$app = [pscustomobject]@{ ForegroundColor = [pscustomobject]@{ RGB = $null } }', 'NULL'],
    ['채널이 $null', '$app = [pscustomobject]@{ ForegroundColor = [pscustomobject]@{ RGB = [pscustomobject]@{ Red = $null; Green = 0; Blue = 0; HexValue = $null } } }', 'NULL'],
    ['0,0,0인데 HexValue 없음', '$app = [pscustomobject]@{ ForegroundColor = [pscustomobject]@{ RGB = [pscustomobject]@{ Red = 0; Green = 0; Blue = 0; HexValue = $null } } }', 'NULL'],
    ['속성 읽기 예외', '$app = [pscustomobject]@{}; $app | Add-Member -MemberType ScriptProperty -Name ForegroundColor -Value { throw "RPC_E_CALL_REJECTED" }', 'NULL'],
    ['진짜 검정', '$app = [pscustomobject]@{ ForegroundColor = [pscustomobject]@{ RGB = [pscustomobject]@{ Red = 0.0; Green = 0.0; Blue = 0.0; HexValue = "000000" } } }', '0,0,0'],
    ['일반 색(소수)', '$app = [pscustomobject]@{ ForegroundColor = [pscustomobject]@{ RGB = [pscustomobject]@{ Red = 243.8; Green = 10.2; Blue = 99; HexValue = "F40A63" } } }', '244,10,99']
  ];
  for (const [name, setup, expect] of cases) {
    const ps = `$ErrorActionPreference = "SilentlyContinue"\n${fn[0]}\n${setup}\n$r = Read-ForegroundColor\nif ($null -eq $r) { "NULL" } else { $r }`;
    const out = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8' });
    const got = (out.stdout || '').trim().split(/\r?\n/).pop();
    check(`Read-ForegroundColor: ${name} → ${expect}`, got === expect, `got="${got}" err=${(out.stderr || '').slice(0, 200)}`);
  }
}

// ---- 2) 전체 스크립트 프로토콜 테스트 (Photoshop 없음 가정) ----
const port = 51999;
const fullScript = new Function('TCP_PORT', 'LOOP_INTERVAL_MS', 'return `' + m[1] + '`;')(port, 100);
const lines = [];
let sock = null;
const server = net.createServer((s) => {
  sock = s; s.setEncoding('utf8'); let buf = '';
  s.on('data', (c) => { buf += c; const parts = buf.split(/\r?\n/); buf = parts.pop(); lines.push(...parts.filter(Boolean)); });
  setTimeout(() => s.write('POLL OFF\n'), 1500);
  setTimeout(() => s.write('POLL ON\n'), 2500);
  setTimeout(() => s.write('TEST\n'), 3500);
  setTimeout(finish, 6000);
});
let ps;
server.listen(port, '127.0.0.1', () => {
  ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', fullScript], { windowsHide: true });
  ps.stderr.on('data', (d) => lines.push('STDERR ' + d.toString().trim()));
});
const guard = setTimeout(() => { check('PowerShell이 TCP에 접속', false, 'timeout'); finish(); }, 30000);
function finish() {
  clearTimeout(guard);
  try { ps && ps.kill(); } catch (e) {}
  server.close();
  const psRunning = spawnSync('powershell.exe', ['-NoProfile', '-Command', '(Get-Process | Where-Object { $_.ProcessName -like "*Photoshop*" }) -ne $null'], { encoding: 'utf8' }).stdout.trim() === 'True';
  check('PowerShell이 TCP에 접속', !!sock);
  check('stderr 없음 (스크립트 파싱/런타임 오류 없음)', !lines.some((l) => l.startsWith('STDERR')), lines.filter((l) => l.startsWith('STDERR')).join(' | '));
  check('POLL OFF/ON 각각 응답', lines.filter((l) => l === 'POLL_OK' || l === 'PS_NOT_RUNNING').length >= 2, JSON.stringify(lines));
  if (!psRunning) {
    check('Photoshop 없음 → PS_GONE 보고', lines.includes('PS_GONE'), JSON.stringify(lines));
    check('TEST → PS_NOT_RUNNING', lines.includes('PS_NOT_RUNNING'));
  } else {
    console.log('INFO Photoshop 실행 중 — 출력:', JSON.stringify(lines.slice(0, 10)));
  }
  console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
  process.exit(fail ? 1 : 0);
}
