#!/usr/bin/env node
// main.js의 실제 applyIncomingColor 블록을 추출해 가짜 시계로 시나리오 테스트한다.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'main.js'), 'utf8');
const a = src.indexOf('let lastAppliedColor = null;');
const b = src.indexOf('handleExternalColor = applyIncomingColor');
if (a < 0 || b < 0) { console.error('추출 마커를 찾지 못함 — main.js 구조가 바뀌었는지 확인'); process.exit(2); }
const block = src.slice(a, b);

function makeEnv() {
  const env = { now: 1_000_000, _h: [], lastSet: -1e9 };
  const factory = new Function('env', 'Date', `
    const state = { history: env._h };
    let lastSetCommandTime = env.lastSet;
    let popupVisible = false;
    const console = { log() {} };
    const log = () => {}; const logInfo = () => {};
    function pushHistory(r,g,b){ const l=state.history[0]; if(l&&l.r===r&&l.g===g&&l.b===b) return; state.history.unshift({r,g,b}); }
    function setBaseFromRgb(){}
    function sendPopupOpen(){}
    ${block}
    return { apply: applyIncomingColor, setLastSet(t){ lastSetCommandTime = t; }, hist(){ return state.history; } };
  `);
  const FakeDate = { now: () => env.now };
  const api = factory(env, FakeDate);
  env.apply = api.apply; env.setLastSet = api.setLastSet;
  Object.defineProperty(env, 'history', { get: api.hist });
  env.tick = (ms) => { env.now += ms; };
  return env;
}
let fail = 0;
const check = (name, cond, extra = '') => { console.log((cond ? 'OK   ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) fail++; };
const blacks = (e) => e.history.filter((h) => !h.r && !h.g && !h.b).length;

// 1. 의도적 검정(단발)은 히스토리에 남아야 한다
{ const e = makeEnv(); e.apply(244,224,0); e.tick(3000); e.apply(0,0,0);
  check('의도적 검정 1회 → 히스토리 반영', blacks(e) === 1, JSON.stringify(e.history)); }

// 2. 펜 눌림 왕복 글리치(색→검정→색) 2회 반복 후 검정이 쌓이지 않아야 한다
{ const e = makeEnv(); const c=[244,224,0]; e.apply(...c);
  for (let i=0;i<6;i++){ e.tick(500); e.apply(0,0,0); e.tick(300); e.apply(...c); }
  check('왕복 글리치 반복 → 검정 잔류 0', blacks(e) === 0, 'blacks=' + blacks(e)); }

// 3. 글리치 확정 후에도 의도적 검정(다른 색에서 출발)은 반영돼야 한다
{ const e = makeEnv(); const c=[244,224,0]; e.apply(...c);
  for (let i=0;i<4;i++){ e.tick(500); e.apply(0,0,0); e.tick(300); e.apply(...c); }
  e.tick(10000); e.apply(10,20,30); e.tick(1000); e.apply(0,0,0);
  check('글리치 확정 후 다른 색에서 고른 검정 → 반영', blacks(e) >= 1, JSON.stringify(e.history.slice(0,3))); }

// 4. SET 직후 4초 이내 검정은 무시
{ const e = makeEnv(); e.apply(100,100,100); e.setLastSet(e.now); e.tick(600); e.apply(0,0,0);
  check('SET 그레이스 내 검정 무시', blacks(e) === 0); }

console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
