const uxp = require("uxp");
const { entrypoints } = uxp;
const { app, action, core } = require("photoshop");
const {
  rgbToLab,
  relativeLuminance,
  labFieldPixel,
  lumaFieldPixel,
  polarToAB,
  abToPolar,
  findMaxChromaForHue,
  labToRgb
} = require("./colorMath.js");

// 오버레이 앱(main.js)과의 프로토콜 버전. 2부터 hello/setResult(ack)를 지원해서
// 오버레이 앱이 COM과 중복으로 SET을 보내지 않는다.
const PLUGIN_VERSION = "1.1.0";
const OVERLAY_PROTOCOL = 2;

// ---------------------------------------------------------------------
// 상태 모델: 극좌표 (L 또는 Y, chroma/sat, hue)로 "지금 선택된 색"을
// 표현한다. 필드 드래그, 명도 슬라이더, 키보드 스텝, 스포이드 자동감지가
// 전부 이 하나의 상태를 갱신하고, 그 결과를 화면(필드+커서+스와치)과
// 실제 Photoshop 전경색에 반영한다.
// ---------------------------------------------------------------------

const HUE_SMALL_STEP_DEG = 15;
const HUE_BIG_STEP_DEG = 60;
const CHROMA_STEP_RATIO = 0.15; // 그 hue의 최대 chroma 대비 비율
const HISTORY_MAX = 8;
const COMMIT_DEBOUNCE_MS = 90;
const FIELD_RANGE = 130; // a,b 또는 극좌표 반경이 매핑되는 최대값

const state = {
  mode: "lab",       // "lab" | "luma"
  L: 50,              // lab 모드: L* (0-100)
  Y: 0.2,              // luma 모드: 상대휘도 (0-1)
  chroma: 0,           // 현재 채도(극좌표 반경). lab: 0~약150, luma: 0~FIELD_RANGE(=1.0 환산)
  hueDeg: 0,
  ready: false,
  pendingRefresh: false,
  history: [],
  prevRgb: { r: 90, g: 90, b: 90 }
};

const el = {};
let fieldCtx = null;
let dragging = false;

// ---------------- 화면 문구(한국어/영어) ----------------
// Photoshop UI 언어(uxp.host.uiLocale, 예: "ko_KR", "en_US")가 한국어면 한국어, 그 외엔 영어.
// 로그(console)는 번역하지 않는다.
const UI_LANG = (() => {
  try { return /^ko/i.test((uxp.host && uxp.host.uiLocale) || "") ? "ko" : "en"; } catch (e) { return "en"; }
})();
const UI_STR = {
  ko: {
    eyedropperTitle: "스포이드 모드로 전환 (단축키 배정 가능)",
    modeTitle: "모드 전환: Lab L* / 상대휘도 Y",
    refreshTitle: "전경색 기준으로 새로고침",
    hint: "필드 드래그: 색상/채도 선택 &nbsp;|&nbsp; 슬라이더 드래그: 명도 &nbsp;|&nbsp; 스포이드 아이콘(또는 배정한 단축키): 찍은 색 기준 자동 갱신 &nbsp;|&nbsp; <b>Edit &gt; Keyboard Shortcuts &gt; Plugins</b>에서 hue/chroma 단축키도 계속 사용 가능",
    noCanvas: "캔버스 2D 컨텍스트를 가져오지 못했습니다 (환경 제약 가능성)",
    canvasInitFailed: "캔버스 초기화 실패:\n",
    readFgFailed: "전경색을 읽지 못했습니다.",
    applyFgFailed: "전경색 적용 실패: ",
    eyedropperOn: "스포이드 모드 — 캔버스를 클릭해 색을 추출하세요",
    eyedropperFailed: "스포이드 전환 실패: ",
    brushBack: "브러시 도구로 복귀했습니다",
    brushFailed: "브러시 전환 실패: ",
    renderError: "필드 렌더링 오류:\n",
    stepError: "{name} 오류: "
  },
  en: {
    eyedropperTitle: "Switch to eyedropper mode (you can assign a shortcut)",
    modeTitle: "Switch mode: Lab L* / relative luminance Y",
    refreshTitle: "Refresh from the foreground color",
    hint: "Drag the field: hue/chroma &nbsp;|&nbsp; Drag the slider: lightness &nbsp;|&nbsp; Eyedropper icon (or your shortcut): update from the sampled color &nbsp;|&nbsp; Hue/chroma shortcuts still work via <b>Edit &gt; Keyboard Shortcuts &gt; Plugins</b>",
    noCanvas: "Couldn't get the canvas 2D context (the environment may not support it)",
    canvasInitFailed: "Canvas setup failed:\n",
    readFgFailed: "Couldn't read the foreground color.",
    applyFgFailed: "Couldn't apply the foreground color: ",
    eyedropperOn: "Eyedropper mode — click the canvas to sample a color",
    eyedropperFailed: "Couldn't switch to the eyedropper: ",
    brushBack: "Switched back to the brush tool",
    brushFailed: "Couldn't switch to the brush: ",
    renderError: "Field rendering error:\n",
    stepError: "{name} error: "
  }
};
function tr(key, vars) {
  let s = UI_STR[UI_LANG][key] || UI_STR.ko[key] || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  return s;
}
function applyStaticText() {
  const set = (id, prop, key) => { const e = document.getElementById(id); if (e) e[prop] = tr(key); };
  set("eyedropperBtn", "title", "eyedropperTitle");
  set("modeBtn", "title", "modeTitle");
  set("refreshBtn", "title", "refreshTitle");
  set("hintText", "innerHTML", "hint");
}

