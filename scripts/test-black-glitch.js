#!/usr/bin/env node
// main.js의 실제 applyIncomingColor 블록을 추출해 가짜 시계로 시나리오 테스트한다.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'main.js'), 'utf8');
const a = src.indexOf('let lastAppliedColor = null;');
const b = src.indexOf('handleExternalColor = receiveUntrustedColor');
if (a < 0 || b < 0) { console.error('추출 마커를 찾지 못함 — main.js 구조가 바뀌었는지 확인'); process.exit(2); }
const block = src.slice(a, b);

function makeEnv() {
  const env = { now: 1_000_000, _h: [], lastSet: -1e9, timers: [] };
  // 가짜 타이머: env.tick()이 시간을 흘리면서 만기된 타이머를 순서대로 실행한다.
  let seq = 0;
  const fakeSetTimeout = (fn, ms) => { const t = { id: ++seq, at: env.now + ms, fn }; env.timers.push(t); return t.id; };
  const fakeClearTimeout = (id) => { env.timers = env.timers.filter((t) => t.id !== id); };
  const factory = new Function('env', 'Date', 'setTimeout', 'clearTimeout', `
    const state = { history: env._h };
    let lastSetCommandTime = env.lastSet;
    let popupVisible = false;
    const console = { log() {} };
    const log = () => {}; const logInfo = () => {};
    function pushHistory(r,g,b){ const l=state.history[0]; if(l&&l.r===r&&l.g===g&&l.b===b) return; state.history.unshift({r,g,b}); }
    function setBaseFromRgb(){}
    function sendPopupOpen(){}
    function scheduleHistorySave(){}
    ${block}
    return { apply: receiveUntrustedColor, trusted: applyTrustedColor, setLastSet(t){ lastSetCommandTime = t; }, hist(){ return state.history; } };
  `);
  const FakeDate = { now: () => env.now };
  const api = factory(env, FakeDate, fakeSetTimeout, fakeClearTimeout);
  env.apply = api.apply; env.trusted = api.trusted; env.setLastSet = api.setLastSet;
  Object.defineProperty(env, 'history', { get: api.hist });
  env.tick = (ms) => {
    const end = env.now + ms;
    for (;;) {
      env.timers.sort((x, y) => x.at - y.at);
      const t = env.timers[0];
      if (!t || t.at > end) break;
      env.timers.shift();
      env.now = t.at;
      t.fn();
    }
    env.now = end;
  };
  return env;
}
let fail = 0;
const check = (name, cond, extra = '') => { console.log((cond ? 'OK   ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) fail++; };
const blacks = (e) => e.history.filter((h) => !h.r && !h.g && !h.b).length;

// 1. 의도적 검정(단발)은 히스토리에 남아야 한다 (보류 시간 이후 반영)
{ const e = makeEnv(); e.apply(244,224,0); e.tick(3000); e.apply(0,0,0); e.tick(1000);
  check('의도적 검정 1회 → 히스토리 반영', blacks(e) === 1, JSON.stringify(e.history)); }

// 2. 펜 눌림 왕복 글리치(색→검정→색) 2회 반복 후 검정이 쌓이지 않아야 한다
{ const e = makeEnv(); const c=[244,224,0]; e.apply(...c);
  for (let i=0;i<6;i++){ e.tick(500); e.apply(0,0,0); e.tick(300); e.apply(...c); }
  check('왕복 글리치 반복 → 검정 잔류 0', blacks(e) === 0, 'blacks=' + blacks(e)); }

// 3. 글리치 확정 후에도 의도적 검정(다른 색에서 출발)은 반영돼야 한다
{ const e = makeEnv(); const c=[244,224,0]; e.apply(...c);
  for (let i=0;i<4;i++){ e.tick(500); e.apply(0,0,0); e.tick(300); e.apply(...c); }
  e.tick(10000); e.apply(10,20,30); e.tick(1000); e.apply(0,0,0); e.tick(1000);
  check('글리치 확정 후 다른 색에서 고른 검정 → 반영', blacks(e) >= 1, JSON.stringify(e.history.slice(0,3))); }

// 4. SET 직후 4초 이내 검정은 무시
{ const e = makeEnv(); e.apply(100,100,100); e.setLastSet(e.now); e.tick(600); e.apply(0,0,0);
  check('SET 그레이스 내 검정 무시', blacks(e) === 0); }

// 5. 짧은 글리치(보류 시간 안에 원래 색 복귀)는 처음부터 한 번도 나타나지 않아야 한다
{ const e = makeEnv(); const c=[200,80,40]; e.apply(...c); e.tick(2000);
  let everBlack = false;
  e.apply(0,0,0); for (let i=0;i<3;i++){ e.tick(100); if (blacks(e)) everBlack = true; } e.apply(...c); e.tick(2000);
  check('짧은 글리치(300ms) → 첫 회부터 검정 노출 0', !everBlack && blacks(e) === 0, JSON.stringify(e.history)); }

// 6. 긴 글리치(스트로크 내내 검정, 2초 뒤 원래 색 복귀) → 첫 왕복에 히스토리에서 제거
{ const e = makeEnv(); const c=[30,120,220]; e.apply(...c); e.tick(2000);
  e.apply(0,0,0); e.tick(2000); e.apply(...c); e.tick(500);
  check('긴 글리치 1회 → 복귀 즉시 히스토리에서 제거', blacks(e) === 0, JSON.stringify(e.history)); }

// 7. 신뢰 경로(UXP set 이벤트)의 검정은 즉시, 무조건 반영
{ const e = makeEnv(); e.trusted(10,10,10); e.tick(100); e.trusted(0,0,0);
  check('UXP trusted 검정 → 즉시 반영', blacks(e) === 1 && e.history[0].r === 0, JSON.stringify(e.history)); }

// 8. 검정 보류 중 trusted 색이 오면 보류 검정은 폐기
{ const e = makeEnv(); e.apply(50,60,70); e.tick(1000); e.apply(0,0,0); e.tick(200); e.trusted(90,90,90); e.tick(2000);
  check('보류 중 trusted 색 도착 → 보류 검정 폐기', blacks(e) === 0 && e.history[0].r === 90, JSON.stringify(e.history)); }

// 9. 의도적 검정 후 다른 색 선택 → 검정은 히스토리에 그대로 남아야 한다
{ const e = makeEnv(); e.apply(244,224,0); e.tick(3000); e.apply(0,0,0); e.tick(3000); e.apply(10,200,90); e.tick(500);
  check('의도적 검정 후 다른 색 → 검정 유지', blacks(e) === 1, JSON.stringify(e.history)); }

console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
