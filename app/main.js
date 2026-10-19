const { app, BrowserWindow, screen, Tray, Menu, ipcMain, shell } = require("electron");

// SHA Paint가 중복으로 여러 개 실행되는 걸 막는다. 예전부터 "프로세스가
// 안 꺼진다"는 보고가 있었는데, 만약 사용자가 실수로(또는 이전 실행이
// 완전히 안 꺼진 채로) SHA Paint를 두 번 실행하면, 두 번째 인스턴스가
// TCP(51900)/WS(51837) 포트를 잡으려다 실패하면서 "겉보기엔 실행됐지만
// 실제로는 첫 번째(예전) 인스턴스만 정상 작동하는" 아주 헷갈리는 상황이
// 생긴다 — UXP는 어쨌든 먼저 떠 있던 인스턴스에 연결되니 "작동은 하는데"
// 지금 보고 있는 로그 파일(이번에 새로 켠 인스턴스 것)에는 그 연결 기록이
// 전혀 안 남는 식으로 나타난다. 이제 두 번째 실행 자체를 즉시 종료시켜서
// 이런 혼란을 원천 차단한다.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  console.log("[overlay] SHA Paint가 이미 실행 중이라 이 인스턴스는 즉시 종료합니다.");
  app.quit();
} else {
  app.on("second-instance", () => {
    // 사용자가 또 실행하려고 시도한 순간 — 이미 떠 있는 트레이/상태
    // 패널이 있다는 걸 알려주기 위해 로그를 남긴다.
    console.log("[overlay] 두 번째 실행 시도가 감지됨(이미 실행 중이므로 무시됨)");
  });
}

const path = require("path");
const fs = require("fs");
const { WebSocketServer } = require("ws");
const { uIOhook, UiohookKey } = require("uiohook-napi");
const { activeWindow, openWindows } = require("@miniben90/x-win");
// Windows에서는 PowerShell+COM, macOS에서는 AppleScript+ExtendScript를
// 쓴다 — 두 모듈은 완전히 동일한 공개 인터페이스
// (startBridge/setForegroundColor/activateTool/testConnection/stopBridge)
// 를 제공하므로, main.js의 나머지 코드는 어느 쪽이 로드됐는지 신경 쓸
// 필요가 없다.
const comBridge = process.platform === "darwin"
  ? require("./mac-bridge.js")
  : require("./com-bridge.js");
const { loadConfig, saveConfig } = require("./config.js");
const {
  rgbToLab,
  relativeLuminance,
  abToPolar,
  findLightnessRangeForChroma
} = require("./colorMath.js");

// ---------------------------------------------------------------------
// 콘솔 로그를 파일에도 동시에 기록한다. 터미널을 매번 찾기 번거로울 수
// 있으니, 문제가 생기면 이 파일 하나만 열어서 내용을 보내달라고 안내하기
// 위함. app.whenReady() 이전에도 로그가 날 수 있어서 최상단에서 바로
// 설정한다.
let logFilePath = null;
function setupFileLogging() {
  try {
    logFilePath = path.join(app.getPath("userData"), "sha-paint-log.txt");
    const origLog = console.log.bind(console);
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    function writeLine(prefix, args) {
      try {
        const line = `[${new Date().toISOString()}] ${prefix} ` + args.map(String).join(" ") + "\n";
        fs.appendFileSync(logFilePath, line);
      } catch (e) { /* 로그 파일 쓰기 실패는 무시 (콘솔 로그는 이미 나갔음) */ }
    }
    console.log = (...args) => { origLog(...args); writeLine("LOG", args); };
    console.error = (...args) => { origError(...args); writeLine("ERR", args); };
    console.warn = (...args) => { origWarn(...args); writeLine("WARN", args); };
    console.log("[overlay] 로그 파일 경로:", logFilePath);
  } catch (e) {
    console.error("[overlay] 파일 로깅 설정 실패:", e.message);
  }
}

// ---------------------------------------------------------------------
// v3.7: 팝업 열고 닫는 조건 통합 + 드래그 이동 + 즉시 반영 버그 수정
// ---------------------------------------------------------------------
// 팝업을 열고 닫는 조건은 다음과 같다:
//   1. F11을 누른다        -> 열림 (닫혀 있었다면), 이미 열려 있으면 닫힘 (토글)
//   2. 펜 촉이 닿는다(좌클릭) -> F9(클릭 추적 모드)가 켜져 있을 때, 안 열려
//      있으면 엶 (펜을 떼도 안 닫힘 — F11로만 닫을 수 있음)
//   3. 열린 상태에서 F11을 한 번 더 누르면 -> 닫힘
// F11은 이제 keydown/keyup hold가 아니라 "한 번 누르면 토글"이고,
// 클릭 추적 모드(F9)와 서로 배타적이지 않다 — F9는 그저 "펜 터치로도 열 수
// 있게 하는" 추가 트리거일 뿐, F11은 항상 그대로 작동한다.
// 팝업 창은 상단 바를 드래그해서 원하는 위치로 옮길 수 있다.
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Photoshop이 지금 활성 앱인지 확인 (v3.9 항목 6)
// ---------------------------------------------------------------------
// @miniben90/x-win의 activeWindow()는 동기 함수라 async/await 없이 바로
// 쓸 수 있다. 실패(권한 문제, 지원 안 되는 환경 등)하면 기능을 완전히
// 막지 않도록 안전하게 "허용"으로 폴백한다.
function isPhotoshopActive() {
  try {
    const win = activeWindow();
    if (!win) return false;
    const execName = ((win.info && win.info.execName) || "").toLowerCase();
    const title = (win.title || "").toLowerCase();
    const result = execName.includes("photoshop") || title.includes("photoshop");
    if (!result) {
      // 진단용: Photoshop이 아니라고 판단한 그 순간의 실제 활성 창 정보를
      // 남긴다. 만약 Photoshop이 띄운 대화상자(색상 피커, 필터 갤러리 등)의
      // execName/title에 "photoshop"이 안 들어있어서 오탐되는 거라면,
      // 이 로그로 정확한 창 이름을 확인해서 예외 목록에 추가할 수 있다.
      console.log(`[overlay] isPhotoshopActive=false 판정. 실제 활성 창: execName="${execName}" title="${title}"`);
    }
    return result;
  } catch (e) {
    console.error("[overlay] 활성 창 확인 실패 (Photoshop 감지 없이 계속 진행):", e.message);
    return true;
  }
}

// Photoshop을 최소화하거나 다른 앱으로 전환하거나 아예 종료하면, 열려있던
// 팝업도 함께 사라지게 한다. isPhotoshopActive()는 "지금 Photoshop이
// 활성(포커스) 앱인지"를 확인하는데, 최소화/전환/종료 셋 다 공통적으로
// "더 이상 활성 앱이 아님"이라는 상태로 나타나므로 이 하나로 세 경우를
// 전부 감지할 수 있다. 팝업은 focusable:false라 사용자가 팝업 안에서
// 필드를 드래그하는 동안에도 Photoshop이 계속 활성 상태로 유지되므로,
// 이 감시가 조작 도중 실수로 팝업을 닫아버리는 일은 없다.
// 폴링 주기를 400ms->150ms로, 필요 연속 횟수를 3->2로 줄였다(150ms*2=
// 300ms, 예전 1.2초 대비 훨씬 빠름). 예전엔 COM 브릿지가 명령마다 새
// PowerShell 프로세스를 띄워서 그때 아주 짧게 포커스가 흔들릴 가능성이
// 있어 디바운스를 넉넉히 뒀는데, 지금은 상시 연결(TCP)이라 그 걱정이
// 없다. "카톡 등 다른 창으로 전환했는데도 팔레트가 한참 동안 계속
// 앞에 떠 있다"는 피드백이 있어서, 반응 속도 자체를 올렸다.
// 폴링 주기 150ms, 연속 4회(=600ms)로 조정했다. 처음엔 2회(300ms)로
// 더 빠르게 했었는데, 그게 오히려 Photoshop이 띄우는 대화상자(색상
// 피커 등 제목에 "photoshop"이 안 들어가는 창)로 인한 순간적인 오탐에
// 더 취약하게 만들었을 수 있어서(위 isPhotoshopActive 진단 로그로
// 확인 예정) 한 단계 완화했다. 그래도 예전(1.2초)보단 2배 빠르다.
const PHOTOSHOP_WATCH_INTERVAL_MS = 150;
const PHOTOSHOP_INACTIVE_THRESHOLD = 4; // 연속 이만큼 "비활성" 감지돼야 실제로 숨김
let photoshopInactiveStreak = 0;

