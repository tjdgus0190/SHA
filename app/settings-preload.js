const { contextBridge, ipcRenderer } = require("electron");

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
