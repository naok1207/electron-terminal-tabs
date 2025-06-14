console.log('Renderer script loading...');

import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebglAddon } from 'xterm-addon-webgl';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import 'xterm/css/xterm.css';

declare global {
  interface Window {
    electronAPI: {
      terminal: {
        create: () => Promise<string>;
        write: (sessionId: string, data: string) => void;
        resize: (sessionId: string, cols: number, rows: number) => void;
        dispose: (sessionId: string) => void;
        onData: (callback: (sessionId: string, data: string) => void) => void;
        onExit: (callback: (sessionId: string) => void) => void;
      };
      tabs: {
        create: () => Promise<string>;
        switch: (tabId: string) => void;
        close: (tabId: string) => void;
        getTabs: () => Promise<Array<{id: string, name: string, active: boolean}>>;
        onTabCreated: (callback: (tabId: string, tabs: Array<{id: string, name: string, active: boolean}>) => void) => void;
        onTabSwitched: (callback: (tabId: string) => void) => void;
        onTabClosed: (callback: (tabId: string, tabs: Array<{id: string, name: string, active: boolean}>) => void) => void;
      };
    };
  }
}

interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  container: HTMLElement;
  resizeObserver?: ResizeObserver;
  webglAddon?: WebglAddon;
  disposed?: boolean;
}

class TabManager {
  private terminals: Map<string, TerminalInstance> = new Map();
  private activeTabId: string | null = null;
  private tabsContainer: HTMLElement;
  private terminalsContainer: HTMLElement;

  constructor() {
    this.tabsContainer = document.getElementById('tabs-container')!;
    this.terminalsContainer = document.getElementById('terminals-container')!;
    this.setupTabEventHandlers();
    this.setupGlobalTerminalHandlers();
  }

  private setupGlobalTerminalHandlers() {
    // Handle data from backend - global handler
    window.electronAPI.terminal.onData((sessionId, data) => {
      const instance = this.terminals.get(sessionId);
      if (instance) {
        instance.terminal.write(data);
      }
    });

    // Handle terminal exit - global handler
    window.electronAPI.terminal.onExit((sessionId) => {
      const instance = this.terminals.get(sessionId);
      if (instance) {
        instance.terminal.write('\r\n[Process exited]\r\n');
      }
    });
  }

  private setupTabEventHandlers() {
    // Handle new tab button
    const newTabButton = document.getElementById('new-tab-button');
    newTabButton?.addEventListener('click', () => {
      console.log('[TabManager] New tab button clicked');
      this.createNewTab();
    });

    // Handle tab events from backend
    window.electronAPI.tabs.onTabCreated((tabId, tabs) => {
      console.log(`[TabManager] onTabCreated: ${tabId}`, tabs);
      this.updateTabBar(tabs);
    });

    window.electronAPI.tabs.onTabSwitched(async (tabId) => {
      console.log(`[TabManager] onTabSwitched: ${tabId}`);
      this.switchToTab(tabId);
      // Update tab bar to reflect the active state
      const tabs = await window.electronAPI.tabs.getTabs();
      this.updateTabBar(tabs);
    });

    window.electronAPI.tabs.onTabClosed((tabId, tabs) => {
      console.log(`[TabManager] onTabClosed: ${tabId}`, tabs);
      this.removeTab(tabId);
      this.updateTabBar(tabs);
    });
  }

  async initialize() {
    console.log('[TabManager] Initializing...');
    // Get existing tabs or create first tab
    const tabs = await window.electronAPI.tabs.getTabs();
    console.log('[TabManager] Existing tabs:', tabs);
    
    if (tabs.length === 0) {
      console.log('[TabManager] No tabs found, creating first tab...');
      await this.createNewTab();
    } else {
      // Recreate terminal instances for existing tabs
      for (const tab of tabs) {
        await this.createTerminalInstance(tab.id);
      }
      this.updateTabBar(tabs);
      
      // Switch to the active tab
      const activeTab = tabs.find(tab => tab.active);
      if (activeTab) {
        console.log('[TabManager] Switching to active tab:', activeTab.id);
        this.switchToTab(activeTab.id);
      }
    }
  }