// Photoshop이 활성 앱일 때만 SHA Paint의 창들(팝업, 상태 패널)이 화면에
// 보이도록 한다. 예전엔 "항상 위" 속성만 껐다 켰다 했는데, 그건 "맨
// 뒤로 보낸다"가 아니라 "강제 최상단 고정을 해제한다"는 뜻이라 —
// 꺼져도 z-순서상 여전히 위쪽에 남아있을 수 있어서, 지금 활성 창이
// 아닌 다른 창들 위에는 계속 떠 있는 경우가 있었다(실제로 재현됨).
// 그래서 아예 창 자체를 숨기고/보이는 방식으로 바꿨다 — 안 보이는
// 창은 어떤 창도 가릴 수 없으니 훨씬 확실하다. popupVisible(사용자가
// "열어뒀다"고 여기는 논리적 상태)과는 별개로 관리한다 — 사용자가
// 닫지 않는 한 popupVisible은 그대로 true인 채, 물리적으로만
// 보였다 안 보였다 한다.
function startPhotoshopWatch() {
  setInterval(() => {
    const active = isPhotoshopActive();

    if (active) {
      photoshopInactiveStreak = 0;
      syncVisibility(overlayWin, popupVisible, "overlay");
      syncVisibility(statusPanelWin, statusPanelIntroduced, "panel");
      return;
    }

    // COM 브릿지가 PowerShell 프로세스를 스폰할 때 아주 짧게 포커스에
    // 영향을 줄 가능성이 있어서, 1번 "비활성"으로 잡혔다고 바로 반응하지
    // 않고 연속으로 여러 번 감지될 때만 실제로 반응한다.
    photoshopInactiveStreak++;
    if (photoshopInactiveStreak >= PHOTOSHOP_INACTIVE_THRESHOLD) {
      syncVisibility(overlayWin, false, "overlay"); // wantVisible=false 강제
      syncVisibility(statusPanelWin, false, "panel");
      photoshopInactiveStreak = 0;
    }
  }, PHOTOSHOP_WATCH_INTERVAL_MS);
}

// win: 대상 창, wantVisible: Photoshop이 활성이고 논리적으로도 열려있어야
// 보이는 상태인지, kind: "overlay"|"panel" (로그 구분용).
function syncVisibility(win, wantVisible, kind) {
  if (!win || win.isDestroyed()) return;
  const isVisible = win.isVisible();
  if (wantVisible && !isVisible) {
    win.showInactive(); // 포커스는 뺏지 않음 -> Photoshop이 계속 활성 상태 유지
    if (kind === "overlay") overlayWin.setIgnoreMouseEvents(false);
  } else if (!wantVisible && isVisible) {
    win.hide();
    if (kind === "overlay") overlayWin.setIgnoreMouseEvents(true);
  }
}

// ---------------------------------------------------------------------
// Photoshop 플러그인 자동 설치 (설치파일 하나로 전체 과정을 끝내기 위함)
// ---------------------------------------------------------------------
// electron-builder가 package.json의 extraResources 설정으로 .ccx 파일을
// 설치 폴더의 resources/ 안에 그대로 넣어준다. 이 앱을 처음 실행할 때
// 그 .ccx를 shell.openPath()로 "더블클릭한 것처럼" 열면, Windows가 파일
// 연결(Creative Cloud Desktop이 설치 시 등록해둔 .ccx 연결)에 따라 CCD의
// 설치 창을 자동으로 띄운다. 완전 자동 설치(무음)는 아니고 사용자가 그
// 창에서 "Install locally"를 한 번 눌러야 하지만, .ccx 파일을 직접 찾아서
// 더블클릭하는 수고는 덜어준다.
function getBundledCcxPath() {
  // 패키징된 앱(electron-builder로 만든 설치판)에서는 extraResources가
  // process.resourcesPath 아래에 위치하고, 개발 중(npm start)에는
  // 프로젝트 폴더의 resources/ 안에 있다.
  const packaged = path.join(process.resourcesPath, "tourbox-luminance-picker.ccx");
  const dev = path.join(__dirname, "resources", "tourbox-luminance-picker.ccx");
  return fs.existsSync(packaged) ? packaged : dev;
}

function openPluginInstaller() {
  const ccxPath = getBundledCcxPath();
  if (!fs.existsSync(ccxPath)) {
    console.error("[overlay] 번들된 .ccx를 찾을 수 없음:", ccxPath);
    return;
  }
  console.log("[overlay] Photoshop 플러그인 설치 창을 엽니다:", ccxPath);
  shell.openPath(ccxPath).then((err) => {
    if (err) console.error("[overlay] .ccx 열기 실패 (연결 프로그램이 없을 수 있음):", err);
  });
}

// 최초 실행 때만 자동으로 한 번 열어준다 (매번 실행할 때마다 뜨면 성가시므로
// userData에 플래그 파일을 남겨서 이후엔 자동으로는 안 뜨게 한다. 트레이
// 메뉴의 "Photoshop 플러그인 설치..."로 언제든 다시 열 수 있다).
function installPhotoshopPluginIfFirstRun() {
  const flagPath = path.join(app.getPath("userData"), "plugin-install-attempted.flag");
  if (fs.existsSync(flagPath)) return;
  openPluginInstaller();
  try { fs.writeFileSync(flagPath, new Date().toISOString()); } catch (e) { /* 무시 */ }
}

const WS_PORT = 51837;
const POPUP_WIDTH = 300;
const POPUP_HEIGHT = 340;
const LEFT_MOUSE_BUTTON = 1;   // uiohook-napi 규약: 1=좌클릭 (브러시가 쓰는 바로 그 클릭). 실제 테스트로 확인됨.
// 사람이 읽을 수 있는 마우스 버튼 이름. 3(중클릭)은 실제 테스트로 확인된
// 값이고, 1/2는 관례상의 추정이다 — 녹화 후 라벨이 이상하면 알려주세요.
const MOUSE_BUTTON_NAMES = { 1: "좌클릭", 2: "우클릭", 3: "중클릭" };

function triggerLabel(trigger) {
  if (!trigger) return "-";
  if (trigger.type === "mouse") {
    return MOUSE_BUTTON_NAMES[trigger.code] || `마우스 버튼 ${trigger.code}`;
  }
  const entry = Object.entries(UiohookKey).find(([, code]) => code === trigger.code);
  return entry ? entry[0] : `code:${trigger.code}`;
}

let overlayWin = null;
let statusPanelWin = null;
let settingsWin = null;
let tray = null;
let wss = null;
let uxpSocket = null;
let config = null;
let popupVisible = false;
let statusPanelIntroduced = false; // 상태 패널을 한 번이라도 보여준 적 있는지 (PS_ALIVE 이후 true)
let heldKeys = new Set();
let repeatingKeys = new Set(); // OS 키 반복(auto-repeat)으로 토글이 여러 번 발동되는 것 방지용
let settingsRecordingTarget = null;
let recordingRequestSender = null; // 녹화를 요청한 창의 webContents (설정 창 또는 상태 패널)

// 기본값을 다시 ON으로 바꿨다. 예전엔(v4.4) 클릭 추적 모드의 트리거가
// 좌클릭이라 브러시 클릭과 겹쳐서 기본 OFF로 되돌렸었는데, 지금은
// 트리거가 중클릭(config.clickFollowButton, 기본값 "middle")이라 브러시
// 작업과 전혀 겹치지 않는다 — 그래서 다시 기본 ON으로 해도 안전하다.
// "Photoshop 실행 -> SHA Paint 실행 -> 단축키로 활성화"까지 매번 거쳐야
// 했던 시작 과정의 불편함(피드백)도 이걸로 한 단계 줄어든다. 그래도 끄고
// 싶으면 F9(또는 설정에서 바꾼 키) 한 번, 또는 새로 생긴 상태 패널에서
// 클릭 한 번으로 끌 수 있다.
let clickFollowMode = true;
let mouseButtonDown = false;       // 좌클릭(펜 촉)을 지금 누르고 있는 중인지 (브러시 스트로크 진행 여부 판단용)
let strokeEndTime = 0;             // 가장 최근 mouseup 시각 — 뗀 직후 잠깐(그레이스 기간)도 오독 방어
const STROKE_END_GRACE_MS = 150;   // mouseup 직후에도 이 시간 동안은 색 보고를 의심(펜에서 검정 오독이 살짝 늦게 들어오는 경우 방어)

const HISTORY_MAX = 8;

const state = {
  mode: "lab",
  baseRgb: { r: 128, g: 128, b: 128 },
  baseLab: null,
  baseY: null,
  hueDeg: 0,
  chroma: 0,
  prevRgb: { r: 90, g: 90, b: 90 },
  lightnessRange: { Lmin: 0, Lmax: 100 }, // "이 색상을 유지한 채" 가능한 L* 범위 (hue/chroma 바뀔 때만 재계산)
  history: [] // 최근 확정한 색들 (최신이 앞) — 팔레트 히스토리 표시용
};

