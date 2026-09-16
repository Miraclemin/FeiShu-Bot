const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('workbenchDesktop', { copyQueryPermissions: () => ipcRenderer.invoke('workbench:copy-query-permissions'), copyPermissionPreset: (ids) => ipcRenderer.invoke('workbench:copy-permission-preset', ids), chooseDirectory: () => ipcRenderer.invoke('workbench:choose-directory') });