document.addEventListener("DOMContentLoaded", () => {
  cacheEls();
  applyStaticText();
  try {
    fieldCtx = el.fieldCanvas.getContext("2d");
    if (!fieldCtx) {
      console.error("[LuminancePicker] canvas.getContext('2d')가 null/undefined를 반환함");
      showFieldError(tr("noCanvas"));
    }
  } catch (e) {
    console.error("[LuminancePicker] getContext 호출 자체가 실패", e);
    showFieldError(tr("canvasInitFailed") + (e && e.stack ? e.stack : String(e)));
  }
  wireInteractions();
  state.ready = true;
  refreshBaseFromForeground(true);
  if (state.pendingRefresh) {
    state.pendingRefresh = false;
    refreshBaseFromForeground(true);
  }
  // 안전망 폴링. 색 변경은 원래 set/exchange/reset 이벤트로 받는다. 이
  // 폴링은 이벤트가 놓친 경우만을 위한 것이라, 펜 스트로크 중 순간적으로
  // 잘못 읽힌 값(특히 검정)이 새어나가지 않도록 같은 값이 연속
  // STABLE_POLL_READS번 읽혀야만 반영하고, 검정은 이 경로로는 절대
  // 반영하지 않는다(검정은 이벤트 경로로만 들어온다).
  setInterval(stablePollForeground, STABLE_POLL_MS);
});

function cacheEls() {
  el.fieldCanvas = document.getElementById("fieldCanvas");
  el.fieldCursor = document.getElementById("fieldCursor");
  el.fieldWrap = document.querySelector(".field-wrap");
  el.lightnessTrack = document.getElementById("lightnessTrack");
  el.lightnessHandle = document.getElementById("lightnessHandle");
  el.currentSwatch = document.getElementById("currentSwatch");
  el.prevSwatch = document.getElementById("prevSwatch");
  el.currentHex = document.getElementById("currentHex");
  el.currentLumaInfo = document.getElementById("currentLumaInfo");
  el.eyedropperBtn = document.getElementById("eyedropperBtn");
  el.modeBtn = document.getElementById("modeBtn");
  el.refreshBtn = document.getElementById("refreshBtn");
  el.historyStrip = document.getElementById("historyStrip");
  el.statusMsg = document.getElementById("statusMsg");
  el.fieldErrorMsg = document.getElementById("fieldErrorMsg");
}

function showStatus(message, kind) {
  if (!el.statusMsg) return;
  if (!message) { el.statusMsg.hidden = true; return; }
  el.statusMsg.hidden = false;
  el.statusMsg.textContent = message;
  el.statusMsg.className = "status " + (kind || "");
  if (kind === "ok") {
    setTimeout(() => { if (el.statusMsg.textContent === message) el.statusMsg.hidden = true; }, 1200);
  }
}

// 필드 렌더링 에러 전용 배너. 위 showStatus()와 완전히 분리된 이유:
// showStatus는 색 적용 성공/실패 등 여러 곳에서 공유하는 상태 표시줄이라
// 필드 에러가 뜬 직후 다른 성공 메시지가 곧바로 그걸 지워버려서
// "메시지가 순식간에 사라진다"는 문제가 있었다. 이 배너는 renderField가
// 성공할 때만 지워지고, 그 외에는 절대 자동으로 사라지지 않는다.
function showFieldError(message) {
  if (!el.fieldErrorMsg) return;
  el.fieldErrorMsg.hidden = false;
  el.fieldErrorMsg.textContent = message;
}
function clearFieldError() {
  if (!el.fieldErrorMsg) return;
  el.fieldErrorMsg.hidden = true;
}

// ---------------------------------------------------------------------
// OS 오버레이 앱 연동 (luminance-overlay-app)
// ---------------------------------------------------------------------

const OVERLAY_WS_URL = "ws://localhost:51837";
const OVERLAY_RECONNECT_MS = 4000;
let overlaySocket = null;

// UDT(UXP Developer Tool)의 Inspect 콘솔을 못 쓰는 상황을 위해, 여기서
// 찍는 로그를 이미 연결돼 있는 WebSocket으로 오버레이 앱에도 그대로
// 보낸다. 오버레이 앱은 npm start를 실행한 일반 터미널에 그대로 찍어주므로,
// 사용자는 그 터미널 하나만 보고도 UXP 쪽 로그를 확인할 수 있다.
function dlog(...args) {
  console.log(...args);
  try {
    if (overlaySocket && overlaySocket.readyState === WebSocket.OPEN) {
      overlaySocket.send(JSON.stringify({ type: "log", message: args.map(String).join(" ") }));
    }
  } catch (e) { /* 로그 전달 자체가 실패해도 무시 (원래 console.log는 이미 찍었음) */ }
}

