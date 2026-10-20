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
  if (s.licensed) setStatus("라이선스가 확인되었습니다.", "ok");
  else if (s.reason) setStatus(s.reason, "error");
});

async function activate() {
  const key = input.value.trim();
  if (!key) { setStatus("라이선스 키를 입력해 주세요.", "error"); return; }
  btn.disabled = true;
  setStatus("확인 중...");
  try {
    const s = await window.licenseAPI.activate(key);
    if (s.licensed) setStatus("라이선스가 확인되었습니다. 이 창을 닫아도 됩니다.", "ok");
    else setStatus(s.reason || "확인하지 못했습니다.", "error");
  } catch (e) {
    setStatus("확인 중 오류가 발생했습니다: " + (e && e.message ? e.message : e), "error");
  } finally {
    btn.disabled = false;
  }
}

btn.addEventListener("click", activate);
input.addEventListener("keydown", (e) => { if (e.key === "Enter") activate(); });
input.focus();
