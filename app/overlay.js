// overlay.js
// preload.js가 노출한 colorMath 순수 함수들을 그대로 써서, Photoshop
// 플러그인 패널(index.js)과 동일한 방식으로 비정형 필드를 그린다.
// 상태(L/Y, hue, chroma)는 main 프로세스가 "popup-open" 이벤트로 보내주고,
// 여기서는 그 값을 기준으로 필드를 렌더링 + 드래그/슬라이더 조작만 담당한다.
// 최종 색은 pickColor()로 main에 알려주고 팝업은 닫힌다.

const FIELD_RANGE = 130; // "일부분 보기"(기본) 모드의 고정 범위

const state = {
  mode: "lab",
  L: 50,
  Y: 0.2,
  chroma: 0,
  hueDeg: 0,
  fullGamutMode: false, // 전체 색역 보기 버튼 상태
  lightnessRange: { Lmin: 0, Lmax: 100 } // "이 색상을 유지한 채" 가능한 L* 범위
};

const el = {};
let fieldCtx = null;
let currentFieldRange = FIELD_RANGE; // 이번 렌더에서 실제로 쓸 범위 (전체 색역 모드면 매번 다시 계산됨)

function cacheEls() {
  el.fieldCanvas = document.getElementById("fieldCanvas");
  el.fieldCursor = document.getElementById("fieldCursor");
  el.lightnessOuter = document.getElementById("lightnessOuter");
  el.lightnessTrack = document.getElementById("lightnessTrack");
  el.lightnessHandle = document.getElementById("lightnessHandle");
  el.currentSwatch = document.getElementById("currentSwatch");
  el.prevSwatch = document.getElementById("prevSwatch");
  el.historyRow = document.getElementById("historyRow");
  el.fullGamutBtn = document.getElementById("fullGamutBtn");
  el.applyFailedBanner = document.getElementById("applyFailedBanner");
}

// 지금 L*에서 실제로 도달 가능한 최대 chroma를 hue 전체에 대해 스캔해서
// 구한다. "전체 색역 보기"는 이 값을 필드의 표시 범위로 써서, 그 밝기에서
// 나올 수 있는 색이 캔버스 가장자리까지 꽉 차게 보이도록 한다.
function computeFullGamutRange() {
  if (state.mode !== "lab") return FIELD_RANGE;
  let maxC = 0;
  for (let h = 0; h < 360; h += 15) {
    const c = window.overlayAPI.findMaxChromaForHue(state.L, h);
    if (c > maxC) maxC = c;
  }
  return Math.max(10, maxC * 1.05);
}

function updateFieldRange() {
  currentFieldRange = state.fullGamutMode ? computeFullGamutRange() : FIELD_RANGE;
}

// 지금 hue/chroma(=지금 색상)를 유지한 채 표현 가능한 L* 범위를 갱신한다.
// "전체 색역 보기"에서는 색 정확도보다 자유로운 탐색을 우선하므로 굳이
// 이 범위로 제한하지 않고 0~100 전체를 쓴다.
function updateLightnessRange() {
  if (state.mode === "lab" && !state.fullGamutMode) {
    state.lightnessRange = window.overlayAPI.findLightnessRangeForChroma(state.hueDeg, state.chroma);
  } else {
    state.lightnessRange = { Lmin: 0, Lmax: 100 };
  }
}

function currentRgb() {
  const { a, b } = window.overlayAPI.polarToAB(state.chroma, state.hueDeg);
  let rgb;
  if (state.mode === "lab") {
    rgb = window.overlayAPI.labFieldPixel(state.L, a, b) || window.overlayAPI.labFieldPixel(state.L, a, b, true);
  } else {
    rgb = window.overlayAPI.lumaFieldPixel(state.Y, state.hueDeg, Math.min(1, state.chroma / FIELD_RANGE));
  }
  return rgb || { r: 128, g: 128, b: 128 };
}

