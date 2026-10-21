let currentConfig = { showPopupKey: "F11", clickFollowKey: "F9", activationTrigger: { type: "mouse", code: 3 }, language: "auto" };
let recordingTarget = null;

// 각 설정 항목: config 키 <-> 라벨/버튼 엘리먼트 id 매핑 (activationTrigger는
// 단순 문자열이 아니라 객체라 별도로 처리한다 — 아래 참고)
const TARGETS = [
  { key: "showPopupKey", labelId: "showPopupKeyLabel", btnId: "recordShowPopupBtn" },
  { key: "clickFollowKey", labelId: "clickFollowKeyLabel", btnId: "recordClickFollowBtn" }
];

const el = {};

function cacheEls() {
  TARGETS.forEach((t) => {
    el[t.labelId] = document.getElementById(t.labelId);
    el[t.btnId] = document.getElementById(t.btnId);
  });
  el.recordingHint = document.getElementById("recordingHint");
  el.saveBtn = document.getElementById("saveBtn");
  el.activationTriggerLabel = document.getElementById("activationTriggerLabel");
  el.recordActivationTriggerBtn = document.getElementById("recordActivationTriggerBtn");
  el.languageSelect = document.getElementById("languageSelect");
}

async function renderLabels() {
  TARGETS.forEach((t) => {
    el[t.labelId].textContent = currentConfig[t.key] || t.emptyText || "-";
  });
  el.languageSelect.value = currentConfig.language || "auto";
  el.activationTriggerLabel.textContent = await window.settingsAPI.triggerLabel(currentConfig.activationTrigger);
}

function startRecording(target) {
  recordingTarget = target;
  el.recordingHint.hidden = false;
  TARGETS.forEach((t) => el[t.btnId].classList.remove("recording"));
  el.recordActivationTriggerBtn.classList.remove("recording");
  if (target === "activationTrigger") {
    el.recordActivationTriggerBtn.classList.add("recording");
  } else {
    const targetDef = TARGETS.find((t) => t.key === target);
    if (targetDef) el[targetDef.btnId].classList.add("recording");
  }
  window.settingsAPI.startRecording(target);
}

function stopRecordingUI() {
  recordingTarget = null;
  el.recordingHint.hidden = true;
  TARGETS.forEach((t) => el[t.btnId].classList.remove("recording"));
  el.recordActivationTriggerBtn.classList.remove("recording");
}

document.addEventListener("DOMContentLoaded", () => {
  cacheEls();
  renderLabels();

  TARGETS.forEach((t) => {
    el[t.btnId].addEventListener("click", () => startRecording(t.key));
  });
  el.recordActivationTriggerBtn.addEventListener("click", () => startRecording("activationTrigger"));

  // 언어는 저장할 때 바뀐 경우에만 main이 앱을 다시 시작해서 적용한다.
  el.languageSelect.addEventListener("change", () => { currentConfig.language = el.languageSelect.value; });

  el.saveBtn.addEventListener("click", () => {
    window.settingsAPI.save(currentConfig);
  });

  window.settingsAPI.onConfigLoaded((config) => {
    currentConfig = { ...currentConfig, ...config };
    renderLabels();
  });

  window.settingsAPI.onKeyRecorded(async ({ keycode }) => {
    const label = await window.settingsAPI.keyLabel(keycode);
    if (recordingTarget) currentConfig[recordingTarget] = label;
    renderLabels();
    stopRecordingUI();
  });

  // 활성화 트리거는 마우스 클릭이든 키보드 키든 올 수 있어서 별도
  // 채널(trigger-recorded)로 온다. {type, code} 형태를 그대로 저장한다.
  window.settingsAPI.onTriggerRecorded((trigger) => {
    currentConfig.activationTrigger = trigger;
    renderLabels();
    stopRecordingUI();
  });

  window.settingsAPI.onKeyRecordingCancelled(() => {
    stopRecordingUI();
  });
});
