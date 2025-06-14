import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  terminal: {
    create: () => ipcRenderer.invoke('terminal:create'),
    write: (sessionId: string, data: string) => 
      ipcRenderer.send('terminal:write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) => 
      ipcRenderer.send('terminal:resize', sessionId, cols, rows),
    dispose: (sessionId: string) => 
      ipcRenderer.send('terminal:dispose', sessionId),
    onData: (callback: (sessionId: string, data: string) => void) => {
      ipcRenderer.on('terminal:data', (event, sessionId, data) => {
        callback(sessionId, data);
      });
    },
    onExit: (callback: (sessionId: string) => void) => {
      ipcRenderer.on('terminal:exit', (event, sessionId) => {
        callback(sessionId);
      });
    }
  },
  tabs: {
    create: () => ipcRenderer.invoke('tab:create'),
    switch: (tabId: string) => ipcRenderer.send('tab:switch', tabId),
    close: (tabId: string) => ipcRenderer.send('tab:close', tabId),
    getTabs: () => ipcRenderer.invoke('tab:getTabs'),
    onTabCreated: (callback: (tabId: string, tabs: Array<{id: string, name: string, active: boolean}>) => void) => {
      ipcRenderer.on('tab:created', (event, tabId, tabs) => {
        callback(tabId, tabs);
      });
    },
    onTabSwitched: (callback: (tabId: string) => void) => {
      ipcRenderer.on('tab:switched', (event, tabId) => {
        callback(tabId);
      });
    },
    onTabClosed: (callback: (tabId: string, tabs: Array<{id: string, name: string, active: boolean}>) => void) => {
      ipcRenderer.on('tab:closed', (event, tabId, tabs) => {
        callback(tabId, tabs);
      });
    }
  }
});