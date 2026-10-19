const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("statusPanelAPI", {
  toggleClickFollow: () => {
    ipcRenderer.send("status-panel-toggle-click-follow");
  },
  setExpanded: (expanded) => {
    ipcRenderer.send("status-panel-set-expanded", expanded);
  },
  setMinimized: (minimized) => {
    ipcRenderer.send("status-panel-set-minimized", minimized);
  },
  startRecording: (target) => ipcRenderer.send("settings-start-recording", target),
  stopRecording: () => ipcRenderer.send("settings-stop-recording"),
  save: (partialConfig) => ipcRenderer.send("settings-save", partialConfig),
  keyLabel: (keycode) => ipcRenderer.invoke("settings-key-label", keycode),
  triggerLabel: (trigger) => ipcRenderer.invoke("settings-trigger-label", trigger),
  onKeyRecorded: (callback) => ipcRenderer.on("key-recorded", (_e, data) => callback(data)),
  onTriggerRecorded: (callback) => ipcRenderer.on("trigger-recorded", (_e, data) => callback(data)),
  onKeyRecordingCancelled: (callback) => ipcRenderer.on("key-recording-cancelled", () => callback()),
  onState: (callback) => {
    ipcRenderer.on("status-panel-state", (_event, state) => callback(state));
  }
});