// 실제로 브러시에 "확정"된 색만 히스토리에 남긴다 (필드 드래그로
// 색을 고르는 중간 과정이 아니라, pointerup으로 커밋되거나 휠 조정이
// 끝나서 실제 적용된 시점에만 호출됨). 바로 직전 색과 같으면 중복
// 추가하지 않는다.
function pushHistory(r, g, b) {
  const last = state.history[0];
  if (last && last.r === r && last.g === g && last.b === b) return;
  state.history.unshift({ r, g, b });
  if (state.history.length > HISTORY_MAX) state.history.length = HISTORY_MAX;
}

function ensureBaseReady() {
  if (state.baseLab) return;
  state.baseLab = rgbToLab(state.baseRgb.r, state.baseRgb.g, state.baseRgb.b);
  state.baseY = relativeLuminance(state.baseRgb.r, state.baseRgb.g, state.baseRgb.b);
}

function setBaseFromRgb(r, g, b) {
  state.prevRgb = state.baseRgb;
  state.baseRgb = { r, g, b };
  state.baseLab = rgbToLab(r, g, b);
  state.baseY = relativeLuminance(r, g, b);
  const { chroma, hueDeg } = abToPolar(state.baseLab.a, state.baseLab.b);
  state.chroma = chroma;
  state.hueDeg = hueDeg;
  // hue/chroma가 바뀌었으니(=색 자체가 바뀌었으니) 명도 범위도 다시 계산.
  // 이 계산 자체는 좀 걸리지만(수백 번의 findMaxChromaForHue 호출), hue나
  // chroma가 바뀔 때만(스포이드/스캔/타일선택 등) 하고, 순수하게 명도만
  // 조절하는 휠/슬라이더 조작에서는 캐시된 값을 그대로 재사용한다.
  state.lightnessRange = findLightnessRangeForChroma(hueDeg, chroma);
}

// ---------------------------------------------------------------------
// 오버레이 창
// ---------------------------------------------------------------------

function createOverlayWindow() {
  overlayWin = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    minWidth: 200,
    minHeight: 240,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true, // 사용자가 팝업 크기를 직접 조절할 수 있게. 내용물은
                      // overlay.js 쪽에서 창 크기에 맞춰 다시 그려진다.
    movable: true,
    hasShadow: false,
    show: false,
    focusable: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: false }
  });
  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.setIgnoreMouseEvents(true); // 평소엔 완전 클릭-스루

  // 팝업 창(렌더러)에서 나는 console.log/error, 그리고 처리 안 된 예외까지
  // 이 터미널(npm start 실행 창)로 그대로 보여준다. 렌더러 콘솔은 별도
  // 개발자 도구를 열어야만 보이는데, 이 창은 frame:false라 우클릭으로
  // devtools를 열기도 번거로워서 이렇게 강제로 끌어온다.
  // loadFile보다 먼저 등록해야 preload 스크립트의 console.log도 놓치지 않는다.
  overlayWin.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[overlay-popup:${level}] ${message}  (${sourceId}:${line})`);
  });

  overlayWin.loadFile(path.join(__dirname, "overlay.html"));
}

// ---------------------------------------------------------------------
// 상태 패널: Photoshop 실행 -> SHA Paint 실행 -> (단축키로 활성화까지
// 눌러야 하는) 매번 거쳐야 했던 시작 과정이 불편하다는 피드백에 따라
// 추가함. Photoshop이 켜진 게 처음 확인되면(PS_ALIVE) 화면 구석에
// 자동으로 뜨고, 클릭 추적 모드를 단축키 없이 클릭 한 번으로 켜고 끌
// 수 있다. 이제 클릭 추적 모드 기본값이 ON이라, 대부분은 이 패널을
// 보기만 하고 특별히 끌 필요가 있을 때만 클릭하면 된다.
// ---------------------------------------------------------------------
const STATUS_PANEL_WIDTH = 420; // 콘텐츠 실측(트리거 라벨이 길 때 최악의 경우 ~376px) + 여유
const STATUS_PANEL_HEIGHT = 56;
// 단축키 편집 행 4개(팝업표시/활성화전환/트리거/트리거닫기) + 힌트가
// 펼쳐졌을 때 높이. 자동 백그라운드 트리거/재연결 버튼은 UXP 패널이
// Photoshop 안에서 독립된 OS 창이 아니라 구조적으로 외부에서 열거나
// 숨길 수 없다는 게 확인돼서 제거했다 — 패널은 사용자가 수동으로 한
// 번 열어서 도킹해두는 방식으로 정리함.
const STATUS_PANEL_EXPANDED_HEIGHT = 300;
const MINIMIZED_PANEL_SIZE = 40; // 최소화 시 크기 (작은 정사각형)
let statusPanelExpanded = false;
let statusPanelMinimized = false;
let preMinimizeBounds = null; // 최소화 직전 크기를 기억해뒀다가 복귀 시 그대로 되돌림

// Photoshop의 실제 창 위치를 찾아서, 그 창이 있는 모니터를 반환한다.
// activeWindow()는 "지금 포커스된 창"만 알려줘서, 그 순간 Photoshop이
// 포커스가 아니면(예: 다른 앱을 보고 있을 때) 못 찾는다. openWindows()는
// 열려있는 모든 창을 다 알려주므로, 그중 Photoshop을 이름으로 찾아서
// 그 창의 실제 좌표를 쓴다 — 이러면 다중 모니터에서 Photoshop이 보조
// 모니터에 있어도 패널이 그 모니터에 뜬다. 뭔가 실패하면(권한 문제 등)
// 안전하게 주 모니터로 폴백한다.
function findPhotoshopDisplay() {
  try {
    const wins = openWindows();
    const psWin = wins.find((w) => {
      const execName = ((w.info && w.info.execName) || "").toLowerCase();
      const title = (w.title || "").toLowerCase();
      return execName.includes("photoshop") || title.includes("photoshop");
    });
    if (psWin && psWin.position) {
      const { x, y, width, height } = psWin.position;
      return screen.getDisplayMatching({ x, y, width, height });
    }
  } catch (e) {
    console.error("[overlay] Photoshop 창 위치 찾기 실패, 주 모니터로 폴백:", e.message);
  }
  return screen.getPrimaryDisplay();
}

// x/y(우상단 정렬)만 재계산한다 — 크기는 지금 창이 갖고 있는 값을 그대로
// 존중한다. 사용자가 직접 드래그해서 리사이즈했을 수도 있으니, 여기서
// 임의로 STATUS_PANEL_WIDTH 같은 고정값으로 되돌리지 않는다. 크기 자체를
// 바꾸고 싶으면 setStatusPanelSize()를 따로 쓴다.
function positionStatusPanel() {
  if (!statusPanelWin || statusPanelWin.isDestroyed()) return;
  const display = findPhotoshopDisplay();
  const bounds = display.workArea;
  const margin = 16;
  const current = statusPanelWin.getBounds();
  statusPanelWin.setBounds({
    x: Math.round(bounds.x + bounds.width - current.width - margin),
    y: Math.round(bounds.y + margin),
    width: current.width,
    height: current.height
  });
}

// 크기를 명시적으로 바꿔야 하는 경우(펼침/접힘, 최소화/복귀)에만 쓴다.
function setStatusPanelSize(width, height) {
  if (!statusPanelWin || statusPanelWin.isDestroyed()) return;
  const current = statusPanelWin.getBounds();
  statusPanelWin.setBounds({ ...current, width, height });
  positionStatusPanel(); // 크기가 바뀌었으니 우상단 정렬 좌표를 다시 계산
}

function createStatusPanelWindow() {
  statusPanelWin = new BrowserWindow({
    width: STATUS_PANEL_WIDTH,
    height: STATUS_PANEL_HEIGHT,
    minWidth: MINIMIZED_PANEL_SIZE, // 최소화 크기보다 작아지진 않게
    minHeight: MINIMIZED_PANEL_SIZE,
    maxWidth: 640,
    maxHeight: 500,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true, // 사용자가 원하는 크기로 직접 조절 가능
    movable: true,
    hasShadow: false,
    show: false,
    focusable: false, // 팝업과 동일하게 포커스를 뺏지 않아서 Photoshop이 계속 활성 상태 유지
    webPreferences: { preload: path.join(__dirname, "status-preload.js"), contextIsolation: true, sandbox: false }
  });
  statusPanelWin.setAlwaysOnTop(true, "screen-saver");
  positionStatusPanel(); // 생성 시점의 최선의 추측 (아직 PS_ALIVE 전이라 부정확할 수 있음, 표시 직전에 다시 계산함)

  statusPanelWin.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[status-panel:${level}] ${message}  (${sourceId}:${line})`);
  });

  statusPanelWin.loadFile(path.join(__dirname, "status-panel.html"));
  statusPanelWin.webContents.on("did-finish-load", () => notifyStatusPanel());
}

