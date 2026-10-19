const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------
// 사용자가 나중에 단축키를 바꿀 수 있도록, 설정을 JSON 파일로 영속화한다.
// Electron의 app.getPath('userData')를 쓰므로, main 프로세스에서만
// require해야 한다 (electron app 객체가 준비된 이후).
// ---------------------------------------------------------------------

const DEFAULT_CONFIG = {
  // "F11" 하나만 누르면 팔레트 팝업이 열리고, 다시 누르면 닫힌다(토글).
  // Esc로도 닫을 수 있다. clickFollowKey가 켜져 있으면 좌클릭으로도 열 수
  // 있지만, 닫는 건 여전히 F11/Esc뿐이다.
  showPopupKey: "F11",
  // F9: "클릭 추적 모드" 토글 (1회 입력). ON이면 좌클릭(펜 촉 클릭)을
  // 하는 순간에도 팝업이 열린다(펜을 떼도 안 닫힘). F11은 항상 그대로
  // 작동하며 이 모드와 배타적이지 않다.
  clickFollowKey: "F9",
  // 활성화 상태에서 팝업을 여는 트리거. 마우스 버튼이든 키보드 키든
  // 둘 다 될 수 있다 — { type: "mouse", code: N } 또는 { type: "key",
  // code: N }. 기본값은 중클릭(3, 실제 테스트로 확인된 값). 설정 창의
  // "키/클릭 입력으로 변경" 버튼으로 좌클릭이든 다른 키든 자유롭게
  // 바꿀 수 있다.
  activationTrigger: { type: "mouse", code: 3 },
  // true면 활성화 트리거를 팝업이 열려있는 상태에서 다시 입력했을 때
  // 닫힌다(F11처럼 토글). false면 열기 전용 — 이미 열려있을 때 다시
  // 입력해도 아무 일도 안 일어난다. 좌클릭을 트리거로 쓰는 사람은
  // 브러시질 도중 매 클릭마다 닫힘이 걸리는 걸 원치 않을 수 있어서
  // 기본값은 켜두되(중클릭 등 브러시와 안 겹치는 트리거에선 자연스러운
  // 토글 UX), 상태 패널에서 언제든 끌 수 있게 했다.
  triggerTogglesClose: true
};

function getConfigPath(app) {
  return path.join(app.getPath("userData"), "luminance-overlay-config.json");
}

function loadConfig(app) {
  const p = getConfigPath(app);
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(app, config) {
  const p = getConfigPath(app);
  fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf8");
}

module.exports = { DEFAULT_CONFIG, loadConfig, saveConfig, getConfigPath };
