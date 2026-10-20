#!/usr/bin/env node
// uxp-plugin/index.js를 가짜 uxp/photoshop 모듈로 로드해서, Photoshop 없이
// 이벤트 → 오버레이 앱 전송 경로를 검증한다. (실제 Photoshop이 보내는
// 디스크립터 모양은 실기 로그로 최종 확인 필요 — 여기선 문서화된 형태 기준)
const path = require('path');
const Module = require('module');

const listeners = {};
let fg = { r: 10, g: 20, b: 30 };
let fgThrows = false;
const sent = [];
const timers = [];
let now = 0;

const fakePhotoshop = {
  app: {
    get foregroundColor() {
      if (fgThrows) throw new Error('busy');
      return { rgb: { red: fg.r, green: fg.g, blue: fg.b, hexValue: '' } };
    },
    SolidColor: function () { this.rgb = {}; }
  },
  action: {
    addNotificationListener(events, fn) { for (const e of events) listeners[e] = fn; },
    batchPlay: async () => []
  },
  core: { executeAsModal: async (fn) => fn() }
};
const fakeUxp = { entrypoints: { setProvider() {} } };

const origLoad = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'uxp') return fakeUxp;
  if (req === 'photoshop') return fakePhotoshop;
  return origLoad.call(this, req, ...rest);
};

function stubEl() {
  return {
    style: {}, classList: { toggle() {} }, addEventListener() {}, appendChild() {},
    getContext: () => new Proxy({}, { get: () => () => {} }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
    width: 60, height: 60, clientWidth: 60, clientHeight: 60, hidden: true, textContent: '', innerHTML: ''
  };
}
let domReady = null;
global.document = {
  addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') domReady = fn; },
  getElementById: stubEl, querySelector: stubEl,
  createDocumentFragment: stubEl, createElement: stubEl
};
global.window = { addEventListener() {} };
class FakeWS {
  constructor() { this.readyState = 1; this.h = {}; FakeWS.inst = this; }
  addEventListener(ev, fn) { this.h[ev] = fn; }
  send(s) { sent.push(JSON.parse(s)); }
}
FakeWS.OPEN = 1;
global.WebSocket = FakeWS;
global.setTimeout = (fn, ms) => { timers.push({ at: now + (ms || 0), fn }); return timers.length; };
global.setInterval = (fn, ms) => { const loop = () => { fn(); timers.push({ at: now + ms, fn: loop }); }; timers.push({ at: now + ms, fn: loop }); };
global.clearTimeout = () => {};
function tick(ms) {
  const end = now + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at);
    if (!timers.length || timers[0].at > end) break;
    const t = timers.shift(); now = t.at; t.fn();
  }
  now = end;
}

require(path.join(__dirname, '..', 'uxp-plugin', 'index.js'));
domReady();
FakeWS.inst.h.open();

let fail = 0;
const check = (name, cond, extra = '') => { console.log((cond ? 'OK   ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) fail++; };
const colorMsgs = () => sent.filter((m) => m.type === 'foregroundColor');
const last = () => colorMsgs().slice(-1)[0];

check('연결 직후 hello(protocol 2) 전송', sent.some((m) => m.type === 'hello' && m.protocol === 2));

// 1. 스포이드 set 이벤트 — Photoshop 정식 키 "grain"
sent.length = 0;
listeners.set('set', { _target: [{ _ref: 'color', _property: 'foregroundColor' }], to: { _obj: 'RGBColor', red: 200, grain: 100.4, blue: 50 } });
check('set 이벤트 grain 키 직접 추출 → trusted 전송', last() && last().trusted && last().r === 200 && last().g === 100 && last().b === 50, JSON.stringify(sent));

// 2. 스포이드로 고른 진짜 검정 — trusted로 그대로 전달
sent.length = 0;
listeners.set('set', { _target: [{ _ref: 'color', _property: 'foregroundColor' }], to: { _obj: 'RGBColor', red: 0, grain: 0, blue: 0 } });
check('set 이벤트 검정 → trusted 검정 전송', last() && last().trusted && last().r === 0 && last().g === 0 && last().b === 0);

// 3. HSB 형태
sent.length = 0;
listeners.set('set', { _target: [{ _ref: 'color', _property: 'foregroundColor' }], to: { _obj: 'HSBColorClass', hue: { _unit: 'angleUnit', _value: 120 }, saturation: 100, brightness: 100 } });
check('HSB 디스크립터 → rgb(0,255,0)', last() && last().r === 0 && last().g === 255 && last().b === 0, JSON.stringify(last()));

// 4. 배경색 set 이벤트는 무시
sent.length = 0;
listeners.set('set', { _target: [{ _ref: 'color', _property: 'backgroundColor' }], to: { _obj: 'RGBColor', red: 1, grain: 2, blue: 3 } });
check('배경색 set 이벤트 → 무시', colorMsgs().length === 0, JSON.stringify(sent));

// 5. 폴링 중 펜 글리치(검정이 계속 읽혀도) → 오버레이로 검정이 새어나가지 않음
sent.length = 0;
fg = { r: 0, g: 0, b: 0 };
tick(5000);
check('폴링으로 검정이 읽혀도 전송 0', !colorMsgs().some((m) => m.r === 0 && m.g === 0 && m.b === 0), JSON.stringify(colorMsgs()));

// 6. 순간 튐(1회만 다른 값) → 전송 안 함 / 안정된 새 색 → untrusted 1회 전송
sent.length = 0;
fg = { r: 77, g: 88, b: 99 }; tick(700); fg = { r: 1, g: 1, b: 1 }; tick(700); fg = { r: 77, g: 88, b: 99 }; tick(700);
check('한 번만 튄 값 → 전송 0', colorMsgs().length === 0, JSON.stringify(colorMsgs()));
tick(1400);
check('안정된 새 색(3회 연속) → untrusted 전송', colorMsgs().length === 1 && !colorMsgs()[0].trusted && colorMsgs()[0].r === 77);

// 7. D 키(reset) → trusted 검정
sent.length = 0;
listeners.reset('reset', { _target: [{ _ref: 'color', _property: 'colors' }] });
check('reset(D) 이벤트 → trusted 검정', last() && last().trusted && last().r === 0);

// 8. 읽기 예외(바쁨) 중에도 크래시 없이 무시
sent.length = 0; fgThrows = true; tick(3000); fgThrows = false;
check('읽기 예외 중 전송 0, 크래시 없음', colorMsgs().length === 0);

// 9. 오버레이 setColor(id) → setResult ack
sent.length = 0;
FakeWS.inst.h.message({ data: JSON.stringify({ type: 'setColor', r: 5, g: 6, b: 7, id: 42 }) });
tick(500);
setImmediate(() => {
  const ack = sent.find((m) => m.type === 'setResult');
  check('setColor(id) → setResult ack(ok)', ack && ack.id === 42 && ack.ok === true, JSON.stringify(sent));
  console.log(fail ? `\n${fail}건 실패` : '\n전부 통과');
  process.exit(fail ? 1 : 0);
});