// 패널의 톱니바퀴 버튼으로 "단축키 편집" 섹션을 펼치거나 접을 때, 그만큼
// 창 높이 자체를 바꿔준다(내용이 넘치지 않게, 스크롤 생기지 않게). 너비는
// 사용자가 리사이즈했을 수 있으니 그대로 유지한다.
ipcMain.on("status-panel-set-expanded", (_evt, expanded) => {
  statusPanelExpanded = !!expanded;
  if (!statusPanelWin || statusPanelWin.isDestroyed() || statusPanelMinimized) return;
  const currentWidth = statusPanelWin.getBounds().width;
  setStatusPanelSize(currentWidth, statusPanelExpanded ? STATUS_PANEL_EXPANDED_HEIGHT : STATUS_PANEL_HEIGHT);
});

// 최소화 버튼: 지금 크기(펼침 상태든 사용자가 리사이즈한 크기든)를
// 기억해뒀다가 작은 정사각형으로 줄이고, 복귀 버튼을 누르면 그 크기로
// 정확히 되돌린다.
ipcMain.on("status-panel-set-minimized", (_evt, minimized) => {
  if (!statusPanelWin || statusPanelWin.isDestroyed()) return;
  const wantMinimized = !!minimized;
  if (wantMinimized === statusPanelMinimized) return;

  if (wantMinimized) {
    const b = statusPanelWin.getBounds();
    preMinimizeBounds = { width: b.width, height: b.height };
    statusPanelMinimized = true;
    setStatusPanelSize(MINIMIZED_PANEL_SIZE, MINIMIZED_PANEL_SIZE);
  } else {
    statusPanelMinimized = false;
    const restore = preMinimizeBounds || { width: STATUS_PANEL_WIDTH, height: STATUS_PANEL_HEIGHT };
    preMinimizeBounds = null;
    setStatusPanelSize(restore.width, restore.height);
  }
});

// 클릭 추적 모드가 (단축키로든, 패널 클릭으로든) 바뀔 때마다 패널에
// 최신 상태를 밀어준다. 패널이 아직 생성 전이거나 닫혀있으면 조용히
// 무시한다.
function notifyStatusPanel() {
  if (!statusPanelWin || statusPanelWin.isDestroyed()) return;
  statusPanelWin.webContents.send("status-panel-state", {
    clickFollowMode,
    triggerLabel: triggerLabel(config.activationTrigger),
    showPopupKey: config.showPopupKey,
    clickFollowKey: config.clickFollowKey,
    triggerTogglesClose: config.triggerTogglesClose,
    bridgeHealthy
  });
}

// 반대 방향: 상태 패널(또는 다른 경로)에서 config 값이 바뀌었을 때,
// 마침 설정 창이 열려 있으면 그쪽에도 최신 값을 밀어준다. settings.js가
// 이미 "config-loaded" 이벤트를 받으면 currentConfig에 병합하고 화면을
// 다시 그리도록 돼 있어서(onConfigLoaded), 그 채널을 그대로 재사용한다.
function notifySettingsWindow() {
  if (!settingsWin || settingsWin.isDestroyed()) return;
  settingsWin.webContents.send("config-loaded", config);
}

ipcMain.on("status-panel-toggle-click-follow", () => {
  clickFollowMode = !clickFollowMode;
  console.log("[overlay] 활성화(패널에서 변경):", clickFollowMode ? "ON" : "OFF");
  notifyStatusPanel();
});

function positionOverlayAtCursor() {
  const current = overlayWin.getBounds();
  const w = current.width;
  const h = current.height;

  const { x, y } = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint({ x, y });
  const bounds = display.workArea;

  // 커서 살짝 오른쪽 아래에 뜨도록 (커서 자체를 안 가리게), 화면 밖으로
  // 나가면 반대쪽으로 붙인다.
  let px = x + 16;
  let py = y + 16;
  if (px + w > bounds.x + bounds.width) px = x - w - 16;
  if (py + h > bounds.y + bounds.height) py = y - h - 16;
  px = Math.max(bounds.x, Math.min(px, bounds.x + bounds.width - w));
  py = Math.max(bounds.y, Math.min(py, bounds.y + bounds.height - h));

  overlayWin.setBounds({ x: Math.round(px), y: Math.round(py), width: w, height: h });
}

function sendPopupOpen() {
  ensureBaseReady();
  let sendL = state.baseLab.L;
  if (!Number.isFinite(sendL)) {
    console.error("[overlay] state.baseLab.L이 유효하지 않음:", sendL, "-> 50으로 대체. baseRgb:", JSON.stringify(state.baseRgb));
    sendL = 50;
  }
  overlayWin.webContents.send("popup-open", {
    mode: state.mode,
    L: sendL,
    Y: state.baseY,
    hueDeg: state.hueDeg,
    chroma: state.chroma,
    prevRgb: state.prevRgb,
    lightnessRange: state.lightnessRange,
    history: state.history
  });
}

// 실제로 화면에 표시/숨김을 전환하는 저수준 함수. 위치는 여기서 "보여줄 때"
// 딱 한 번만 잡는다 — 핀 모드가 아니면 그 이후로는 다시 안 움직인다.
function showPopup() {
  if (popupVisible) return;
  popupVisible = true;
  console.log("[overlay] 팝업 열림");
  positionOverlayAtCursor();
  sendPopupOpen();
  overlayWin.setIgnoreMouseEvents(false); // 클릭/드래그를 받아야 하니 클릭스루 해제
  overlayWin.showInactive(); // 포커스는 뺏지 않음 -> Photoshop이 계속 활성 상태 유지
}

function hidePopup() {
  if (!popupVisible) return;
  if (!overlayWin || overlayWin.isDestroyed()) {
    console.error("[overlay] hidePopup 호출됐는데 overlayWin이 없거나 파괴된 상태 - popupVisible만 리셋");
    popupVisible = false;
    return;
  }
  popupVisible = false;
  console.log("[overlay] 팝업 닫힘");
  overlayWin.hide();
  overlayWin.setIgnoreMouseEvents(true); // 다시 클릭-스루로 복귀
}

// 색을 고르거나 스포이드로 전환해도 절대 여기서 hidePopup()을 직접
// 호출하지 않는다 — 팝업을 닫는 유일한 방법은 F11을 다시 누르는 것뿐이다
// (그래야 "선택해도 안 닫히고 그대로 유지"가 보장된다).

// 필드에서 색을 확정하면(드래그 후 pointerup) 이 IPC로 들어온다.
// 예전엔 여기서 hidePopup()을 호출했는데, 그러면 F11을 계속 누르고 있어도
// 팝업이 닫혔다가 다음 keydown(OS 키 반복)에서 "그 순간의 새 커서 위치"로
// 다시 열려서 마치 팝업이 움직인 것처럼 보였다. 이제는 팝업 표시 여부를
// updatePopupVisibility()만 결정하므로, 색을 골라도 위치가 고정된 채 유지된다.

ipcMain.on("popup-color-picked", (_evt, payload) => {
  console.log(`[overlay] 팔레트에서 색 선택 수신: r=${payload.r} g=${payload.g} b=${payload.b}`);
  setBaseFromRgb(payload.r, payload.g, payload.b);
  pushHistory(payload.r, payload.g, payload.b);
  sendToUxp({ type: "setColor", r: payload.r, g: payload.g, b: payload.b });
});

// ---------------------------------------------------------------------
// UXP 플러그인과의 통신
// ---------------------------------------------------------------------

// UXP 플러그인(WebSocket)과 COM 브릿지(PowerShell) 두 경로로 동시에
// 보낸다. UXP 패널이 열려서 WS가 연결돼 있으면 그쪽으로도 가고(패널
// UI가 있다면 그것도 같이 갱신됨), COM 브릿지는 패널이 열려있든 아니든
// Photoshop이 켜져만 있으면 항상 동작한다 — 그래서 "팝업만으로" 완전히
// 동작할 수 있게 되는 것이다. 두 경로가 같은 값을 중복으로 적용해도
// 결과는 동일해서 문제없다.
// 신뢰도 개선: 색 적용이 실제로 성공했는지를 상태로 갖고 있다가, 실패하면
// 팝업/상태 패널에 즉시 티가 나게 한다. 예전엔 실패해도 로그 파일을
// 직접 열어봐야만 알 수 있었는데, 이러면 "색을 골랐는데 실제로 반영된
// 건지 아닌지" 불안한 채로 작업을 계속하게 된다 — 이제는 실패를 조용히
// 삼키지 않고 바로 화면에 표시한다.
let bridgeHealthy = true;
function updateBridgeHealth(success) {
  bridgeHealthy = success;
  notifyStatusPanel();
  if (!success && overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send("popup-apply-failed");
  }
}