// "일부분 보기"에서는 실제 색역 경계로 chroma를 제한해서 정확한 색만
// 고를 수 있게 한다. "전체 색역 보기"에서는 일부러 이 제한을 건너뛰어서
// (호출부에서 아예 안 부름) 사각형 전체 어디든 자유롭게 선택 가능하게 한다.
function clampChromaToGamut() {
  if (state.mode === "lab") {
    const maxC = window.overlayAPI.findMaxChromaForHue(state.L, state.hueDeg);
    state.chroma = Math.min(state.chroma, maxC);
  } else {
    state.chroma = Math.min(state.chroma, FIELD_RANGE);
  }
}

// 픽셀 단위(createImageData/putImageData)로 그린다. Photoshop UXP 패널은
// 이 API를 지원하지 않아서 fillRect 타일 방식으로 우회해야 했지만, 이
// 팝업은 완전한 Chromium(Electron 렌더러)이라 createImageData가 온전히
// 지원된다.
function renderField() {
  try {
    if (state.mode === "lab" && !Number.isFinite(state.L)) {
      console.error("[overlay-popup] state.L이 유효하지 않음:", state.L, "-> 50으로 대체. state:", JSON.stringify(state));
      state.L = 50;
    }
    if (state.mode === "luma" && !Number.isFinite(state.Y)) {
      console.error("[overlay-popup] state.Y가 유효하지 않음:", state.Y, "-> 0.2로 대체. state:", JSON.stringify(state));
      state.Y = 0.2;
    }

    updateFieldRange();

    const w = el.fieldCanvas.width, h = el.fieldCanvas.height;
    const cx = w / 2, cy = h / 2;
    const scale = currentFieldRange / Math.min(cx, cy);
    const img = fieldCtx.createImageData(w, h);

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const a = (px - cx) * scale;
        const b = (py - cy) * scale;
        let rgb = null;
        if (state.mode === "lab") {
          rgb = window.overlayAPI.labFieldPixel(state.L, a, b, state.fullGamutMode);
        } else {
          const { chroma, hueDeg } = window.overlayAPI.abToPolar(a, b);
          const sat = chroma / currentFieldRange;
          if (sat <= 1) rgb = window.overlayAPI.lumaFieldPixel(state.Y, hueDeg, sat);
        }
        const idx = (py * w + px) * 4;
        if (rgb) {
          img.data[idx] = rgb.r; img.data[idx + 1] = rgb.g; img.data[idx + 2] = rgb.b; img.data[idx + 3] = 255;
        } else {
          img.data[idx + 3] = 0;
        }
      }
    }
    fieldCtx.putImageData(img, 0, 0);
  } catch (e) {
    console.error("[overlay-popup] renderField 실패:", e && e.stack ? e.stack : e, "state:", JSON.stringify(state));
    try {
      fieldCtx.fillStyle = "rgb(200,50,50)";
      fieldCtx.fillRect(0, 0, el.fieldCanvas.width, el.fieldCanvas.height);
    } catch (e2) { /* 이것마저 실패하면 더 손쓸 수 없음 */ }
  }
  try {
    positionCursor();
  } catch (e) {
    console.error("[overlay-popup] positionCursor 실패:", e);
  }
}

function positionCursor() {
  const w = el.fieldCanvas.clientWidth, h = el.fieldCanvas.clientHeight;
  const cx = w / 2, cy = h / 2;
  const scale = currentFieldRange / Math.min(cx, cy);
  const { a, b } = window.overlayAPI.polarToAB(state.chroma, state.hueDeg);
  el.fieldCursor.style.left = (cx + a / scale) + "px";
  el.fieldCursor.style.top = (cy + b / scale) + "px";
}

// 슬라이더 핸들 위치: "일부분 보기"에서는 [Lmin,Lmax] 구간 안에서의 상대
// 위치로, "전체 색역 보기"에서는(그리고 luma 모드) 0~100 그대로.
function renderLightnessHandle() {
  let pct;
  if (state.mode === "lab") {
    const { Lmin, Lmax } = state.lightnessRange;
    pct = Lmax > Lmin ? ((state.L - Lmin) / (Lmax - Lmin)) * 100 : 0;
  } else {
    pct = state.Y * 100;
  }
  el.lightnessHandle.style.left = Math.min(100, Math.max(0, pct)) + "%";
}

