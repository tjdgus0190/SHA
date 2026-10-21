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

// 패키징 누락 검사: 인스톨러에 들어가는 파일 목록(build.files)에 앱 런타임
// 파일이 전부 들어 있는지. 빠지면 설치판에서만 require/loadFile이 실패한다.
const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
const shipped = new Set(pkg.build.files);
const runtime = fs.readdirSync(appDir).filter((f) => /\.(js|html|css)$/.test(f));
const missing = runtime.filter((f) => !shipped.has(f));
if (missing.length) bad('package.json build.files 누락: ' + missing.join(', '));
else ok('package.json build.files에 런타임 파일 ' + runtime.length + '개 모두 포함');
for (const r of pkg.build.extraResources || []) {
  if (fs.existsSync(path.join(appDir, r.from))) ok('extraResources 존재: ' + r.from);
  else bad('extraResources 없음: ' + r.from);
}
if (pkg.build.nsis && pkg.build.nsis.include && !fs.existsSync(path.join(appDir, pkg.build.nsis.include))) bad('nsis.include 없음: ' + pkg.build.nsis.include);

// 출시 준비 경고(실패로 치지 않음)
const lic = fs.readFileSync(path.join(appDir, 'licensing.js'), 'utf8');
const nsh = fs.readFileSync(path.join(appDir, 'build', 'installer.nsh'), 'utf8');
const pidJs = (lic.match(/const GUMROAD_PRODUCT_ID = "([^"]*)";/) || [])[1];
const pidNsh = (nsh.match(/!define SHA_GUMROAD_PRODUCT_ID "([^"]*)"/) || [])[1];
if (pidJs !== pidNsh) bad(`상품 ID 불일치: licensing.js="${pidJs}" / installer.nsh="${pidNsh}"`);
else ok('licensing.js와 installer.nsh의 Gumroad 상품 ID 일치');
if (/const GUMROAD_PRODUCT_ID = "";/.test(lic)) console.log('WARN licensing.js GUMROAD_PRODUCT_ID가 비어 있음 — 라이선스 확인이 꺼진 개발 모드. 출시 빌드 전에 설정 필요');

// 화면 문구(i18n): HTML의 data-i18n*와 코드의 t("...")가 쓰는 키가 ko/en 둘 다에 있는지,
// 화면 HTML에 번역 안 된 한글이 남아 있지 않은지(주석·<style> 제외)
const { STRINGS } = require(path.join(appDir, 'i18n.js'));
const used = new Set();
for (const f of fs.readdirSync(appDir).filter((f) => /\.(js|html)$/.test(f) && f !== 'i18n.js')) {
  const src = fs.readFileSync(path.join(appDir, f), 'utf8');
  for (const m of src.matchAll(/data-i18n(?:-title|-placeholder)?="([\w.]+)"/g)) used.add(m[1]);
  for (const m of src.matchAll(/\b(?:i18n\.)?t\(\s*["'`]([a-z]+\.[\w.]+)["'`]/g)) used.add(m[1]);
  for (const m of src.matchAll(/i18n\.t\(`(mouse)\.\$\{/g)) ['mouse.1', 'mouse.2', 'mouse.3'].forEach((k) => used.add(k));
  if (f.endsWith('.html')) {
    const visible = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<option value="ko">한국어<\/option>/g, '');
    const left = visible.split('\n').filter((l) => /[가-힣]/.test(l) && !/data-i18n/.test(l));
    if (left.length) bad(`${f}: data-i18n 없이 남은 한글 ${left.length}줄 — ${left[0].trim().slice(0, 60)}`);
  }
}
const missingKeys = [...used].filter((k) => !STRINGS.ko[k] || !STRINGS.en[k]);
if (missingKeys.length) bad('i18n 키 누락(ko/en): ' + missingKeys.join(', '));
else ok(`i18n: 화면에서 쓰는 키 ${used.size}개 모두 ko/en에 있음`);
const onlyOne = Object.keys(STRINGS.ko).filter((k) => !STRINGS.en[k]).concat(Object.keys(STRINGS.en).filter((k) => !STRINGS.ko[k]));
if (onlyOne.length) bad('i18n: 한쪽 언어에만 있는 키: ' + onlyOne.join(', '));

console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