let lastSetCommandTime = 0; // 우리가 마지막으로 SET(전경색 설정) 명령을 보낸 시각
// applyIncomingColor는 app.whenReady() 안(아래)에서 정의되는데, WS 서버
// (startWsServer, 모듈 최상위 스코프)에서도 같은 방어 파이프라인을 타게
// 하려고 이 모듈 레벨 변수에 참조를 담아둔다. 예전엔 WS로 들어온 색은
// setBaseFromRgb만 부르고 pushHistory를 안 불러서 히스토리에 안 남는
// 문제도 있었는데, 이렇게 통합하면 그것도 함께 해결된다.
let handleExternalColor = null;

function sendToUxp(payload) {
  const wsConnected = uxpSocket && uxpSocket.readyState === uxpSocket.OPEN;
  console.log(`[overlay] sendToUxp(${payload.type}) 호출됨. WS 연결됨=${!!wsConnected}`);
  if (wsConnected) {
    uxpSocket.send(JSON.stringify(payload));
  }
  if (payload.type === "setColor") {
    lastSetCommandTime = Date.now();
    comBridge.setForegroundColor(payload.r, payload.g, payload.b, updateBridgeHealth);
  } else if (payload.type === "activateEyedropper") {
    comBridge.activateTool("eyedropperTool");
  } else if (payload.type === "activateBrush") {
    comBridge.activateTool("paintbrushTool");
  }
}

function startWsServer() {
  wss = new WebSocketServer({ port: WS_PORT });
  wss.on("connection", (socket) => {
    uxpSocket = socket;
    console.log("[overlay] UXP plugin connected");
    socket.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === "foregroundColor") {
          if (data.trusted) {
            // UXP가 Photoshop의 set 이벤트 디스크립터에서 재조회 없이
            // 직접 뽑아낸 값 — "그 순간 다시 물어본 값"이 아니라 "실제로
            // 그렇게 설정된 값"이라 오독일 수가 없다. 검정 방어 로직
            // (오실레이션 감지 등)을 거치면 오히려 예전 세션에서 확정된
            // 다른 색 조합 때문에 이 정확한 값이 억제될 위험이 있어서,
            // 방어 로직 없이 그대로 반영한다.
            setBaseFromRgb(data.r, data.g, data.b);
            pushHistory(data.r, data.g, data.b);
            if (popupVisible) sendPopupOpen();
          } else if (handleExternalColor) {
            // UXP 쪽 폴백(재조회) 경로 등 신뢰도가 확실치 않은 값은 COM
            // 폴링 경로와 동일한 방어 파이프라인을 통과시킨다.
            handleExternalColor(data.r, data.g, data.b, null);
          } else {
            // 아직 app.whenReady()가 다 안 끝나서 파이프라인이 준비 안 된
            // 극히 드문 타이밍이면, 안전하게 기존 방식으로라도 반영한다.
            setBaseFromRgb(data.r, data.g, data.b);
            if (popupVisible) sendPopupOpen();
          }
        }
      } catch (e) { console.warn("[overlay] bad message", e); }
    });
    socket.on("close", () => {
      if (uxpSocket === socket) {
        uxpSocket = null;
        // 패널을 닫아도 연결이 계속 유지되는지 궁금해하는 사용자를 위한
        // 로그 — 이 로그가 찍히면 실제로 끊긴 것이고(패널을 닫는 게
        // 곧 연결 종료), 안 찍히면 계속 연결이 유지되고 있다는 뜻이다.
        console.log("[overlay] UXP plugin disconnected — 패널을 닫으셨거나 Photoshop이 종료됐을 수 있습니다. COM 폴링(폴백)으로 전환합니다.");
      }
    });
  });
  wss.on("error", (e) => {
    if (e && e.code === "EADDRINUSE") {
      console.error(`[overlay] WS 서버 포트(${WS_PORT})가 이미 사용 중입니다 — 다른 SHA Paint 인스턴스가 실행 중일 수 있습니다. 작업 관리자에서 SHA Paint를 전부 종료하고 다시 실행해보세요.`);
    } else {
      console.error("[overlay] WS server error", e);
    }
  });
}

// ---------------------------------------------------------------------
// 전역 키보드 후킹 (uiohook-napi)
// ---------------------------------------------------------------------

function keyNameToUiohookCode(name) {
  // 예전엔 F8~F15 등 일부만 하드코딩된 표에 있어서, 그 표에 없는 키로
  // 녹화하면(예: F1) 저장은 되는데 실제 인식은 영원히 안 되는 버그가
  // 있었다. settings-key-label이 이름을 만들 때 UiohookKey의 실제
  // 프로퍼티명을 그대로 쓰므로, 여기서도 UiohookKey[name]으로 직접
  // 조회하면 uiohook이 지원하는 모든 키에 대해 항상 정확히 왕복된다.
  return UiohookKey[name];
}

