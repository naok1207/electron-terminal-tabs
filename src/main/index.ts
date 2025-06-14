import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { TerminalManager } from './terminal-manager';
import fixPath from 'fix-path';

// Fix PATH on macOS
fixPath();

let mainWindow: BrowserWindow | null = null;
let terminalManager: TerminalManager | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html')).catch(err => {
    console.error('Failed to load index.html:', err);
  });
  
  // Open developer tools for debugging
  mainWindow.webContents.openDevTools();
  
  // Log any console messages from renderer
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Renderer console [${level}]: ${message}`);
  });
  
  // Log when page loads
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page finished loading');
  });
  
  // Log any errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription);
  });

  terminalManager = new TerminalManager();

  mainWindow.on('closed', () => {
    if (terminalManager) {
      terminalManager.dispose();
    }
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers
ipcMain.handle('terminal:create', () => {
  if (!terminalManager) return null;
  return terminalManager.createTerminal();
});

ipcMain.on('terminal:write', (event, sessionId: string, data: string) => {
  if (!terminalManager) return;
  terminalManager.write(sessionId, data);
});

ipcMain.on('terminal:resize', (event, sessionId: string, cols: number, rows: number) => {
  if (!terminalManager) return;
  terminalManager.resize(sessionId, cols, rows);
});

ipcMain.on('terminal:dispose', (event, sessionId: string) => {
  if (!terminalManager) return;
  terminalManager.disposeTerminal(sessionId);
});

// Tab management IPC handlers
ipcMain.handle('tab:create', () => {
  if (!terminalManager) return null;
  return terminalManager.createTab();
});

ipcMain.on('tab:switch', (event, tabId: string) => {
  if (!terminalManager) return;
  terminalManager.switchTab(tabId);
});

ipcMain.on('tab:close', (event, tabId: string) => {
  if (!terminalManager) return;
  terminalManager.closeTab(tabId);
});

ipcMain.handle('tab:getTabs', () => {
  if (!terminalManager) return [];
  return terminalManager.getTabs();
});