function connectOverlayApp() {
  try {
    overlaySocket = new WebSocket(OVERLAY_WS_URL);
  } catch (e) {
    // 예전 버그: 여기서 생성 자체가 실패하면(예: manifest.json 네트워크
    // 권한이 어떤 이유로 그 순간 적용 안 됐거나, 일시적 오류) 재시도
    // 스케줄조차 안 걸리고 그냥 영원히 포기했다 — 로그도 없어서 뭐가
    // 잘못됐는지 알 방법도 없었다. 이제는 실패해도 반드시 로그를 남기고
    // close 핸들러와 동일하게 재시도를 예약한다.
    console.error("[LuminancePicker] 오버레이 앱 WebSocket 생성 실패:", e && e.message ? e.message : e);
    setTimeout(connectOverlayApp, OVERLAY_RECONNECT_MS);
    return;
  }
  overlaySocket.addEventListener("open", () => {
    console.log("[LuminancePicker] 오버레이 앱에 연결됨 (ws://localhost:51837)");
    try {
      overlaySocket.send(JSON.stringify({ type: "hello", protocol: OVERLAY_PROTOCOL, version: PLUGIN_VERSION }));
    } catch (e) { /* 무시 */ }
    sendForegroundToOverlay(currentRgb(), true);
  });
  overlaySocket.addEventListener("message", (evt) => {
    try {
      const data = JSON.parse(evt.data);
      dlog("[LuminancePicker] 오버레이 앱으로부터 메시지 수신:", JSON.stringify(data));
      if (data.type === "setColor") {
        pickColorFromRgb(data.r, data.g, data.b, { fromOverlay: true }).then((ok) => {
          if (data.id !== undefined && overlaySocket && overlaySocket.readyState === WebSocket.OPEN) {
            overlaySocket.send(JSON.stringify({ type: "setResult", id: data.id, ok: !!ok }));
          }
        });
      }
      if (data.type === "activateEyedropper") activateEyedropperTool();
      if (data.type === "activateBrush") activateBrushTool();
    } catch (e) {
      console.error("[LuminancePicker] 오버레이 앱 메시지 파싱 실패:", e && e.message ? e.message : e, "원본:", evt.data);
    }
  });
  overlaySocket.addEventListener("error", (evt) => {
    console.error("[LuminancePicker] 오버레이 앱 WebSocket 에러:", evt && evt.message ? evt.message : evt);
  });
  overlaySocket.addEventListener("close", () => {
    console.warn("[LuminancePicker] 오버레이 앱 연결 끊김, " + (OVERLAY_RECONNECT_MS / 1000) + "초 후 재시도");
    overlaySocket = null;
    setTimeout(connectOverlayApp, OVERLAY_RECONNECT_MS);
  });
}

function sendForegroundToOverlay(rgb, trusted) {
  if (!overlaySocket || overlaySocket.readyState !== WebSocket.OPEN) return;
  const { r, g, b } = rgb || currentRgb();
  overlaySocket.send(JSON.stringify({ type: "foregroundColor", r, g, b, trusted: !!trusted }));
}

// ---------------------------------------------------------------------
// Photoshop 색상 IO (폴백 포함)
// ---------------------------------------------------------------------

function readForegroundColor() {
  try {
    const fg = app.foregroundColor;
    const r = Math.round(fg.rgb.red), g = Math.round(fg.rgb.green), b = Math.round(fg.rgb.blue);
    if ([r, g, b].every(Number.isFinite)) { showStatus("", null); return { r, g, b }; }
  } catch (e) { console.warn("[LuminancePicker] fg read failed", e); }
  try {
    const hex = app.foregroundColor.rgb.hexValue;
    if (typeof hex === "string") {
      const num = parseInt(hex, 16);
      return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }
  } catch (e) { console.warn("[LuminancePicker] fg hex fallback failed", e); }
  showStatus(tr("readFgFailed"), "error");
  return currentRgb();
}

let suppressAutoRefresh = false;

async function setForegroundColorNow(r, g, b) {
  suppressAutoRefresh = true;
  try {
    return await setForegroundColorInner(r, g, b);
  } finally {
    setTimeout(() => { suppressAutoRefresh = false; }, 60);
  }
}

async function setForegroundColorInner(r, g, b) {
  try {
    await core.executeAsModal(async () => {
      await action.batchPlay(
        [{ _obj: "set", _target: [{ _ref: "color", _property: "foregroundColor" }],
           to: { _obj: "RGBColor", red: r, green: g, blue: b },
           _options: { dialogOptions: "dontDisplay" } }],
        { synchronousExecution: true }
      );
    }, { commandName: "Set Foreground Color (SHA Paint)" });
    showStatus("", null);
    return true;
  } catch (e1) { console.warn("[LuminancePicker] batchPlay failed, fallback", e1); }
  try {
    await core.executeAsModal(async () => {
      const color = new app.SolidColor();
      color.rgb.red = r; color.rgb.green = g; color.rgb.blue = b;
      app.foregroundColor = color;
    }, { commandName: "Set Foreground Color (SHA Paint, fallback)" });
    showStatus("", null);
    return true;
  } catch (e2) {
    console.error("[LuminancePicker] all set strategies failed", e2);
    showStatus(tr("applyFgFailed") + (e2 && e2.message ? e2.message : e2), "error");
    return false;
  }
}