function startInputHook() {
  uIOhook.on("keydown", (e) => {
   try {
    heldKeys.add(e.keycode);

    // 진단용: Esc가 실제로 uiohook에 감지되는지, 그 순간 popupVisible이
    // 뭐였는지를 무조건 남긴다. "Esc를 눌러도 안 닫힌다"는 재현 시
    // 이 로그 한 줄로 uiohook이 아예 못 받은 건지(로그 자체가 안 찍힘),
    // 받았는데 popupVisible이 이미 false였던 건지, 아니면 그 이후
    // 로직에서 막힌 건지 구분할 수 있다.
    if (e.keycode === UiohookKey.Escape) {
      console.log(`[overlay] Esc 감지됨. popupVisible=${popupVisible}`);
    }

    // 예전엔 녹화 응답을 항상 settingsWin에만 보냈는데, 이제는 상태
    // 패널에서도 녹화를 시작할 수 있어서, "누가 녹화를 요청했는지"
    // (recordingRequestSender)를 기억해뒀다가 그쪽으로 보낸다.
    if (recordingRequestSender && !recordingRequestSender.isDestroyed() && settingsRecordingTarget) {
      if (e.keycode === UiohookKey.Escape) {
        recordingRequestSender.send("key-recording-cancelled");
        settingsRecordingTarget = null;
        recordingRequestSender = null;
        return;
      }
      if (settingsRecordingTarget === "activationTrigger") {
        // 활성화 트리거는 키보드 키든 마우스 클릭이든 될 수 있어서,
        // 일반 키 전용 녹화(key-recorded)와 다른 채널로 보낸다.
        recordingRequestSender.send("trigger-recorded", { type: "key", code: e.keycode });
      } else {
        recordingRequestSender.send("key-recorded", { keycode: e.keycode });
      }
      settingsRecordingTarget = null;
      recordingRequestSender = null;
      return;
    }

    // 활성화 트리거가 키보드 키로 설정돼 있으면, 그 키를 눌렀을 때도
    // (좌/중클릭과 동일하게) 팝업을 연다. config.triggerTogglesClose가
    // 켜져 있으면 이미 열려있을 때 다시 누르면 닫는다(F11과 같은 토글).
    if (config.activationTrigger && config.activationTrigger.type === "key" && e.keycode === config.activationTrigger.code) {
      if (!repeatingKeys.has(e.keycode)) {
        repeatingKeys.add(e.keycode);
        if (clickFollowMode && isPhotoshopActive()) {
          if (!popupVisible) {
            showPopup();
          } else if (config.triggerTogglesClose) {
            hidePopup();
          }
        }
      }
    }

    const popupCode = keyNameToUiohookCode(config.showPopupKey);
    if (popupCode && e.keycode === popupCode) {
      // OS 키 반복(누르고 있으면 keydown이 계속 들어옴)에 매번 토글되면
      // 깜빡거리므로, "이미 이 키가 눌린 상태로 기록돼 있으면" 무시한다.
      if (!repeatingKeys.has(e.keycode)) {
        repeatingKeys.add(e.keycode);
        console.log("[overlay] F11(팝업 표시 키) 눌림 감지. 현재 popupVisible:", popupVisible);
        if (popupVisible) {
          hidePopup(); // 닫는 건 Photoshop이 활성 상태가 아니어도 항상 허용
        } else if (isPhotoshopActive()) {
          // 여는 건 Photoshop이 지금 활성 앱일 때만 (항목 6)
          showPopup();
        } else {
          console.log("[overlay] Photoshop이 활성 앱이 아니라서 팝업을 열지 않음");
        }
      }
    }

    // Esc로도 팝업을 닫을 수 있게 (항목 1)
    if (e.keycode === UiohookKey.Escape && popupVisible) {
      console.log("[overlay] Esc로 팝업 닫기 실행");
      hidePopup();
      repeatingKeys.delete(popupCode); // 다음 F11 누름이 "열기"로 인식되도록 정리
    }

    const followCode = config.clickFollowKey ? keyNameToUiohookCode(config.clickFollowKey) : null;
    if (followCode && e.keycode === followCode) {
      clickFollowMode = !clickFollowMode;
      console.log("[overlay] 활성화:", clickFollowMode ? "ON (클릭으로도 팝업이 열림)" : "OFF");
      notifyStatusPanel();
    }
   } catch (err) {
     // 이전엔 이 핸들러 안에서 예외가 나면 조용히 삼켜져서(uiohook 콜백은
     // 예외를 던지면 그냥 무시되는 듯함), 그 이후 로직(Esc로 닫기 등)이
     // 실행이 안 되는데도 원인을 알 방법이 없었다. 이제 무조건 로그를
     // 남긴다 — "Esc를 눌러도 안 닫힌다"가 재현되면 이 로그가 찍혔는지
     // 확인하면 원인을 바로 알 수 있다.
     console.error("[overlay] keydown 핸들러에서 예외 발생:", err && err.stack ? err.stack : err);
   }
  });

  uIOhook.on("keyup", (e) => {
    heldKeys.delete(e.keycode);
    repeatingKeys.delete(e.keycode); // F11을 뗐으니 다음 누름은 다시 토글로 인식되게
  });

  // 좌클릭(브러시가 쓰는 바로 그 클릭)은 항상 스트로크 진행 여부를
  // 추적한다 (COM 감시가 스트로크 도중 색을 잘못 읽는 걸 무시하기 위한
  // 용도 — v4.6 참고). 활성화 상태에서 팝업을 여는 트리거는
  // config.activationTrigger로 정해지며, 마우스 버튼이든 키보드 키든
  // 될 수 있다(설정 창에서 녹화로 바꿀 수 있음).
  uIOhook.on("mousedown", (e) => {
    // "활성화 트리거" 녹화 중이면(설정 창이든 패널이든), 이 클릭을 그
    // 트리거로 기록하고 평소 동작(스트로크 추적, 팝업 열기)은 건너뛴다.
    if (recordingRequestSender && !recordingRequestSender.isDestroyed() && settingsRecordingTarget === "activationTrigger") {
      recordingRequestSender.send("trigger-recorded", { type: "mouse", code: e.button });
      settingsRecordingTarget = null;
      recordingRequestSender = null;
      return;
    }

    // 펜/마우스가 검은색으로 오독되는 문제를 진단하기 위한 로그. 눌린
    // 버튼 번호를 전부 남긴다 — 만약 펜 촉 터치가 LEFT_MOUSE_BUTTON(1)이
    // 아닌 다른 번호로 들어온다면, 아래 mouseButtonDown 게이트 자체가
    // 걸리지 않아서 스트로크 도중 색 오독이 그대로 새어나갈 수 있다.
    console.log(`[overlay] mousedown 감지: e.button=${e.button} (LEFT_MOUSE_BUTTON=${LEFT_MOUSE_BUTTON})`);

    if (e.button === LEFT_MOUSE_BUTTON) {
      mouseButtonDown = true;
    }

    const trigger = config.activationTrigger;
    if (trigger && trigger.type === "mouse" && e.button === trigger.code) {
      if (!clickFollowMode || !isPhotoshopActive()) return;
      if (!popupVisible) {
        showPopup();
      } else if (config.triggerTogglesClose) {
        hidePopup();
      }
    }
  });
  uIOhook.on("mouseup", (e) => {
    console.log(`[overlay] mouseup 감지: e.button=${e.button}`);
    if (e.button === LEFT_MOUSE_BUTTON) {
      mouseButtonDown = false;
      strokeEndTime = Date.now();
    }
  });

  // 팝업이 떠 있는 동안 휠을 돌리면 명도(L*) 그래프가 움직인다.
  // rotation 부호의 실제 방향(위로 굴리면 밝아지는지/어두워지는지)은
  // OS/마우스에 따라 다를 수 있어서, 반대로 느껴지면 아래 dir 계산의
  // 부호만 뒤집으면 된다.
  //

  try {
    uIOhook.start();
    console.log("[overlay] 전역 키보드/마우스 후킹 시작됨");
  } catch (e) {
    console.error("[overlay] uiohook 시작 실패 (macOS면 접근성 권한 확인):", e);
  }
}

// ---------------------------------------------------------------------
// 설정 창
// ---------------------------------------------------------------------

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 380,
    height: 320,
    resizable: false,
    title: "SHA Paint 설정",
    webPreferences: { preload: path.join(__dirname, "settings-preload.js"), contextIsolation: true, sandbox: false }
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, "settings.html"));
  settingsWin.webContents.on("did-finish-load", () => {
    settingsWin.webContents.send("config-loaded", config);
  });
  settingsWin.on("closed", () => { settingsWin = null; settingsRecordingTarget = null; recordingRequestSender = null; });
}

ipcMain.on("settings-start-recording", (evt, target) => {
  settingsRecordingTarget = target;
  recordingRequestSender = evt.sender; // 설정 창이든 상태 패널이든, 요청한 쪽으로 응답을 보내기 위해 기억
});
ipcMain.on("settings-stop-recording", () => {
  settingsRecordingTarget = null;
  recordingRequestSender = null;
});
ipcMain.on("settings-save", (_evt, newConfig) => {
  config = { ...config, ...newConfig };
  saveConfig(app, config);
  settingsRecordingTarget = null;
  console.log("[overlay] 설정 저장됨:", config);
  // 패널에서 저장했든 설정 창에서 저장했든, 다른 쪽이 동시에 열려있으면
  // 그쪽도 즉시 최신 상태로 갱신한다.
  notifyStatusPanel();
  notifySettingsWindow();
});
ipcMain.handle("settings-key-label", (_evt, keycode) => {
  const entry = Object.entries(UiohookKey).find(([, code]) => code === keycode);
  return entry ? entry[0] : `code:${keycode}`;
});

// 활성화 트리거({type:"mouse"|"key", code})를 사람이 읽을 수 있는 이름으로.
// 마우스/키보드 라벨을 같은 함수(triggerLabel)로 통일해서 처리한다.
ipcMain.handle("settings-trigger-label", (_evt, trigger) => triggerLabel(trigger));

// ---------------------------------------------------------------------
// 트레이 아이콘
// ---------------------------------------------------------------------

// 종료도 시작만큼 조용해서 분간이 어렵다는 피드백 -> 종료 직전에 알림을
// 띄운다. 알림을 요청한 직후 바로 app.quit()하면 OS에 알림이 등록되기
// 전에 프로세스가 죽어버릴 위험이 있어서, 짧게 지연시킨 뒤 종료한다.
// 정리 작업(키보드/마우스 후킹 해제, WS 서버 닫기, COM 브릿지 프로세스
// 종료)을 한 곳에 모았다. 원래는 이걸 app.on("will-quit") 안에서만
// 하고 app.quit()을 불렀는데, 실제로 그렇게 하니 이 정리는 정상적으로
// 실행되는데(로그에도 남음) 그 이후 Electron 프로세스 자체가 완전히
// 종료되지 않고 "반쯤 죽은" 상태로 남는 게 관찰됐다 — Electron
// app.quit()이 어떤 상황에서 확실하게 프로세스를 끝내지 못하는 건
// 실제로 보고된 적 있는 문제다. 그래서 이제는 정리 작업을 여기서
// 직접(동기적으로) 실행한 다음, app.quit() 대신 app.exit()로 프로세스
// 자체를 강제로 즉시 종료한다 — app.exit()는 will-quit 등 나머지
// 생명주기 이벤트를 기다리지 않고 바로 끝내므로, 여기서 정리를 먼저
// 안 해두면 PowerShell 프로세스가 좀비로 남을 수 있어서 순서가 중요하다.
function cleanupBeforeExit() {
  try { uIOhook.stop(); } catch (e) { /* noop */ }
  if (wss) { try { wss.close(); } catch (e) { /* noop */ } }
  comBridge.stopBridge();
}

function quitApp(reason) {
  console.log("[overlay] 종료:", reason);
  cleanupBeforeExit();
  app.exit(0); // app.quit() 대신 확실한 종료를 위해 app.exit() 사용
}

