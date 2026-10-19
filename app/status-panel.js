// status-panel.js
document.addEventListener("DOMContentLoaded", () => {
  const panel = document.getElementById("panel");
  const toggle = document.getElementById("clickFollowToggle");
  const triggerValue = document.getElementById("triggerValue");
  const statusDot = document.getElementById("statusDot");
  const gearBtn = document.getElementById("gearBtn");
  const minimizeBtn = document.getElementById("minimizeBtn");
  const minimizedView = document.getElementById("minimizedView");
  const minimizedDot = document.getElementById("minimizedDot");
  const shortcuts = document.getElementById("shortcuts");
  const recordingHint = document.getElementById("recordingHint");

  const showPopupKeyValue = document.getElementById("showPopupKeyValue");
  const clickFollowKeyValue = document.getElementById("clickFollowKeyValue");
  const activationTriggerValue = document.getElementById("activationTriggerValue");
  const triggerTogglesCloseToggle = document.getElementById("triggerTogglesCloseToggle");
  const recordBtns = {
    showPopupKey: document.getElementById("recordShowPopupBtn"),
    clickFollowKey: document.getElementById("recordClickFollowBtn"),
    activationTrigger: document.getElementById("recordActivationTriggerBtn")
  };

  let expanded = false;
  let minimized = false;
  let recordingTarget = null;
  // main으로부터 받은 최신 config 조각들을 그대로 들고 있다가, 녹화가
  // 완료되면 그 필드만 바꿔서 즉시 저장한다(패널엔 별도 "저장" 버튼이
  // 없다 — 녹화 즉시 적용되는 게 이 패널의 존재 이유이므로).
  let latest = { showPopupKey: "F11", clickFollowKey: "F9", activationTrigger: { type: "mouse", code: 3 } };

  toggle.addEventListener("change", () => {
    window.statusPanelAPI.toggleClickFollow();
  });

  triggerTogglesCloseToggle.addEventListener("change", () => {
    window.statusPanelAPI.save({ triggerTogglesClose: triggerTogglesCloseToggle.checked });
  });

  gearBtn.addEventListener("click", () => {
    expanded = !expanded;
    shortcuts.classList.toggle("open", expanded);
    gearBtn.classList.toggle("active", expanded);
    window.statusPanelAPI.setExpanded(expanded);
    if (!expanded) stopRecordingUI();
  });

  // 최소화: 창 자체를 작은 정사각형으로 줄이고(main이 처리), 렌더러
  // 쪽에서도 평소 UI를 감추고 작은 점 하나만 보여준다. 그 점을 클릭하면
  // 다시 원래 크기로 복귀한다 — 최소화 버튼과 별개로 클릭 진입점을
  // 하나 더 만든 것.
  minimizeBtn.addEventListener("click", () => setMinimized(true));
  minimizedView.addEventListener("click", () => setMinimized(false));

  function setMinimized(next) {
    minimized = next;
    panel.classList.toggle("is-minimized", minimized);
    window.statusPanelAPI.setMinimized(minimized);
    if (minimized) stopRecordingUI();
  }

  function startRecording(target) {
    recordingTarget = target;
    recordingHint.hidden = false;
    Object.values(recordBtns).forEach((b) => b.classList.remove("recording"));
    recordBtns[target].classList.add("recording");
    window.statusPanelAPI.startRecording(target);
  }
  function stopRecordingUI() {
    recordingTarget = null;
    recordingHint.hidden = true;
    Object.values(recordBtns).forEach((b) => b.classList.remove("recording"));
    window.statusPanelAPI.stopRecording();
  }

  recordBtns.showPopupKey.addEventListener("click", () => startRecording("showPopupKey"));
  recordBtns.clickFollowKey.addEventListener("click", () => startRecording("clickFollowKey"));
  recordBtns.activationTrigger.addEventListener("click", () => startRecording("activationTrigger"));

  async function renderShortcutLabels() {
    showPopupKeyValue.textContent = latest.showPopupKey || "-";
    clickFollowKeyValue.textContent = latest.clickFollowKey || "-";
    activationTriggerValue.textContent = await window.statusPanelAPI.triggerLabel(latest.activationTrigger);
  }

  // 일반 키(showPopupKey/clickFollowKey)가 녹화됐을 때
  window.statusPanelAPI.onKeyRecorded(async ({ keycode }) => {
    if (!recordingTarget || recordingTarget === "activationTrigger") return;
    const label = await window.statusPanelAPI.keyLabel(keycode);
    latest[recordingTarget] = label;
    window.statusPanelAPI.save({ [recordingTarget]: label });
    renderShortcutLabels();
    stopRecordingUI();
  });

  // 활성화 트리거(마우스든 키든)가 녹화됐을 때
  window.statusPanelAPI.onTriggerRecorded((trigger) => {
    if (recordingTarget !== "activationTrigger") return;
    latest.activationTrigger = trigger;
    window.statusPanelAPI.save({ activationTrigger: trigger });
    renderShortcutLabels();
    stopRecordingUI();
  });

  window.statusPanelAPI.onKeyRecordingCancelled(() => {
    stopRecordingUI();
  });

  // main이 진실의 원천이다 — 스위치 클릭이든, 단축키든, 패널 자체에서
  // 녹화로 바꾸든, 어느 경로로 바뀌든 항상 이 이벤트로 최신 상태를
  // 받아서 반영한다.
  window.statusPanelAPI.onState((state) => {
    toggle.checked = !!state.clickFollowMode;
    triggerValue.textContent = state.triggerLabel || "-";
    const unhealthy = state.bridgeHealthy === false;
    statusDot.classList.toggle("unhealthy", unhealthy);
    minimizedDot.classList.toggle("unhealthy", unhealthy); // 최소화 상태에서도 신뢰도 표시는 유지
    if (state.showPopupKey) latest.showPopupKey = state.showPopupKey;
    if (state.clickFollowKey) latest.clickFollowKey = state.clickFollowKey;
    if (typeof state.triggerTogglesClose === "boolean") {
      triggerTogglesCloseToggle.checked = state.triggerTogglesClose;
    }
    renderShortcutLabels();
  });
});