// 스포이드 도구로 전환 (실제 클릭/샘플링은 사용자가 캔버스에서 직접)
async function activateEyedropperTool() {
  try {
    await core.executeAsModal(async () => {
      await action.batchPlay(
        [{ _obj: "select", _target: [{ _ref: "eyedropperTool" }], dontRecord: true, forceNotify: true }],
        { synchronousExecution: true }
      );
    }, { commandName: "Activate Eyedropper (SHA Paint)" });
    showStatus(tr("eyedropperOn"), "ok");
  } catch (e) {
    console.error("[LuminancePicker] eyedropper 전환 실패", e);
    showStatus(tr("eyedropperFailed") + (e && e.message ? e.message : e), "error");
  }
}

// F12 토글의 두 번째 단계: 스포이드에서 브러시로 복귀.
// Photoshop 액션 매니저 참조명은 "paintbrushTool" (브러시 도구).
async function activateBrushTool() {
  try {
    await core.executeAsModal(async () => {
      await action.batchPlay(
        [{ _obj: "select", _target: [{ _ref: "paintbrushTool" }], dontRecord: true, forceNotify: true }],
        { synchronousExecution: true }
      );
    }, { commandName: "Activate Brush Tool (SHA Paint)" });
    showStatus(tr("brushBack"), "ok");
  } catch (e) {
    console.error("[LuminancePicker] 브러시 도구 전환 실패", e);
    showStatus(tr("brushFailed") + (e && e.message ? e.message : e), "error");
  }
}

// ---------------------------------------------------------------------
// 상태 <-> 색 변환
// ---------------------------------------------------------------------

function currentRgb() {
  const { a, b } = polarToAB(state.chroma, state.hueDeg);
  let rgb;
  if (state.mode === "lab") {
    rgb = labFieldPixel(state.L, a, b) || labFieldPixel(state.L, a, b, true);
  } else {
    rgb = lumaFieldPixel(state.Y, state.hueDeg, Math.min(1, state.chroma / FIELD_RANGE));
  }
  return rgb || { r: 128, g: 128, b: 128 };
}

function clampChromaToGamut() {
  if (state.mode === "lab") {
    const maxC = findMaxChromaForHue(state.L, state.hueDeg);
    state.chroma = Math.min(state.chroma, maxC);
  } else {
    state.chroma = Math.min(state.chroma, FIELD_RANGE);
  }
}

// ---------------------------------------------------------------------
// 필드(비정형 블롭) 렌더링
// ---------------------------------------------------------------------
// 원래는 createImageData/putImageData로 픽셀 단위로 그렸는데, Photoshop
// UXP의 캔버스 2D 구현이 이 API를 지원하지 않는다는 게 실제로 확인됐다
// ("fieldCtx.createImageData is not a function"). 그래서 모든 캔버스
// 구현이 기본으로 지원하는 fillRect로, 작은 타일을 촘촘히 채워서 같은
// 모양을 만드는 방식으로 바꿨다. 완전한 픽셀 단위보다는 살짝 거칠지만
// (TILE_STEP=3px 간격), 비정형 블롭의 형태와 색은 동일하게 나온다.
const FIELD_TILE_STEP = 3;

function renderField() {
  try {
    const w = el.fieldCanvas.width, h = el.fieldCanvas.height;
    const cx = w / 2, cy = h / 2;
    const scale = FIELD_RANGE / Math.min(cx, cy);

    fieldCtx.clearRect(0, 0, w, h);

    for (let py = 0; py < h; py += FIELD_TILE_STEP) {
      for (let px = 0; px < w; px += FIELD_TILE_STEP) {
        // 타일 중심점 기준으로 색 계산 (경계가 더 자연스러움)
        const cxPx = px + FIELD_TILE_STEP / 2;
        const cyPx = py + FIELD_TILE_STEP / 2;
        const a = (cxPx - cx) * scale;
        const b = (cyPx - cy) * scale;
        let rgb = null;
        if (state.mode === "lab") {
          rgb = labFieldPixel(state.L, a, b);
        } else {
          const { chroma, hueDeg } = abToPolar(a, b);
          const sat = chroma / FIELD_RANGE;
          if (sat <= 1) rgb = lumaFieldPixel(state.Y, hueDeg, sat);
        }
        if (rgb) {
          fieldCtx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
          fieldCtx.fillRect(px, py, FIELD_TILE_STEP, FIELD_TILE_STEP);
        }
        // rgb가 null(색역 밖)이면 그냥 안 그림 -> clearRect로 이미 비운
        // 배경이 그대로 보여서 자동으로 "비정형 경계"가 만들어짐
      }
    }
    clearFieldError(); // 성공했으니 이전에 떠있던 에러가 있으면 지움
  } catch (e) {
    console.error("[LuminancePicker] renderField 실패", e);
    // 메시지 + 스택트레이스까지 화면에 그대로 노출 (콘솔 못 열어도 읽을 수 있게)
    showFieldError(tr("renderError") + (e && e.stack ? e.stack : String(e)));
    try {
      const w = el.fieldCanvas.width, h = el.fieldCanvas.height;
      fieldCtx.fillStyle = "rgb(120,120,120)";
      fieldCtx.fillRect(0, 0, w, h);
    } catch (e2) { /* 이것마저 실패하면 더 이상 손쓸 수 없음 */ }
  }
  try {
    positionCursor();
  } catch (e) {
    console.error("[LuminancePicker] positionCursor 실패", e);
  }
}