function createTray() {
  tray = new Tray(path.join(__dirname, "icons", "tray.png"));
  tray.setToolTip("SHA Paint");
  const menu = Menu.buildFromTemplate([
    { label: "설정 (단축키 변경)...", click: () => createSettingsWindow() },
    { label: "Photoshop 연결 테스트 (콘솔 확인)", click: () => comBridge.testConnection() },
    { label: "로그 파일 열기...", click: () => { if (logFilePath) shell.openPath(logFilePath); } },
    { label: "Photoshop 플러그인 설치...", click: () => openPluginInstaller() },
    { type: "separator" },
    { label: "종료", click: () => quitApp("사용자가 트레이 메뉴에서 종료") }
  ]);
  tray.setContextMenu(menu);

  // Photoshop이 띄우는 특정 대화상자 등으로 인해 isPhotoshopActive()가
  // 잘못 판단해서 팝업/패널이 숨어버리는 경우를 대비한 수동 복구 수단.
  // 트레이 아이콘을 클릭하면(메뉴 열기와 별개로) 디바운스 기다릴 것
  // 없이 즉시 두 창을 다시 보이게 강제 복귀시킨다.
  tray.on("click", () => {
    console.log("[overlay] 트레이 아이콘 클릭 -> 팝업/패널 강제로 다시 표시");
    photoshopInactiveStreak = 0;
    syncVisibility(overlayWin, popupVisible, "overlay");
    syncVisibility(statusPanelWin, statusPanelIntroduced, "panel");
  });
}

// ---------------------------------------------------------------------
// 앱 라이프사이클
// ---------------------------------------------------------------------

