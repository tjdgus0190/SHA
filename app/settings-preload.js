const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");
const i18n = require(path.join(__dirname, "i18n.js"));

// 화면 언어는 main이 정한다(설정 "auto"면 OS 언어). data-i18n 문구를 바꾸고 렌더러에 t()를 준다.
const lang = ipcRenderer.sendSync("i18n-get-lang");
window.addEventListener("DOMContentLoaded", () => i18n.applyDom(document, lang));
contextBridge.exposeInMainWorld("i18n", { lang, t: (key, vars) => i18n.t(key, vars, lang) });

contextBridge.exposeInMainWorld("settingsAPI", {
  onConfigLoaded: (callback) => ipcRenderer.on("config-loaded", (_e, config) => callback(config)),
  onKeyRecorded: (callback) => ipcRenderer.on("key-recorded", (_e, data) => callback(data)),
  onTriggerRecorded: (callback) => ipcRenderer.on("trigger-recorded", (_e, data) => callback(data)),
  onKeyRecordingCancelled: (callback) => ipcRenderer.on("key-recording-cancelled", () => callback()),
  startRecording: (target) => ipcRenderer.send("settings-start-recording", target),
  stopRecording: () => ipcRenderer.send("settings-stop-recording"),
  save: (config) => ipcRenderer.send("settings-save", config),
  keyLabel: (keycode) => ipcRenderer.invoke("settings-key-label", keycode),
  triggerLabel: (trigger) => ipcRenderer.invoke("settings-trigger-label", trigger)
});