function positionCursor() {
  const w = el.fieldCanvas.clientWidth, h = el.fieldCanvas.clientHeight;
  const cx = w / 2, cy = h / 2;
  const scale = FIELD_RANGE / Math.min(cx, cy);
  const { a, b } = polarToAB(state.chroma, state.hueDeg);
  el.fieldCursor.style.left = (cx + a / scale) + "px";
  el.fieldCursor.style.top = (cy + b / scale) + "px";
}

function renderLightnessHandle() {
  const pct = state.mode === "lab" ? state.L : state.Y * 100;
  const clamped = Math.min(100, Math.max(0, pct));
  el.lightnessHandle.style.left = clamped + "%";
}

// ---------------------------------------------------------------------
// 전체 갱신
// ---------------------------------------------------------------------

function renderAll() {
  safeStep("renderField", renderField);
  safeStep("renderLightnessHandle", renderLightnessHandle);
  safeStep("swatches/hex", () => {
    const rgb = currentRgb();
    el.currentSwatch.style.background = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
    el.prevSwatch.style.background = `rgb(${state.prevRgb.r},${state.prevRgb.g},${state.prevRgb.b})`;
    el.currentHex.textContent = "#" + [rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, "0")).join("");
    el.currentLumaInfo.textContent = state.mode === "lab" ? `L* ${state.L.toFixed(1)}` : `Y ${state.Y.toFixed(3)}`;
  });
  safeStep("renderHistory", renderHistory);
}

// renderAll의 각 단계를 서로 독립시킨다: 필드 렌더링이 실패해도 hex/스와치/
// 명도 슬라이더는 계속 갱신되어야 하고, 그 반대도 마찬가지다. 하나가
// 조용히 죽어서 화면 전체가 멈춘 것처럼 보이는 걸 막기 위함.
function safeStep(name, fn) {
  try {
    fn();
  } catch (e) {
    console.error(`[LuminancePicker] renderAll 단계 실패: ${name}`, e);
    showStatus(tr("stepError", { name }) + (e && e.message ? e.message : e), "error");
  }
}

function renderHistory() {
  el.historyStrip.innerHTML = "";
  const frag = document.createDocumentFragment();
  state.history.forEach((c) => {
    const div = document.createElement("div");
    div.className = "history-swatch";
    div.style.background = c.hex;
    div.title = c.hex;
    div.addEventListener("click", () => pickColorFromRgb(c.r, c.g, c.b));
    frag.appendChild(div);
  });
  el.historyStrip.appendChild(frag);
}

function pushHistory(r, g, b) {
  const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  state.history = state.history.filter((c) => c.hex !== hex);
  state.history.unshift({ r, g, b, hex });
  if (state.history.length > HISTORY_MAX) state.history.length = HISTORY_MAX;
}

// ---------------------------------------------------------------------
// 커밋 (디바운스)
// ---------------------------------------------------------------------

let commitTimer = null;
function scheduleCommit() {
  renderAll();
  if (commitTimer) clearTimeout(commitTimer);
  commitTimer = setTimeout(async () => {
    const rgb = currentRgb();
    const ok = await setForegroundColorNow(rgb.r, rgb.g, rgb.b);
    if (ok) { lastFgSnapshot = rgb; pushHistory(rgb.r, rgb.g, rgb.b); renderHistory(); sendForegroundToOverlay(rgb, true); }
  }, COMMIT_DEBOUNCE_MS);
}

// ---------------------------------------------------------------------
// 외부 색 반영 (스포이드/스와치/오버레이 앱)
// ---------------------------------------------------------------------

function setBaseFromRgb(r, g, b) {
  state.prevRgb = currentRgb();
  const lab = rgbToLab(r, g, b);
  state.L = lab.L;
  state.Y = relativeLuminance(r, g, b);
  const { chroma, hueDeg } = abToPolar(lab.a, lab.b);
  state.chroma = state.mode === "lab" ? chroma : Math.min(FIELD_RANGE, Math.hypot(lab.a, lab.b));
  state.hueDeg = hueDeg;
}

async function pickColorFromRgb(r, g, b, options = {}) {
  setBaseFromRgb(r, g, b);
  const ok = await setForegroundColorNow(r, g, b);
  if (!ok) return false;
  lastFgSnapshot = { r, g, b };
  pushHistory(r, g, b);
  renderAll();
  if (!options.fromOverlay) sendForegroundToOverlay({ r, g, b }, true);
  return true;
}

let lastFgSnapshot = null;

function refreshBaseFromForeground(force = false) {
  if (!state.ready) { state.pendingRefresh = true; return; }
  const rgb = readForegroundColor();
  const changed = !lastFgSnapshot || rgb.r !== lastFgSnapshot.r || rgb.g !== lastFgSnapshot.g || rgb.b !== lastFgSnapshot.b;
  if (!force && !changed) return; // 실제로 안 바뀌었으면 재렌더 생략 (폴링 비용 최소화)
  lastFgSnapshot = rgb;
  setBaseFromRgb(rgb.r, rgb.g, rgb.b);
  renderAll();
  sendForegroundToOverlay(rgb);
}