// 명도 트랙 자체를 검정~흰색 고정 그라데이션이 아니라, "지금 색상(hue/chroma)을
// 유지한 채" [Lmin,Lmax] 구간에서 실제로 나타나는 색들의 그라데이션으로 그린다.
// 추가로, 트랙(안쪽 바)의 위치/너비 자체도 [Lmin,Lmax]가 전체 0~100 중
// 차지하는 비율만큼만 되게 한다 — 스펙트럼이 좁으면(Lmax-Lmin이 작으면)
// 바 자체가 짧아지고, 넓으면 바깥 트랙(outer) 전체에 가깝게 채워진다.
// 항상 검은색/흰색으로 끝나는 게 아니라 그 색 고유의 가장 어둡고 밝은
// 단계에서 끝난다.
function renderLightnessTrackGradient() {
  if (state.mode !== "lab") {
    el.lightnessTrack.style.left = "0%";
    el.lightnessTrack.style.width = "100%";
    el.lightnessTrack.style.background = "linear-gradient(to right, #000, #fff)";
    return;
  }
  const { Lmin, Lmax } = state.lightnessRange;
  el.lightnessTrack.style.left = Lmin + "%";
  el.lightnessTrack.style.width = Math.max(0, Lmax - Lmin) + "%";

  const { a, b } = window.overlayAPI.polarToAB(state.chroma, state.hueDeg);
  const STEPS = 12;
  const stops = [];
  for (let i = 0; i <= STEPS; i++) {
    const L = Lmin + ((Lmax - Lmin) * i) / STEPS;
    const rgb = window.overlayAPI.labFieldPixel(L, a, b, true) || { r: 128, g: 128, b: 128 };
    const pct = ((i / STEPS) * 100).toFixed(1);
    stops.push(`rgb(${rgb.r},${rgb.g},${rgb.b}) ${pct}%`);
  }
  el.lightnessTrack.style.background = `linear-gradient(to right, ${stops.join(", ")})`;
}

function renderSwatches(prevRgb) {
  const rgb = currentRgb();
  el.currentSwatch.style.background = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  if (prevRgb) el.prevSwatch.style.background = `rgb(${prevRgb.r},${prevRgb.g},${prevRgb.b})`;
}

// 최근 확정한 색들을 작은 스와치로 나열한다. 클릭하면 필드를 드래그할
// 필요 없이 그 색으로 바로 커밋(브러시에 적용)된다. 매번 통째로 다시
// 그린다 — 최대 8개라 비용이 미미하다.
function renderHistory(history) {
  if (!history) return;
  el.historyRow.innerHTML = "";
  for (const c of history) {
    const sw = document.createElement("div");
    sw.className = "history-swatch";
    sw.style.background = `rgb(${c.r},${c.g},${c.b})`;
    sw.title = `rgb(${c.r}, ${c.g}, ${c.b})`;
    sw.addEventListener("click", () => {
      window.overlayAPI.pickColor(c.r, c.g, c.b);
    });
    el.historyRow.appendChild(sw);
  }
}

function renderAll() {
  renderField();
  renderLightnessTrackGradient();
  renderLightnessHandle();
  renderSwatches();
}

function fieldPointToPolar(clientX, clientY) {
  const rect = el.fieldCanvas.getBoundingClientRect();
  const cx = rect.width / 2, cy = rect.height / 2;
  const scale = currentFieldRange / Math.min(cx, cy);
  const a = (clientX - rect.left - cx) * scale;
  const b = (clientY - rect.top - cy) * scale;
  return window.overlayAPI.abToPolar(a, b);
}