  private async createNewTab() {
    console.log('[TabManager] Creating new tab...');
    const tabId = await window.electronAPI.tabs.create();
    console.log(`[TabManager] New tab ID: ${tabId}`);
    if (tabId) {
      // Create terminal instance before the switch event arrives
      await this.createTerminalInstance(tabId);
      console.log(`[TabManager] Terminal instance created for tab: ${tabId}`);
      // The tab will be switched automatically by the backend,
      // which will trigger onTabSwitched event
    }
  }

  private async createTerminalInstance(tabId: string) {
    // Create container for this terminal
    const container = document.createElement('div');
    container.className = 'terminal-instance';
    container.id = `terminal-${tabId}`;
    container.style.display = 'none';
    this.terminalsContainer.appendChild(container);

    // Create terminal
    const terminal = new Terminal({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selectionBackground: '#3a3d41',
        black: '#000000',
        brightBlack: '#666666',
        red: '#cd3131',
        brightRed: '#f14c4c',
        green: '#0dbc79',
        brightGreen: '#23d18b',
        yellow: '#e5e510',
        brightYellow: '#f5f543',
        blue: '#2472c8',
        brightBlue: '#3b8eea',
        magenta: '#bc3fbc',
        brightMagenta: '#d670d6',
        cyan: '#11a8cd',
        brightCyan: '#29b8db',
        white: '#e5e5e5',
        brightWhite: '#ffffff'
      },
      allowTransparency: false,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      tabStopWidth: 8,
      allowProposedApi: true
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(container);

    // Try to load WebGL addon
    let webglAddon: WebglAddon | undefined;
    try {
      webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon?.dispose();
      });
      terminal.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon could not be loaded:', e);
    }

    fitAddon.fit();

    // Set up terminal event handlers
    this.setupTerminalEventHandlers(terminal, tabId);

    // Set up resize observer with debouncing
    let resizeTimeout: NodeJS.Timeout | null = null;
    const resizeObserver = new ResizeObserver(() => {
      // Clear any pending resize
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      
      // Debounce resize events
      resizeTimeout = setTimeout(() => {
        // Double check that the terminal still exists and is visible
        const terminalInstance = this.terminals.get(tabId);
        if (terminalInstance && !terminalInstance.disposed && terminalInstance.container.style.display !== 'none') {
          try {
            // Use requestAnimationFrame to ensure DOM is ready
            requestAnimationFrame(() => {
              // Check again that terminal still exists
              const inst = this.terminals.get(tabId);
              if (inst && !inst.disposed) {
                try {
                  fitAddon.fit();
                  window.electronAPI.terminal.resize(
                    tabId,
                    terminal.cols,
                    terminal.rows
                  );
                } catch (e) {
                  if (!inst.disposed) {
                    console.error('Error during fit/resize:', e);
                  }
                }
              }
            });
          } catch (e) {
            console.error('Error setting up resize:', e);
          }
        }
      }, 50);
    });
    resizeObserver.observe(container);

    // Store terminal instance
    this.terminals.set(tabId, { terminal, fitAddon, container, resizeObserver, webglAddon });