const STABLE_POLL_MS = 700;
const STABLE_POLL_READS = 3;
let stableCandidate = null;
let stableCount = 0;

function stablePollForeground() {
  if (!state.ready || suppressAutoRefresh) return;
  const rgb = readFgOnce();
  if (!rgb) return;
  if (stableCandidate && sameRgb(stableCandidate, rgb)) stableCount++;
  else { stableCandidate = rgb; stableCount = 1; }
  if (stableCount < STABLE_POLL_READS) return;
  if (rgb.r === 0 && rgb.g === 0 && rgb.b === 0) return; // 검정은 이벤트 경로로만
  if (lastFgSnapshot && sameRgb(lastFgSnapshot, rgb)) return;
  lastFgSnapshot = rgb;
  dlog(`[LuminancePicker] (안전망 폴링) 이벤트로 못 받은 색 변경 감지: rgb(${rgb.r},${rgb.g},${rgb.b})`);
  setBaseFromRgb(rgb.r, rgb.g, rgb.b);
  renderAll();
  sendForegroundToOverlay(rgb, false);
}

function sameRgb(a, b) {
  return !!a && !!b && a.r === b.r && a.g === b.g && a.b === b.b;
}

function readFgOnce() {
  try {
    const fg = app.foregroundColor;
    const out = { r: Math.round(fg.rgb.red), g: Math.round(fg.rgb.green), b: Math.round(fg.rgb.blue) };
    return [out.r, out.g, out.b].every((v) => Number.isFinite(v) && v >= 0 && v <= 255) ? out : null;
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------
// 키보드 커맨드 (그림 그리며 손 안 떼고 조정용, 필드 드래그의 보조 수단)
// ---------------------------------------------------------------------

function ensureBaseReady() { /* state는 항상 초기값을 갖고 있어 별도 초기화 불필요 */ }

function stepHue(deg) {
  state.hueDeg = (state.hueDeg + deg + 360) % 360;
  if (state.mode === "lab") clampChromaToGamut();
  scheduleCommit();
}
function stepChroma(deltaRatio) {
  const maxC = state.mode === "lab" ? findMaxChromaForHue(state.L, state.hueDeg) : FIELD_RANGE;
  state.chroma = Math.min(maxC, Math.max(0, state.chroma + maxC * deltaRatio));
  scheduleCommit();
}
function jumpComplement() {
  state.hueDeg = (state.hueDeg + 180) % 360;
  if (state.mode === "lab") clampChromaToGamut();
  scheduleCommit();
}

// ---------------------------------------------------------------------
// 필드 드래그 / 명도 슬라이더 드래그 / 버튼
// ---------------------------------------------------------------------

function fieldPointToPolar(clientX, clientY) {
  const rect = el.fieldCanvas.getBoundingClientRect();
  const cx = rect.width / 2, cy = rect.height / 2;
  const scale = FIELD_RANGE / Math.min(cx, cy);
  const a = (clientX - rect.left - cx) * scale;
  const b = (clientY - rect.top - cy) * scale;
  return abToPolar(a, b);
}

function wireField() {
  let fieldDragging = false;
  const onDown = (evt) => {
    fieldDragging = true;
    onMove(evt);
    el.fieldCanvas.setPointerCapture && el.fieldCanvas.setPointerCapture(evt.pointerId);
  };
  const onMove = (evt) => {
    if (!fieldDragging) return;
    const { chroma, hueDeg } = fieldPointToPolar(evt.clientX, evt.clientY);
    state.hueDeg = hueDeg;
    state.chroma = chroma;
    if (state.mode === "lab") clampChromaToGamut();
    else state.chroma = Math.min(state.chroma, FIELD_RANGE);
    scheduleCommit();
  };
  const onUp = () => { fieldDragging = false; };
  el.fieldCanvas.addEventListener("pointerdown", onDown);
  el.fieldCanvas.addEventListener("pointermove", onMove);
  el.fieldCanvas.addEventListener("pointerup", onUp);
  el.fieldCanvas.addEventListener("pointerleave", onUp);
}

function wireLightnessSlider() {
  let sliderDragging = false;
  const onDown = (evt) => { sliderDragging = true; onMove(evt); };
  const onMove = (evt) => {
    if (!sliderDragging) return;
    const rect = el.lightnessTrack.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, ((evt.clientX - rect.left) / rect.width) * 100));
    if (state.mode === "lab") { state.L = pct; clampChromaToGamut(); }
    else { state.Y = pct / 100; state.chroma = Math.min(state.chroma, FIELD_RANGE); }
    scheduleCommit();
  };
  const onUp = () => { sliderDragging = false; };
  el.lightnessTrack.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function wireInteractions() {
  wireField();
  wireLightnessSlider();
  el.refreshBtn.addEventListener("click", refreshBaseFromForeground);
  el.eyedropperBtn.addEventListener("click", activateEyedropperTool);
  el.modeBtn.addEventListener("click", () => {
    state.mode = state.mode === "lab" ? "luma" : "lab";
    el.modeBtn.classList.toggle("active", state.mode === "luma");
    if (state.mode === "lab") clampChromaToGamut();
    else state.chroma = Math.min(state.chroma, FIELD_RANGE);
    renderAll();
  });
}

// ---------------------------------------------------------------------
// 외부 색 변경 감지: 스포이드 등으로 전경색이 바뀌면 팔레트를 갱신한다.
//
// [배경] 처음 시도했을 때는 addNotificationListener로 이벤트가 왔다는
// "신호"만 트리거로 쓰고, 실제 값은 여전히 app.foregroundColor를
// 다시 읽었다(refreshBaseFromForeground). 그런데 실사용 테스트 결과,
// 마우스로는 검정 오독이 전혀 안 일어나고 와콤 펜으로만 일어나는 게
// 확인됐다 — 와콤의 고빈도 압력/기울기 스트림이 Photoshop 메인
// 스레드를 마우스보다 훨씬 심하게 몰아붙여서, 그 순간엔 어떤 방식으로
// 색을 "다시 읽어도"(COM이든, UXP의 app.foregroundColor든) 죄다
// 신뢰할 수 없는 상태가 되는 것으로 보인다.
//
// [이번 개선] "다시 읽지" 않는다. set 이벤트의 디스크립터 자체에 이미
// 들어있는 값(우리가 SET할 때 desc.putObject(idTo, idRGBColor, ...)로
// 넣었던 것과 같은 "to" 값)을 이벤트 페이로드에서 직접 꺼내 쓴다 —
// 이건 "그 순간 다시 물어본 값"이 아니라 "실제로 그 액션이 설정한
// 값"이라 재조회 특유의 타이밍 문제 자체가 없다.
//
// 구조를 100% 확신할 수 없어서(이전에 구조 추측이 틀려 팔레트가 전혀
// 안 움직이는 문제가 있었음), 여러 후보 경로를 다 시도하고, 시도할
// 때마다 원본 디스크립터를 로그로 남긴다. 전부 실패하면 예전처럼
// 재조회(refreshBaseFromForeground)로 안전하게 폴백한다 — 즉 이 개선이
// 안 먹혀도 최소한 지금까지의 동작보다 나빠지지는 않는다.
// ---------------------------------------------------------------------

// 디스크립터 숫자 값은 그냥 숫자이거나 {_unit, _value} 형태일 수 있다.
function descNum(v) {
  if (v && typeof v === "object" && "_value" in v) v = v._value;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function hsbToRgb(h, s, v) {
  // h: 0~360, s/v: 0~100
  s /= 100; v /= 100;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255) };
}