function wireField() {
  let dragging = false;
  let capturedPointerId = null;
  const onMove = (evt) => {
    if (!dragging) return;
    const { chroma, hueDeg } = fieldPointToPolar(evt.clientX, evt.clientY);
    state.hueDeg = hueDeg;
    state.chroma = chroma;
    // "전체 색역 보기"에서는 일부러 색역 경계로 자르지 않는다 — 사각형
    // 전체 어디든 선택할 수 있어야 하므로. "일부분 보기"에서만 정확한
    // 색역 경계로 제한한다.
    if (!state.fullGamutMode) clampChromaToGamut();
    updateLightnessRange();
    positionCursor();
    renderLightnessTrackGradient();
    renderLightnessHandle();
    renderSwatches();
  };
  el.fieldCanvas.addEventListener("pointerdown", (evt) => {
    console.log(`[overlay-popup] 필드 pointerdown 수신: clientX=${evt.clientX} clientY=${evt.clientY}`);
    dragging = true;
    onMove(evt);
    // 포인터 캡처: 팝업이 작아서 드래그 중 커서가 캔버스 경계를 살짝만
    // 벗어나도 pointerleave가 먼저 발동해 dragging이 false가 되고, 그 뒤
    // pointerup이 캔버스 밖에서 일어나 이 리스너에 아예 안 잡혀서 색이
    // 커밋(pickColor)되지 않는 문제가 있었다. setPointerCapture를 걸면
    // 커서가 캔버스 밖으로 나가도 이후 pointermove/pointerup 이벤트가
    // 계속 이 캔버스로 전달되어 정상적으로 커밋된다.
    capturedPointerId = null;
    if (el.fieldCanvas.setPointerCapture) {
      try {
        el.fieldCanvas.setPointerCapture(evt.pointerId);
        capturedPointerId = evt.pointerId;
      } catch (e) { /* 캡처 실패 - 아래 pointerleave 폴백으로 처리됨 */ }
    }
  });
  el.fieldCanvas.addEventListener("pointermove", onMove);
  const commitAndClose = () => {
    if (!dragging) return;
    dragging = false;
    capturedPointerId = null;
    const rgb = currentRgb();
    console.log(`[overlay-popup] 필드 드래그 커밋: rgb(${rgb.r},${rgb.g},${rgb.b})`);
    window.overlayAPI.pickColor(rgb.r, rgb.g, rgb.b);
  };
  el.fieldCanvas.addEventListener("pointerup", commitAndClose);
  // 포인터 캡처가 걸렸으면 커서가 캔버스를 벗어나도 계속 이 캔버스가
  // 이벤트를 받으므로 pointerleave는 무시한다. 캡처가 실패한 구형 환경
  // 에서만 예전처럼 드래그를 취소하는 폴백으로 동작한다.
  el.fieldCanvas.addEventListener("pointerleave", () => {
    if (capturedPointerId === null) dragging = false;
  });
}

function wireLightnessSlider() {
  let dragging = false;
  const onMove = (evt) => {
    if (!dragging) return;
    const rect = el.lightnessTrack.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, ((evt.clientX - rect.left) / rect.width) * 100));
    if (state.mode === "lab") {
      const { Lmin, Lmax } = state.lightnessRange;
      state.L = Lmin + ((Lmax - Lmin) * pct) / 100;
    } else {
      state.Y = pct / 100;
      state.chroma = Math.min(state.chroma, FIELD_RANGE);
    }
    renderField();
    renderLightnessTrackGradient();
    renderLightnessHandle();
    renderSwatches();
  };
  el.lightnessTrack.addEventListener("pointerdown", (evt) => { dragging = true; onMove(evt); });
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    // 예전엔 여기서 상태를 렌더러 안에만 남겨두고 main 프로세스에는 전혀
    // 알리지 않았다. 그래서 슬라이더로 명도를 바꾼 뒤 휠을 굴리면, main이
    // 갖고 있던(안 바뀐) 예전 L*에서부터 다시 시작해 "초기 위치로 돌아간
    // 뒤 움직이는" 것처럼 보였다. 필드 드래그와 동일하게 pickColor로
    // 커밋해서 main의 상태도 같이 갱신되게 한다.
    const rgb = currentRgb();
    window.overlayAPI.pickColor(rgb.r, rgb.g, rgb.b);
  });
}