// app.quit()는 비동기라, 그 직후에도 아주 잠깐 아래 코드가 실행될 여지가
// 이론적으로 있다. 중복 인스턴스가 COM 브릿지/WS 서버를 또 띄우는 걸
// 확실히 막기 위해 한 번 더 방어한다.
if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
  setupFileLogging();
  config = loadConfig(app);
  createOverlayWindow();
  createStatusPanelWindow();
  createTray();
  startWsServer();
  startInputHook();
  startPhotoshopWatch();
  installPhotoshopPluginIfFirstRun();

  // UXP 플러그인 패널을 열지 않아도 스포이드로 바뀐 색을 자동으로 감지
  // (COM 폴링). WS 쪽(UXP 패널)에서 오는 foregroundColor 메시지 처리와
  // 완전히 동일한 동작 — 그냥 경로가 하나 더 생긴 것뿐이다.
  //
  // 중요: mouseButtonDown(좌클릭을 누르고 있는 동안, 즉 브러시 스트로크
  // 진행 중)일 때는 폴링 결과를 통째로 무시한다. 길거나 빠른 스트로크일수록
  // Photoshop UI 스레드가 계속 바빠서, com-bridge.js의 "연속 2번 확인"
  // 로직만으로는 같은 오독(검정 등)이 두 번 연속 나오는 걸 못 막는
  // 경우가 있었다. 스트로크 중엔 사용자가 스포이드로 색을 뽑을 수도
  // 없으니(마우스가 이미 브러시질로 눌려있는 상태라), 이 시간 동안의
  // 색 변경 보고는 전부 무시해도 안전하다. 스트로크가 끝나(mouseup) 다음
  // 폴링부터는 정상적으로 다시 반영된다.
  // Photoshop이 감지 안 되는 게 몇 번 연속 반복돼야만 진짜로 종료 처리한다.
  // 로그 분석 결과, 감지 자체가 아직 완전히 신뢰할 수 없는 상태라(진단
  // 테스트가 실제 Photoshop이 아닌 다른 인스턴스에 연결되는 등의 문제가
  // 확인됨), 단 1번의 "PS_GONE" 신호로 SHA Paint를 통째로 꺼버리는 건
  // 너무 위험하다 — 실제로 Photoshop이 켜져 있는데도 오탐으로 앱이
  // 꺼져버린 사례가 확인됐다. PowerShell 쪽은 감지 안 되는 동안 매
  // 폴링(300ms)마다 계속 PS_GONE을 보내므로, 연속 8번(약 2.4초) 이상
  // 들어와야만 실제로 종료한다.
  // Photoshop을 이번 실행 중 "한 번이라도 본 적 있는지" — 이걸 확인하기
  // 전까지는 아래 자동종료 로직 자체를 무장하지 않는다. 그렇지 않으면
  // Photoshop을 아직 안 켠 상태로 SHA Paint를 먼저 실행했을 때(예: 설치
  // 직후, 또는 그냥 순서상 먼저 켠 경우) "Photoshop이 없다"가 계속
  // 감지되어 몇 초 만에 "종료됨" 알림과 함께 꺼져버리는 문제가 있었다.
  // PS_ALIVE(Photoshop이 실행 중임을 처음 확인했다는 신호)를 받은
  // 뒤부터만 "이제 있다가 없어지면 진짜로 종료된 것"으로 판단한다.
  let everSawPhotoshop = false;
  let photoshopGoneStreak = 0;
  const PHOTOSHOP_GONE_QUIT_THRESHOLD = 8;

  // 검정을 다루는 방식을 다섯 번째로 다시 조정한다:
  //   v6.6~v7.0: 시간/패턴(왕복 반복) 기반 추측 — 실기(와콤 펜) 테스트로
  //   반복 검증했지만, 실사용자 재테스트 결과 "검정 인식되는건 여전해"
  //   라는 피드백을 받아서 시간/패턴 추측만으로는 부족하다는 게 확인됨.
  //
  // 이번엔 추측을 버리고 **Photoshop 자신에게 직접 물어본다**: 지금
  // 선택된 도구가 브러시/연필/지우개 등 "칠하는 도구"인지를 색 폴링과
  // 같은 시점에 함께 읽어서(com-bridge.js 참고) COLOR 보고에 태그로
  // 실어 보낸다. 칠하는 도구가 선택된 상태에서의 검정 보고는 스트로크
  // 도중 Photoshop 스크립팅 엔진이 바빠서 잘못 반환됐을 가능성이
  // 매우 높으므로 신뢰하지 않고, 스포이드 등 다른 도구일 때는 그대로
  // 신뢰한다 — 이건 타이밍을 추측하는 게 아니라 Photoshop의 실제 내부
  // 상태를 직접 확인하는 것이라 훨씬 근본적인 신호다.
  //
  // 예전 왕복(오실레이션) 감지 로직은 완전히 버리지 않고 **2차 방어선**
  // 으로 남겨뒀다 — 혹시 CurrentTool을 못 읽는 예외적 상황(도구 이름이
  // 목록에 없는 커스텀 도구 등)에서도 최소한의 보호가 되도록.
  //
  // 참고: 팝업 안 필드를 직접 드래그해서 검정을 고르는 건 완전히 별개
  // 경로(popup-color-picked 핸들러)라 이 로직의 영향을 전혀 안 받는다.
  let lastAppliedColor = null;
  let pendingBlackFrom = null;
  let watchedColor = null;
  let watchedCount = 0;
  let watchedExpireAt = 0;
  // 왕복 글리치 후보: 검정이 히스토리에 실제로 push된 항목(객체 참조)과 그 직전 색.
  // 글리치가 확정되면 맨 위 1개만이 아니라 같은 색에서 출발한 후보를 모두 제거한다.
  let blackCandidates = [];
  const OSCILLATION_WINDOW_MS = 6000;
  const OSCILLATION_TRIGGER_COUNT = 2;
  // 실제 로그로 확인된 사실: SET 그레이스로 못 잡는, 수 초~십수 초씩
  // 이어지는 긴 스트로크에서는 매번 "새로운 색 조합"마다 왕복 2회를
  // 다시 학습해야 해서 그때마다 최소 1~2번은 화면에 순간 표시된다.
  // 하지만 "이번 세션에서 이미 한 번이라도 왕복 글리치가 확정된 적
  // 있다"는 건 지금 이 PC/Photoshop 조합 자체가 글리치가 잦은 상태에
  // 있다는 강한 증거다 — 그렇다면 그 이후에 나오는 "새로운 색 조합"의
  // 검정도 굳이 왕복 2회를 다시 기다릴 필요 없이, 1회만 보고도 훨씬
  // 빠르게 학습해서 억제한다. sessionGlitchProneUntil이 설정돼 있는
  // 동안은 임계값이 1로 낮아진다.
  let sessionGlitchProneUntil = 0;
  const SESSION_GLITCH_PRONE_MS = 5 * 60 * 1000; // 한 번 확정되면 5분간 "이 세션은 글리치가 잦다"로 간주
  const SET_COMMAND_GRACE_MS = 4000;

  function sameColor(a, b) {
    return !!a && !!b && a.r === b.r && a.g === b.g && a.b === b.b;
  }

  function applyIncomingColor(r, g, b, tag) {
    const isBlack = r === 0 && g === 0 && b === 0;
    const now = Date.now();
    const incoming = { r, g, b };

    // 1차 방어: Photoshop이 직접 알려준 "지금 칠하는 도구가 선택돼
    // 있다"는 사실 자체로, 검정 보고는 즉시(패턴 판단 없이) 무시한다.
    if (isBlack && tag === "PAINTING") {
      console.log("[overlay] -> 칠하는 도구가 선택된 상태에서의 검정 보고 - 오독으로 판단해 무시함 (도구 기반 판정)");
      return;
    }

    // 3차 방어: 실사용자 테스트로 새로 발견된 패턴 — "팔레트를 열고
    // 정확히 처음 2번의 터치까지만 검정으로 인식되고, 팔레트를
    // 닫았다가 다시 열면 그 2번이 다시 반복된다." 이건 팔레트를 열자마자
    // 필드에서 색을 고르면(SET 명령 발생) 그 직후 캔버스를 터치할 때
    // 우리 자신이 보낸 SET 명령과 동시에 진행 중인 폴링 읽기가 서로
    // 충돌해서 생기는 것으로 추정된다 — 재오픈할 때마다 다시 색을
    // 고르니 SET 명령이 다시 나가고, 그래서 패턴이 반복된다. 우리가
    // 마지막으로 SET을 보낸 시각을 직접 추적하고 있으니(마우스/펜
    // 이벤트에 의존하지 않는, 우리가 100% 확실히 아는 신호), 그 직후
    // 짧은 시간 안의 검정 보고는 태그와 무관하게 의심한다.
    const sinceLastSet = now - lastSetCommandTime;
    if (isBlack && sinceLastSet < SET_COMMAND_GRACE_MS) {
      console.log(`[overlay] -> 우리가 SET 명령을 보낸 지 ${sinceLastSet}ms밖에 안 지남 - 그 충돌로 인한 오독으로 판단해 무시함 (SET 그레이스 방어)`);
      return;
    }

    // 2차 방어(예전 로직 유지): CurrentTool을 못 읽은 경우(tag가 null)
    // 등을 대비한 안전망. 같은 색<->검정 왕복이 반복되면 그때부터 확정.
    // 이번 세션에서 이미 한 번 확정된 적 있으면(sessionGlitchProneUntil)
    // 임계값을 1로 완화해서 새 색 조합도 훨씬 빨리 억제한다.
    const effectiveTriggerCount = now < sessionGlitchProneUntil ? 1 : OSCILLATION_TRIGGER_COUNT;
    if (isBlack && watchedColor && watchedCount >= effectiveTriggerCount &&
        now < watchedExpireAt && sameColor(lastAppliedColor, watchedColor)) {
      watchedExpireAt = now + OSCILLATION_WINDOW_MS;
      console.log(`[overlay] -> (2차 방어) 이미 확정된 반복 글리치(색 rgb(${watchedColor.r},${watchedColor.g},${watchedColor.b}) <-> 검정) 재발, 무시 (임계값=${effectiveTriggerCount})`);
      return;
    }

    if (!isBlack && pendingBlackFrom && sameColor(incoming, pendingBlackFrom)) {
      if (watchedColor && sameColor(watchedColor, incoming) && now < watchedExpireAt) {
        watchedCount++;
      } else {
        watchedColor = incoming;
        watchedCount = 1;
      }
      watchedExpireAt = now + OSCILLATION_WINDOW_MS;
      if (watchedCount >= effectiveTriggerCount) {
        const stale = new Set(blackCandidates.filter((c) => sameColor(c.from, incoming)).map((c) => c.obj));
        const beforeLen = state.history.length;
        if (stale.size) state.history = state.history.filter((h) => !stale.has(h));
        blackCandidates = blackCandidates.filter((c) => !stale.has(c.obj));
        if (state.history.length !== beforeLen) {
          console.log(`[overlay] -> (2차 방어) 색 rgb(${incoming.r},${incoming.g},${incoming.b})<->검정 왕복이 반복 확인됨(${watchedCount}회, 임계값=${effectiveTriggerCount}) -> 글리치로 확정, 히스토리에서 제거`);
        }
        // 이번 세션이 글리치가 잦다는 걸 확정했으니, 앞으로 5분간은
        // 다른 색 조합도 더 빨리(1회만에) 억제하도록 완화한다.
        sessionGlitchProneUntil = now + SESSION_GLITCH_PRONE_MS;
      }
      pendingBlackFrom = null;
    } else if (!isBlack) {
      pendingBlackFrom = null;
    }

    if (isBlack) {
      pendingBlackFrom = lastAppliedColor;
    }

    lastAppliedColor = incoming;
    setBaseFromRgb(r, g, b);
    const topBefore = state.history[0];
    pushHistory(r, g, b); // 스포이드로 실제 골라서 적용한 색이니 히스토리에도 남김
    if (isBlack && pendingBlackFrom && state.history[0] !== topBefore) {
      blackCandidates = blackCandidates.filter((c) => now - c.at < OSCILLATION_WINDOW_MS * 2);
      blackCandidates.push({ obj: state.history[0], from: pendingBlackFrom, at: now });
    }
    if (popupVisible) sendPopupOpen();
  }

  handleExternalColor = applyIncomingColor; // WS 서버(모듈 최상위 스코프)에서도 같은 방어 파이프라인을 쓸 수 있도록 참조 공개


  comBridge.startBridge(
    (r, g, b, tag) => {
      everSawPhotoshop = true; // 색 변경이 왔다는 건 Photoshop이 살아있다는 뜻
      photoshopGoneStreak = 0;

      // UXP 플러그인이 연결돼 있으면, 그쪽이 Photoshop의 set 이벤트를
      // 직접 구독하는 훨씬 신뢰도 높은 경로를 이미 담당하고 있다. COM
      // 폴링(이 콜백)은 UXP가 없을 때를 위한 폴백일 뿐인데, 지금까지는
      // UXP 연결 여부와 무관하게 항상 같이 돌고 있어서 — UXP 패널
      // 자체는 멀쩡한데 SHA Paint 팝업만 검정으로 튀는 문제가 있었다
      // (실사용자가 스크린샷으로 정확히 확인해줌: 두 경로가 동시에
      // 팝업 상태를 두고 경쟁하고 있었던 것). UXP가 연결된 동안은 이
      // 폴링 결과를 아예 반영하지 않는다.
      if (uxpSocket && uxpSocket.readyState === uxpSocket.OPEN) return;

      const inGrace = Date.now() - strokeEndTime < STROKE_END_GRACE_MS;

      if (mouseButtonDown || inGrace) {
        return;
      }

      applyIncomingColor(r, g, b, tag);
    },
    () => {
      if (!everSawPhotoshop) return; // 아직 한 번도 못 봤으면(=아직 안 켰을 수 있음) 무시
      photoshopGoneStreak++;
      console.log(`[overlay] Photoshop 미감지 연속 ${photoshopGoneStreak}/${PHOTOSHOP_GONE_QUIT_THRESHOLD}`);
      if (photoshopGoneStreak >= PHOTOSHOP_GONE_QUIT_THRESHOLD) {
        hidePopup();
        quitApp("Photoshop이 종료된 것으로 확정됨");
      }
    },
    () => {
      everSawPhotoshop = true;
      console.log("[overlay] Photoshop이 실행 중임을 확인함 — 이제부터 종료 감지가 활성화됩니다");
      if (statusPanelWin && !statusPanelWin.isDestroyed()) {
        positionStatusPanel(); // 이제 Photoshop이 확실히 켜져 있으니, 그 창이 있는 모니터로 다시 계산
        notifyStatusPanel();
        statusPanelIntroduced = true;
        statusPanelWin.showInactive(); // 포커스는 안 뺏음 (Photoshop 계속 활성 상태 유지)
      }
    }
  );

  // 앱을 켜자마자 COM 연결이 실제로 되는지 자동으로 한 번 확인해서
  // 터미널에 결과를 남긴다. PowerShell 프로세스가 완전히 시작해서
  // stdin을 읽기 시작할 시간을 넉넉히 준다 (콜드 스타트 고려 3초).
  setTimeout(() => comBridge.testConnection(), 3000);
  });
} // if (gotSingleInstanceLock)

app.on("window-all-closed", (e) => e.preventDefault());
// app.exit()를 쓰는 우리 자체 종료 경로(quitApp)에서는 이
// 이벤트가 아예 안 올 수도 있다(app.exit()는 생명주기 이벤트를 기다리지
// 않으므로). 그래도 OS 로그아웃/시스템 종료처럼 우리가 직접 트리거하지
// 않은 다른 종료 경로에 대한 안전망으로 남겨둔다. cleanupBeforeExit()가
// 이미 실행됐어도(중복 호출) 각 정리 작업은 null 체크를 하므로 안전하다.
app.on("will-quit", () => {
  cleanupBeforeExit();
});