    // Initial resize
    window.electronAPI.terminal.resize(tabId, terminal.cols, terminal.rows);
  }

  private setupTerminalEventHandlers(terminal: Terminal, tabId: string) {
    // Handle terminal input
    terminal.onData((data) => {
      // Check if terminal is still valid
      const instance = this.terminals.get(tabId);
      if (instance && !instance.disposed) {
        window.electronAPI.terminal.write(tabId, data);
      }
    });

    // Handle terminal resize
    terminal.onResize(({ cols, rows }) => {
      // Check if terminal is still valid
      const instance = this.terminals.get(tabId);
      if (instance && !instance.disposed) {
        window.electronAPI.terminal.resize(tabId, cols, rows);
      }
    });

    // Handle copy/paste
    terminal.onSelectionChange(() => {
      const selection = terminal.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
      }
    });

    // Paste on right-click
    terminal.element?.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      const text = await navigator.clipboard.readText();
      if (text) {
        window.electronAPI.terminal.write(tabId, text);
      }
    });

    // Paste on Ctrl/Cmd+V
    document.addEventListener('paste', async (e) => {
      if (terminal.element?.contains(document.activeElement)) {
        e.preventDefault();
        const text = e.clipboardData?.getData('text');
        if (text) {
          window.electronAPI.terminal.write(tabId, text);
        }
      }
    });
  }

  private updateTabBar(tabs: Array<{id: string, name: string, active: boolean}>) {
    // Clear existing tabs
    this.tabsContainer.innerHTML = '';

    // Create tab elements
    tabs.forEach(tab => {
      const tabElement = document.createElement('div');
      tabElement.className = 'tab';
      if (tab.active) {
        tabElement.classList.add('active');
      }
      
      const titleElement = document.createElement('span');
      titleElement.className = 'tab-title';
      titleElement.textContent = tab.name;
      tabElement.appendChild(titleElement);

      const closeButton = document.createElement('button');
      closeButton.className = 'tab-close';
      closeButton.innerHTML = '×';
      closeButton.onclick = (e) => {
        e.stopPropagation();
        console.log(`[TabManager] Close button clicked for tab: ${tab.id}`);
        window.electronAPI.tabs.close(tab.id);
      };
      tabElement.appendChild(closeButton);

      tabElement.onclick = () => {
        console.log(`[TabManager] Tab clicked: ${tab.id}`);
        // Don't switch if already active
        if (!tab.active) {
          window.electronAPI.tabs.switch(tab.id);
        }
      };

      this.tabsContainer.appendChild(tabElement);
    });
  }

  private switchToTab(tabId: string) {
    console.log(`[TabManager] Switching to tab: ${tabId}`);
    
    // If terminal instance doesn't exist yet, wait for it
    const instance = this.terminals.get(tabId);
    if (!instance) {
      console.log(`[TabManager] Terminal instance not ready for tab: ${tabId}, waiting...`);
      // Try again after a short delay
      setTimeout(() => {
        const retryInstance = this.terminals.get(tabId);
        if (retryInstance) {
          this.switchToTab(tabId);
        } else {
          console.error(`[TabManager] Terminal instance still not found for tab: ${tabId}`);
        }
      }, 100);
      return;
    }
    
    // Hide all terminals
    this.terminals.forEach((inst, id) => {
      inst.container.style.display = 'none';
    });

    // Show selected terminal
    console.log(`[TabManager] Found terminal instance for tab: ${tabId}`);
    instance.container.style.display = 'block';
    
    // Use requestAnimationFrame to ensure DOM updates are complete
    requestAnimationFrame(() => {
      const inst = this.terminals.get(tabId);
      if (inst && !inst.disposed) {
        inst.fitAddon.fit();
        // Add a small delay to ensure the terminal is fully visible before focusing
        setTimeout(() => {
          const inst2 = this.terminals.get(tabId);
          if (inst2 && !inst2.disposed) {
            inst2.terminal.focus();
            console.log(`[TabManager] Focused terminal for tab: ${tabId}`);
          }
        }, 50);
      }
    });
    
    this.activeTabId = tabId;
  }

  private removeTab(tabId: string) {
    console.log(`[TabManager] Removing tab: ${tabId}`);
    const instance = this.terminals.get(tabId);
    if (instance) {
      // Mark as disposed to prevent any further operations
      instance.disposed = true;
      
      // Hide the container immediately to prevent any visual operations
      instance.container.style.display = 'none';
      
      // Remove from map immediately
      this.terminals.delete(tabId);
      
      // Stop observing resize events immediately
      if (instance.resizeObserver) {
        instance.resizeObserver.disconnect();
      }
      
      // Clear the terminal screen and disable it
      try {
        instance.terminal.clear();
        instance.terminal.options.disableStdin = true;
      } catch (e) {
        console.error(`[TabManager] Error clearing terminal: ${e}`);
      }
      
      // Use multiple timeouts to ensure all async operations are complete
      setTimeout(() => {
        // First dispose addons
        try {
          if (instance.webglAddon) {
            instance.webglAddon.dispose();
          }
        } catch (e) {
          console.error(`[TabManager] Error disposing WebGL addon: ${e}`);
        }
        
        setTimeout(() => {
          // Then dispose fit addon
          try {
            if (instance.fitAddon) {
              instance.fitAddon.dispose();
            }
          } catch (e) {
            console.error(`[TabManager] Error disposing fit addon: ${e}`);
          }
          
          setTimeout(() => {
            // Finally dispose the terminal
            try {
              instance.terminal.dispose();
            } catch (e) {
              console.error(`[TabManager] Error disposing terminal: ${e}`);
            }
            
            // Remove container from DOM
            try {
              if (instance.container.parentNode) {
                instance.container.remove();
              }
            } catch (e) {
              console.error(`[TabManager] Error removing container: ${e}`);
            }
            
            // Finally dispose the PTY session on backend
            window.electronAPI.terminal.dispose(tabId);
            
            console.log(`[TabManager] Tab removed: ${tabId}`);
          }, 50);
        }, 50);
      }, 100);
    } else {
      console.error(`[TabManager] No terminal instance to remove for tab: ${tabId}`);
    }
  }

  dispose() {
    this.terminals.forEach((instance, tabId) => {
      window.electronAPI.terminal.dispose(tabId);
      instance.terminal.dispose();
    });
    this.terminals.clear();
  }
}

