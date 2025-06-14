import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';
import * as os from 'os';

export interface ITerminalSession {
  id: string;
  pty: pty.IPty;
  name: string;
  active: boolean;
}

export class TerminalManager {
  private terminals: Map<string, ITerminalSession> = new Map();
  private sessionCounter = 0;
  private activeTabId: string | null = null;

  createTerminal(): string {
    const sessionId = `terminal-${++this.sessionCounter}`;
    
    // Get default shell
    const shell = process.env.SHELL || '/bin/zsh';
    const cwd = process.env.HOME || os.homedir();
    
    // Create PTY instance
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd,
      env: process.env as { [key: string]: string }
    });

    // Set up data handler
    ptyProcess.onData((data) => {
      this.sendToRenderer('terminal:data', sessionId, data);
    });

    // Set up exit handler
    ptyProcess.onExit(() => {
      // Only send exit event if the tab still exists
      if (this.terminals.has(sessionId)) {
        this.sendToRenderer('terminal:exit', sessionId);
      }
      // Don't delete from map here - let closeTab handle it
    });

    // First terminal should be active by default
    const isFirstTerminal = this.terminals.size === 0;
    
    this.terminals.set(sessionId, {
      id: sessionId,
      pty: ptyProcess,
      name: `Terminal ${this.sessionCounter}`,
      active: isFirstTerminal
    });
    
    if (isFirstTerminal) {
      this.activeTabId = sessionId;
    }

    return sessionId;
  }

  createTab(): string {
    const tabId = this.createTerminal();
    console.log(`[TerminalManager] Created tab: ${tabId}`);
    
    // Notify renderer about new tab first, so it can create the terminal instance
    this.sendToRenderer('tab:created', tabId, this.getTabs());
    console.log(`[TerminalManager] Sent tab:created event for ${tabId}`);
    
    // Then switch to the new tab after a small delay
    setTimeout(() => {
      this.switchTab(tabId);
    }, 100);
    
    return tabId;
  }

  switchTab(tabId: string): void {
    console.log(`[TerminalManager] Switching to tab: ${tabId}`);
    if (!this.terminals.has(tabId)) {
      console.error(`Tab ${tabId} does not exist`);
      return;
    }

    // Deactivate current active tab
    if (this.activeTabId) {
      const currentTab = this.terminals.get(this.activeTabId);
      if (currentTab) {
        currentTab.active = false;
      }
    }

    // Activate new tab
    const newTab = this.terminals.get(tabId);
    if (newTab) {
      newTab.active = true;
      this.activeTabId = tabId;
      this.sendToRenderer('tab:switched', tabId);
      console.log(`[TerminalManager] Sent tab:switched event for ${tabId}`);
    }
  }

  closeTab(tabId: string): void {
    console.log(`[TerminalManager] Closing tab: ${tabId}`);
    const tab = this.terminals.get(tabId);
    if (!tab) {
      console.error(`Tab ${tabId} does not exist`);
      return;
    }

    // Prevent closing the last tab
    if (this.terminals.size === 1) {
      console.log('[TerminalManager] Cannot close the last tab');
      return;
    }

    // Kill the PTY process
    try {
      tab.pty.kill();
      console.log(`[TerminalManager] Killed PTY for tab: ${tabId}`);
    } catch (e) {
      console.error('Error killing PTY:', e);
    }
    
    // Remove from map
    this.terminals.delete(tabId);
    console.log(`[TerminalManager] Removed tab from map: ${tabId}`);

    // If this was the active tab, switch to another one
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
      
      // Switch to the first available tab
      const remainingTabs = Array.from(this.terminals.keys());
      if (remainingTabs.length > 0) {
        this.switchTab(remainingTabs[0]);
      }
    }

    // Notify renderer
    this.sendToRenderer('tab:closed', tabId, this.getTabs());
    console.log(`[TerminalManager] Sent tab:closed event for ${tabId}`);
  }

  getActiveTab(): string | null {
    return this.activeTabId;
  }

  getTabs(): Array<{id: string, name: string, active: boolean}> {
    return Array.from(this.terminals.values()).map(session => ({
      id: session.id,
      name: session.name,
      active: session.active
    }));
  }

  write(sessionId: string, data: string): void {
    const session = this.terminals.get(sessionId);
    if (session) {
      session.pty.write(data);
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.terminals.get(sessionId);
    if (session) {
      session.pty.resize(cols, rows);
    }
  }

  disposeTerminal(sessionId: string): void {
    const session = this.terminals.get(sessionId);
    if (session) {
      session.pty.kill();
      this.terminals.delete(sessionId);
    }
  }

  dispose(): void {
    for (const [id, session] of this.terminals) {
      session.pty.kill();
    }
    this.terminals.clear();
  }

  private sendToRenderer(channel: string, ...args: any[]): void {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send(channel, ...args);
    }
  }
}