const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");
// Electron은 기본적으로 preload 스크립트를 샌드박스 환경에서 실행하는데
// (Electron 20+ 기본값), 그 안에서는 require가 로컬 파일(colorMath.js
// 같은)을 아예 못 읽는다 - 절대경로로 바꿔도 그 자체로는 안 됐던 이유가
// 이것이다. main.js에서 이 preload를 쓰는 BrowserWindow에 sandbox:false를
// 명시해야 아래 require(path.join(...))가 정상 동작한다.
const {
  labFieldPixel,
  lumaFieldPixel,
  polarToAB,
  abToPolar,
  findMaxChromaForHue,
  findLightnessRangeForChroma,
  rgbToLab,
  relativeLuminance
} = require(path.join(__dirname, "colorMath.js"));
const i18n = require(path.join(__dirname, "i18n.js"));

// 화면 언어는 main이 정한다. 팝업의 버튼 툴팁/알림 문구(data-i18n*)를 바꾼다.
const lang = ipcRenderer.sendSync("i18n-get-lang");
window.addEventListener("DOMContentLoaded", () => i18n.applyDom(document, lang));

console.log("[preload] colorMath 로드 성공:", {
  labFieldPixel: typeof labFieldPixel,
  lumaFieldPixel: typeof lumaFieldPixel,
  polarToAB: typeof polarToAB,
  abToPolar: typeof abToPolar
});

contextBridge.exposeInMainWorld("overlayAPI", {
  onPopupOpen: (callback) => {
    ipcRenderer.on("popup-open", (_event, data) => callback(data));
  },
  pickColor: (r, g, b) => {
    ipcRenderer.send("popup-color-picked", { r, g, b });
  },
  onHistory: (callback) => {
    ipcRenderer.on("popup-history", (_event, history) => callback(history));
  },
  closePopup: () => {
    ipcRenderer.send("popup-close-request");
  },
  onApplyFailed: (callback) => {
    ipcRenderer.on("popup-apply-failed", () => callback());
  },
  // colorMath 순수 함수들을 그대로 노출 (렌더러는 Node require를 못 쓰므로)
  labFieldPixel,
  lumaFieldPixel,
  polarToAB,
  abToPolar,
  findMaxChromaForHue,
  findLightnessRangeForChroma,
  rgbToLab,
  relativeLuminance
});
