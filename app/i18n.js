// i18n.js
// ---------------------------------------------------------------------
// 앱 화면 문구(한국어/영어). main 프로세스와 각 창의 preload가 같이 쓴다.
//   - 언어 설정: config.language = "auto" | "ko" | "en"
//     auto면 OS 언어(app.getLocale())가 한국어일 때 ko, 그 외엔 en.
//   - main: setLang()으로 한 번 정하고 t(key)로 트레이 메뉴/창 제목/라이선스 안내를 만든다.
//   - preload: ipc로 main의 언어를 받아 applyDom()으로 data-i18n 속성이 붙은
//     요소의 문구를 바꾸고, 렌더러 스크립트에는 t()를 노출한다.
// 로그(console)는 디버깅/로그 분석용이라 번역하지 않는다(한국어 유지).
// 언어를 바꾸면 앱을 다시 시작해서 적용한다(창마다 다시 그리는 것보다 단순하고 확실).
// ---------------------------------------------------------------------

const STRINGS = {
  ko: {
    // 트레이 메뉴 / 창 제목
    "tray.settings": "설정 (단축키 변경)...",
    "tray.testConnection": "Photoshop 연결 테스트 (콘솔 확인)",
    "tray.openLog": "로그 파일 열기...",
    "tray.installPlugin": "Photoshop 플러그인 설치...",
    "tray.license": "라이선스 키 입력...",
    "tray.language": "언어 / Language",
    "tray.langAuto": "자동 (시스템 언어)",
    "tray.quit": "종료",
    "win.settings": "SHA Paint 설정",
    "win.license": "SHA Paint 라이선스",

    // 마우스 버튼 이름(트리거 표시)
    "mouse.1": "좌클릭",
    "mouse.2": "우클릭",
    "mouse.3": "중클릭",
    "mouse.n": "마우스 버튼 {n}",

    // 설정 창
    "settings.title": "SHA Paint 설정",
    "settings.showPopup": "팔레트 팝업 표시 (누르면 열림/한번 더 누르면 닫힘, Esc로도 닫힘)",
    "settings.clickFollow": "활성화 전환 (1회 입력 — 켜면 아래 클릭으로도 팝업이 열림)",
    "settings.trigger": "활성화 트리거 (마우스 클릭 또는 키보드 키 — 기본값: 중클릭)",
    "settings.recordKey": "키 입력으로 변경",
    "settings.recordTrigger": "키/클릭 입력으로 변경",
    "settings.recordingHint": "키를 누르거나 마우스 버튼을 클릭해주세요... (Esc로 취소)",
    "settings.language": "언어 / Language",
    "settings.langAuto": "자동 (시스템 언어)",
    "settings.langNote": "언어를 바꾸면 저장할 때 SHA Paint가 다시 시작됩니다.",
    "settings.save": "저장",
    "settings.note": "\"팔레트 팝업 표시\"는 한 번 누르면 열리고 다시 누르면 닫히는 토글이며, Esc로도 닫을 수 있습니다. \"활성화 전환\"도 한 번 눌러서 켜고, 다시 눌러서 끄는 토글입니다 (또는 화면에 뜨는 상태 패널에서 클릭으로도 켜고 끌 수 있습니다). \"활성화 트리거\"는 켜진 상태에서 팝업을 여는 동작으로, 좌클릭·우클릭·중클릭은 물론 키보드 키로도 바꿀 수 있습니다(브러시와 겹치는 좌클릭으로 바꾸면 그림 그리는 도중 팝업이 뜰 수 있다는 점만 참고해주세요). 저장하면 재시작 없이 바로 적용됩니다.",

    // 상태 패널
    "panel.expandTitle": "SHA Paint — 클릭해서 펼치기",
    "panel.active": "활성화",
    "panel.trigger": "트리거",
    "panel.editShortcuts": "단축키 편집",
    "panel.minimize": "최소화",
    "panel.showPopup": "팔레트 팝업 표시",
    "panel.clickFollow": "활성화 전환",
    "panel.activationTrigger": "활성화 트리거 (키 또는 클릭)",
    "panel.triggerCloses": "트리거를 다시 누르면 닫기",
    "panel.change": "변경",
    "panel.recordingHint": "키 또는 마우스 버튼을 입력하세요... (Esc로 취소)",

    // 팔레트 팝업
    "popup.fullGamut": "전체 색역 보기 전환",
    "popup.close": "팔레트 닫기 (F11 / Esc)",
    "popup.applyFailed": "⚠ 색 적용 실패 — 다시 시도해주세요",

    // 라이선스 창
    "license.title": "SHA Paint 라이선스",
    "license.label": "구매 확인 메일에 있는 라이선스 키를 붙여넣으세요.",
    "license.activate": "확인",
    "license.note": "키 확인에는 인터넷 연결이 필요합니다. 한 번 확인되면 오프라인에서도 계속 사용할 수 있습니다.",
    "license.ok": "라이선스가 확인되었습니다.",
    "license.okClose": "라이선스가 확인되었습니다. 이 창을 닫아도 됩니다.",
    "license.checking": "확인 중...",
    "license.failed": "확인하지 못했습니다.",
    "license.error": "확인 중 오류가 발생했습니다: {msg}",
    // licensing.js가 돌려주는 사유
    "license.enterKey": "라이선스 키를 입력해 주세요.",
    "license.enterKeyExact": "라이선스 키를 정확히 입력해 주세요.",
    "license.invalid": "유효하지 않은 라이선스 키입니다.",
    "license.refunded": "환불 또는 결제 취소된 라이선스입니다.",
    "license.tooMany": "이 키는 이미 {limit}대의 PC에서 사용 중입니다. 문의해 주세요.",
    "license.serverError": "서버 오류({status})",
    "license.offline": "인터넷 연결을 확인할 수 없습니다."
  },

  en: {
    "tray.settings": "Settings (shortcuts)...",
    "tray.testConnection": "Test Photoshop connection (see log)",
    "tray.openLog": "Open log file...",
    "tray.installPlugin": "Install Photoshop plugin...",
    "tray.license": "Enter license key...",
    "tray.language": "Language / 언어",
    "tray.langAuto": "Auto (system language)",
    "tray.quit": "Quit",
    "win.settings": "SHA Paint Settings",
    "win.license": "SHA Paint License",

    "mouse.1": "Left click",
    "mouse.2": "Right click",
    "mouse.3": "Middle click",
    "mouse.n": "Mouse button {n}",

    "settings.title": "SHA Paint Settings",
    "settings.showPopup": "Show palette popup (press to open, press again to close; Esc also closes)",
    "settings.clickFollow": "Toggle activation (press once — when on, the trigger below also opens the popup)",
    "settings.trigger": "Activation trigger (mouse click or keyboard key — default: middle click)",
    "settings.recordKey": "Press a key to change",
    "settings.recordTrigger": "Press a key/click to change",
    "settings.recordingHint": "Press a key or click a mouse button... (Esc to cancel)",
    "settings.language": "Language / 언어",
    "settings.langAuto": "Auto (system language)",
    "settings.langNote": "Changing the language restarts SHA Paint when you save.",
    "settings.save": "Save",
    "settings.note": "\"Show palette popup\" is a toggle: press once to open, again to close, or close it with Esc. \"Toggle activation\" also turns on with one press and off with another (you can also click the switch on the status panel). The \"Activation trigger\" opens the popup while activation is on. It can be a left, right or middle click, or any keyboard key (if you pick left click, which your brush also uses, the popup may open while you draw). Changes apply right away when you save, no restart needed.",

    "panel.expandTitle": "SHA Paint — click to expand",
    "panel.active": "Active",
    "panel.trigger": "Trigger",
    "panel.editShortcuts": "Edit shortcuts",
    "panel.minimize": "Minimize",
    "panel.showPopup": "Show palette popup",
    "panel.clickFollow": "Toggle activation",
    "panel.activationTrigger": "Activation trigger (key or click)",
    "panel.triggerCloses": "Press trigger again to close",
    "panel.change": "Change",
    "panel.recordingHint": "Press a key or mouse button... (Esc to cancel)",

    "popup.fullGamut": "Toggle full gamut view",
    "popup.close": "Close palette (F11 / Esc)",
    "popup.applyFailed": "⚠ Couldn't apply the color — please try again",

    "license.title": "SHA Paint License",
    "license.label": "Paste the license key from your purchase confirmation email.",
    "license.activate": "Activate",
    "license.note": "Checking the key needs an internet connection. Once activated, SHA Paint keeps working offline.",
    "license.ok": "Your license is activated.",
    "license.okClose": "Your license is activated. You can close this window.",
    "license.checking": "Checking...",
    "license.failed": "Couldn't verify the key.",
    "license.error": "Something went wrong while checking: {msg}",
    "license.enterKey": "Please enter your license key.",
    "license.enterKeyExact": "Please enter the full license key.",
    "license.invalid": "This license key isn't valid.",
    "license.refunded": "This license was refunded or its payment was canceled.",
    "license.tooMany": "This key is already in use on {limit} PCs. Please contact us.",
    "license.serverError": "Server error ({status})",
    "license.offline": "Couldn't reach the internet."
  }
};

const SUPPORTED = ["ko", "en"];
let current = "ko";

// 설정값("auto"|"ko"|"en")과 OS 로캘("ko-KR", "en-US" ...)로 실제 언어를 정한다.
function resolveLang(pref, locale) {
  if (SUPPORTED.includes(pref)) return pref;
  return /^ko\b|^ko[-_]/i.test(String(locale || "")) ? "ko" : "en";
}

function setLang(lang) { current = SUPPORTED.includes(lang) ? lang : "en"; }
function getLang() { return current; }

function t(key, vars, lang) {
  const l = lang || current;
  let s = (STRINGS[l] && STRINGS[l][key]) || STRINGS.ko[key] || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  return s;
}

// data-i18n="key" → textContent, data-i18n-title / data-i18n-placeholder → 속성
function applyDom(doc, lang) {
  doc.documentElement.lang = lang;
  doc.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n, null, lang); });
  doc.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle, null, lang); });
  doc.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder, null, lang); });
}

module.exports = { STRINGS, SUPPORTED, resolveLang, setLang, getLang, t, applyDom };
