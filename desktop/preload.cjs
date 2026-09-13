const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('workbenchDesktop', { copyQueryPermissions: () => ipcRenderer.invoke('workbench:copy-query-permissions'), chooseDirectory: () => ipcRenderer.invoke('workbench:choose-directory') });