// Photoshop 색 디스크립터 하나를 RGB로 바꾼다. 실패하면 null.
// [중요 버그 수정] Photoshop 디스크립터에서 RGB의 초록 채널 키는 "green"이
// 아니라 "grain"이다(액션 매니저 'Grn ' 키의 정식 문자열 ID). 예전 코드는
// green만 찾아서 스포이드 이벤트의 직접 추출이 실패하고 "재조회" 폴백으로
// 빠졌다 — 바로 그 재조회가 펜 사용 중 검정을 읽어오는 경로였다.
function colorDescToRgb(c) {
  if (!c || typeof c !== "object") return null;
  const cls = String(c._obj || "");
  const has = (k) => c[k] !== undefined;
  let rgb = null;
  if (has("red") && has("blue") && (has("grain") || has("green"))) {
    rgb = { r: descNum(c.red), g: descNum(has("grain") ? c.grain : c.green), b: descNum(c.blue) };
  } else if (cls === "HSBColorClass" || (has("hue") && has("saturation") && has("brightness"))) {
    rgb = hsbToRgb(((descNum(c.hue) % 360) + 360) % 360, descNum(c.saturation), descNum(c.brightness));
  } else if (cls === "labColor" || (has("luminance") && has("a") && has("b"))) {
    rgb = labToRgb(descNum(c.luminance), descNum(c.a), descNum(c.b), true);
  } else if (cls === "grayscale" || has("gray")) {
    const v = clamp255(255 * (1 - descNum(c.gray) / 100));
    rgb = { r: v, g: v, b: v };
  } else if (cls === "CMYKColorClass" || (has("cyan") && has("magenta") && has("yellowColor"))) {
    // 근사 변환(색 관리 미적용) — 팔레트 기준색 용도로는 충분하다.
    const C = descNum(c.cyan) / 100, M = descNum(c.magenta) / 100, Y = descNum(c.yellowColor) / 100, K = descNum(c.black) / 100;
    rgb = { r: 255 * (1 - C) * (1 - K), g: 255 * (1 - M) * (1 - K), b: 255 * (1 - Y) * (1 - K) };
  }
  if (!rgb) return null;
  const out = { r: Math.round(rgb.r), g: Math.round(rgb.g), b: Math.round(rgb.b) };
  return [out.r, out.g, out.b].every((v) => Number.isFinite(v) && v >= 0 && v <= 255) ? out : null;
}

function extractRgbFromSetDescriptor(descriptor) {
  if (!descriptor) return null;
  const candidates = [descriptor.to, descriptor.to && descriptor.to.value, descriptor.to && descriptor.to.color];
  for (const c of candidates) {
    try {
      const rgb = colorDescToRgb(c);
      if (rgb) return rgb;
    } catch (e) { /* 다음 후보 시도 */ }
  }
  return null;
}