// 클릭할 때마다 "일부분 보기" <-> "전체 색역 보기"를 전환한다.
function wireFullGamutToggle() {
  el.fullGamutBtn.addEventListener("click", () => {
    state.fullGamutMode = !state.fullGamutMode;
    el.fullGamutBtn.classList.toggle("active", state.fullGamutMode);
    updateLightnessRange();
    renderField();
    renderLightnessTrackGradient();
    renderLightnessHandle();
    renderSwatches();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  cacheEls();
  fieldCtx = el.fieldCanvas.getContext("2d");
  wireField();
  wireLightnessSlider();
  wireFullGamutToggle();
  document.getElementById("closeBtn").addEventListener("click", () => window.overlayAPI.closePopup());
  window.overlayAPI.onHistory((history) => renderHistory(history));

  // 색 적용이 실패했을 때(COM 브릿지 등) 조용히 넘어가지 않고 짧게
  // 눈에 띄는 경고를 띄운다 — 신뢰도 문제. 연속으로 여러 번 실패해도
  // CSS 애니메이션이 매번 새로 재생되도록 요소를 지우고 다시 만든다.
  window.overlayAPI.onApplyFailed(() => {
    const old = el.applyFailedBanner;
    const fresh = old.cloneNode(true);
    fresh.hidden = false;
    old.parentNode.replaceChild(fresh, old);
    el.applyFailedBanner = fresh;
  });

  window.overlayAPI.onPopupOpen((data) => {
    try {
      state.mode = data.mode || "lab";
      state.L = data.L;
      state.Y = data.Y;
      state.hueDeg = data.hueDeg || 0;
      state.chroma = data.chroma || 0;
      state.lightnessRange = data.lightnessRange || window.overlayAPI.findLightnessRangeForChroma(state.hueDeg, state.chroma);
      renderAll();
      renderHistory(data.history);
      if (data.prevRgb) renderSwatches(data.prevRgb);
    } catch (e) {
      console.error("[overlay-popup] onPopupOpen 처리 실패:", e && e.stack ? e.stack : e, "data:", JSON.stringify(data));
    }
  });

  // 사용자가 창 가장자리를 드래그해서 팝업 크기를 조절하면, 캔버스의
  // "실제 표시 크기"(CSS)는 자동으로 커지지만 캔버스의 "내부 해상도"
  // (width/height 속성)는 그대로라서 그림이 뭉개져 보인다. 리사이즈가
  // 끝나면 내부 해상도를 표시 크기에 맞춰 다시 설정하고 다시 그린다 —
  // 이러면 필드/커서/명도 바 등 내용물 전체가 새 크기에 비례해서 다시
  // 계산된다(고정 비율로 늘어나는 게 아니라 진짜로 다시 렌더링됨).
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const newW = Math.round(el.fieldCanvas.clientWidth);
      const newH = Math.round(el.fieldCanvas.clientHeight);
      if (newW > 0 && newH > 0 && (el.fieldCanvas.width !== newW || el.fieldCanvas.height !== newH)) {
        el.fieldCanvas.width = newW;
        el.fieldCanvas.height = newH;
        renderAll();
      }
    }, 80);
  });
});

// 위 각 함수의 try/catch로 못 잡는 진짜 처리 안 된 예외까지 전부 콘솔로
// 보내서 main.js의 console-message 포워딩을 통해 npm start 터미널에 뜨게 함
window.addEventListener("error", (evt) => {
  console.error("[overlay-popup] Uncaught error:", evt.message, "at", evt.filename + ":" + evt.lineno);
});
window.addEventListener("unhandledrejection", (evt) => {
  console.error("[overlay-popup] Unhandled promise rejection:", evt.reason);
});
