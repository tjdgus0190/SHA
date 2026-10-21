// license.html 렌더러: 키를 입력받아 main(licensing.js)에 확인을 요청한다.
const input = document.getElementById("keyInput");
const btn = document.getElementById("activateBtn");
const statusEl = document.getElementById("status");

function setStatus(text, kind) {
  statusEl.textContent = text || "";
  statusEl.className = "status" + (kind ? " " + kind : "");
}

window.licenseAPI.onState((s) => {
  if (s.key && !input.value) input.value = s.key;
  if (s.licensed) setStatus(window.i18n.t("license.ok"), "ok");
  else if (s.reason) setStatus(s.reason, "error");
});

async function activate() {
  const key = input.value.trim();
  if (!key) { setStatus(window.i18n.t("license.enterKey"), "error"); return; }
  btn.disabled = true;
  setStatus(window.i18n.t("license.checking"));
  try {
    const s = await window.licenseAPI.activate(key);
    if (s.licensed) setStatus(window.i18n.t("license.okClose"), "ok");
    else setStatus(s.reason || window.i18n.t("license.failed"), "error");
  } catch (e) {
    setStatus(window.i18n.t("license.error", { msg: e && e.message ? e.message : e }), "error");
  } finally {
    btn.disabled = false;
  }
}

btn.addEventListener("click", activate);
input.addEventListener("keydown", (e) => { if (e.key === "Enter") activate(); });
input.focus();