// set 이벤트 외의 경로로 전경색이 바뀌는 경우: X(전경/배경 교환), D(기본색).
// D는 정의상 전경색이 검정이므로 읽지 않고 바로 검정을 신뢰 값으로 보낸다
// (사용자가 일부러 고른 검정이라 히스토리에 남아야 함). X는 키보드 조작이라
// 펜 스트로크 중이 아니므로, 짧게 기다렸다가 두 번 읽어 같을 때만 신뢰한다.
function applyEventColor(rgb, why) {
  dlog(`[LuminancePicker] ${why}: rgb(${rgb.r},${rgb.g},${rgb.b})`);
  lastFgSnapshot = rgb;
  setBaseFromRgb(rgb.r, rgb.g, rgb.b);
  pushHistory(rgb.r, rgb.g, rgb.b);
  renderAll();
  sendForegroundToOverlay(rgb, true);
}

function confirmedReadAfterEvent(why) {
  setTimeout(() => {
    const a = readFgOnce();
    setTimeout(() => {
      const b = readFgOnce();
      if (a && b && sameRgb(a, b)) applyEventColor(b, why);
      else dlog(`[LuminancePicker] ${why}: 두 번 읽은 값이 달라 무시 (안전망 폴링에 맡김)`);
    }, 120);
  }, 80);
}

let setEventDiagnosticLogCount = 0;
const SET_EVENT_DIAGNOSTIC_LOG_MAX = 6; // 로그가 너무 많이 쌓이지 않도록 처음 몇 번만 원본을 남김

function tryRegisterAutoRefreshListener() {
  try {
    action.addNotificationListener(["set"], (event, descriptor) => {
      if (suppressAutoRefresh) return;
      try {
        const target = descriptor && descriptor._target;
        // 배경색 변경(Alt+스포이드 등)도 _ref:"color"라서 예전엔 전경색으로
        // 오인됐다. 전경색 대상만 받는다.
        const touches = Array.isArray(target) && target.some((t) => t && (t._property === "foregroundColor" || (t._ref === "color" && !t._property)));
        if (!touches) return;

        if (setEventDiagnosticLogCount < SET_EVENT_DIAGNOSTIC_LOG_MAX) {
          setEventDiagnosticLogCount++;
          dlog("[LuminancePicker] set 이벤트(foregroundColor로 추정) 원본 디스크립터:", JSON.stringify(descriptor));
        }

        const direct = extractRgbFromSetDescriptor(descriptor);
        if (direct) {
          // 재조회 없이 이벤트 페이로드에서 바로 뽑은 값 — 이게 이번 개선의
          // 핵심이다. 검정(0,0,0)이어도 이건 "실제로 그렇게 설정된 값"이라
          // 오독일 수가 없으니, 다른 방어 로직 없이 그대로 신뢰한다.
          dlog(`[LuminancePicker] set 이벤트에서 색상 직접 추출 성공: rgb(${direct.r},${direct.g},${direct.b}) - 재조회 없이 바로 반영`);
          setBaseFromRgb(direct.r, direct.g, direct.b); // 내부에서 state.prevRgb도 함께 갱신함
          pushHistory(direct.r, direct.g, direct.b);
          renderAll();
          renderHistory();
          sendForegroundToOverlay(direct, true); // trusted=true: 재조회 없이 이벤트에서 직접 뽑은 값이라 검정 방어 로직 없이 그대로 신뢰해도 됨
          return;
        }

        // 직접 추출 실패(별색/라이브러리 색 등) — 검증된 재조회로 폴백.
        dlog("[LuminancePicker] set 이벤트에서 색상 직접 추출 실패, 검증 재조회로 폴백");
        confirmedReadAfterEvent("set 이벤트(추출 실패) 후 재조회");
      } catch (e) {
        console.warn("[LuminancePicker] set 이벤트 처리 중 오류, 무시하고 계속 진행", e);
      }
    });
  } catch (e) {
    console.warn("[LuminancePicker] addNotificationListener unavailable", e);
  }
  try {
    action.addNotificationListener(["reset"], (event, descriptor) => {
      if (suppressAutoRefresh) return;
      // "reset"은 색 말고 다른 대상(도구 초기화 등)에도 쓰이므로 색 대상만 받는다.
      const target = descriptor && descriptor._target;
      if (Array.isArray(target) && !target.some((t) => t && t._ref === "color")) return;
      applyEventColor({ r: 0, g: 0, b: 0 }, "기본 색상(D) 이벤트");
    });
    action.addNotificationListener(["exchange"], () => {
      if (suppressAutoRefresh) return;
      confirmedReadAfterEvent("전경/배경 교환(X) 이벤트");
    });
  } catch (e) {
    console.warn("[LuminancePicker] reset/exchange 리스너 등록 실패", e);
  }
}

// ---------------------------------------------------------------------
// UXP 진입점
// ---------------------------------------------------------------------

tryRegisterAutoRefreshListener();
connectOverlayApp();

entrypoints.setProvider({
  panels: {
    luminancePanel: {
      show() { refreshBaseFromForeground(true); },
      hide() {}
    }
  }
});
