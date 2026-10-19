#!/usr/bin/env node
// SHA Paint 정적 검증: 문법 검사 / com-bridge require / PS 템플릿 ${...} 스캔
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const appDir = path.join(__dirname, '..', 'app');
let fail = 0;
const ok = (m) => console.log('OK   ' + m);
const bad = (m) => { fail++; console.log('FAIL ' + m); };

for (const f of fs.readdirSync(appDir).filter((f) => f.endsWith('.js'))) {
  try { execFileSync(process.execPath, ['--check', path.join(appDir, f)], { stdio: 'pipe' }); ok('syntax ' + f); }
  catch (e) { bad('syntax ' + f + '\n' + e.stderr); }
}
for (const f of ['com-bridge.js', 'mac-bridge.js']) {
  try { require(path.join(appDir, f)); ok('require ' + f); }
  catch (e) { bad('require ' + f + ': ' + e.message); }
}
// PS_SCRIPT 템플릿 리터럴 안의 ${...}는 JS 보간이다. 허용: TCP_PORT, LOOP_INTERVAL_MS 등
const src = fs.readFileSync(path.join(appDir, 'com-bridge.js'), 'utf8');
const allowed = new Set(['TCP_PORT', 'LOOP_INTERVAL_MS']);
const start = src.indexOf('const PS_SCRIPT = `');
const end = src.indexOf('\n`;', start);
if (start < 0 || end < 0) bad('PS_SCRIPT 경계를 찾지 못함');
const psBody = src.slice(start, end);
const found = [...psBody.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1].trim());
const unexpected = found.filter((x) => !allowed.has(x));
if (unexpected.length) bad('com-bridge.js 예상치 못한 ${...}: ' + JSON.stringify([...new Set(unexpected)]) + '  (PowerShell 변수는 $($var) 사용)');
else ok('com-bridge.js ${...} 스캔 (' + found.length + '개, 모두 허용 목록)');
console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
