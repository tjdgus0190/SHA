const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("licenseAPI", {
  onState: (callback) => ipcRenderer.on("license-state", (_e, s) => callback(s)),
  activate: (key) => ipcRenderer.invoke("license-activate", key)
});