class TerminalApp {
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private sessionId: string | null = null;

  constructor() {
    this.terminal = new Terminal({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selectionBackground: '#3a3d41',
        black: '#000000',
        brightBlack: '#666666',
        red: '#cd3131',
        brightRed: '#f14c4c',
        green: '#0dbc79',
        brightGreen: '#23d18b',
        yellow: '#e5e510',
        brightYellow: '#f5f543',
        blue: '#2472c8',
        brightBlue: '#3b8eea',
        magenta: '#bc3fbc',
        brightMagenta: '#d670d6',
        cyan: '#11a8cd',
        brightCyan: '#29b8db',
        white: '#e5e5e5',
        brightWhite: '#ffffff'
      },
      allowTransparency: false,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      tabStopWidth: 8,
      allowProposedApi: true
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    // Load Unicode11 addon
    // Commenting out for now as it requires allowProposedApi
    // const unicode11Addon = new Unicode11Addon();
    // this.terminal.loadAddon(unicode11Addon);

    this.setupEventHandlers();
  }

  async initialize() {
    const container = document.getElementById('terminal-container');
    if (!container) {
      throw new Error('Terminal container not found');
    }

    this.terminal.open(container);
    
    // Try to load WebGL addon for better performance
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      this.terminal.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon could not be loaded:', e);
    }

    this.fitAddon.fit();

    // Create terminal session
    this.sessionId = await window.electronAPI.terminal.create();

    // Set up resize observer
    const resizeObserver = new ResizeObserver(() => {
      this.fitAddon.fit();
      if (this.sessionId) {
        window.electronAPI.terminal.resize(
          this.sessionId,
          this.terminal.cols,
          this.terminal.rows
        );
      }
    });
    resizeObserver.observe(container);

    // Focus terminal
    this.terminal.focus();
  }

  private setupEventHandlers() {
    // Handle terminal input
    this.terminal.onData((data) => {
      if (this.sessionId) {
        window.electronAPI.terminal.write(this.sessionId, data);
      }
    });

    // Handle terminal resize
    this.terminal.onResize(({ cols, rows }) => {
      if (this.sessionId) {
        window.electronAPI.terminal.resize(this.sessionId, cols, rows);
      }
    });

    // Handle data from backend
    window.electronAPI.terminal.onData((sessionId, data) => {
      if (sessionId === this.sessionId) {
        this.terminal.write(data);
      }
    });

    // Handle terminal exit
    window.electronAPI.terminal.onExit((sessionId) => {
      if (sessionId === this.sessionId) {
        this.terminal.write('\r\n[Process exited]\r\n');
      }
    });

    // Handle copy/paste
    this.terminal.onSelectionChange(() => {
      const selection = this.terminal.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
      }
    });

    // Paste on right-click or Ctrl/Cmd+V
    this.terminal.element?.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      const text = await navigator.clipboard.readText();
      if (text && this.sessionId) {
        window.electronAPI.terminal.write(this.sessionId, text);
      }
    });

    document.addEventListener('paste', async (e) => {
      if (this.terminal.element?.contains(document.activeElement)) {
        e.preventDefault();
        const text = e.clipboardData?.getData('text');
        if (text && this.sessionId) {
          window.electronAPI.terminal.write(this.sessionId, text);
        }
      }
    });
  }

  dispose() {
    if (this.sessionId) {
      window.electronAPI.terminal.dispose(this.sessionId);
    }
    this.terminal.dispose();
  }
}

// Initialize terminal when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded event fired');
  console.log('Window.electronAPI:', window.electronAPI);
  
  const tabManager = new TabManager();
  try {
    await tabManager.initialize();
    console.log('Tab manager initialized successfully');
  } catch (error) {
    console.error('Failed to initialize tab manager:', error);
  }

  // Clean up on window unload
  window.addEventListener('beforeunload', () => {
    tabManager.dispose();
  });
});