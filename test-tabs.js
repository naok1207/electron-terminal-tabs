const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;
let testResults = [];

function log(message) {
  console.log(`[TEST] ${message}`);
  testResults.push(message);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  // Create main window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'dist/main/preload.js')
    }
  });

  await mainWindow.loadFile(path.join(__dirname, 'dist/renderer/index.html'));
  
  // Open DevTools for debugging
  mainWindow.webContents.openDevTools();

  // Wait for initial load
  await sleep(2000);

  // Test 1: Check initial state
  log('Test 1: Checking initial state...');
  const initialTabs = await mainWindow.webContents.executeJavaScript(`
    window.electronAPI.tabs.getTabs()
  `);
  log(`Initial tabs count: ${initialTabs.length}`);
  
  if (initialTabs.length === 0) {
    log('ERROR: No initial tab created');
  } else {
    log('✓ Initial tab exists');
  }

  // Test 2: Create new tab
  log('\nTest 2: Creating new tab...');
  await mainWindow.webContents.executeJavaScript(`
    document.getElementById('new-tab-button').click()
  `);
  
  await sleep(1000);
  
  const tabsAfterCreate = await mainWindow.webContents.executeJavaScript(`
    window.electronAPI.tabs.getTabs()
  `);
  log(`Tabs after create: ${tabsAfterCreate.length}`);
  
  if (tabsAfterCreate.length === 2) {
    log('✓ New tab created successfully');
  } else {
    log('ERROR: New tab not created');
  }

  // Test 3: Check if new tab is active
  const activeTab = tabsAfterCreate.find(tab => tab.active);
  if (activeTab && activeTab.id !== initialTabs[0]?.id) {
    log('✓ New tab is active');
  } else {
    log('ERROR: New tab is not active');
  }

  // Test 4: Check terminal visibility
  log('\nTest 4: Checking terminal visibility...');
  const terminalVisible = await mainWindow.webContents.executeJavaScript(`
    const activeTabId = window.electronAPI.tabs.getTabs().then(tabs => {
      const active = tabs.find(t => t.active);
      if (active) {
        const container = document.getElementById('terminal-' + active.id);
        return container && container.style.display !== 'none';
      }
      return false;
    })
  `);
  
  if (terminalVisible) {
    log('✓ Terminal is visible');
  } else {
    log('ERROR: Terminal is not visible');
  }

  // Test 5: Try to close tab
  log('\nTest 5: Closing tab...');
  await mainWindow.webContents.executeJavaScript(`
    const tabs = document.querySelectorAll('.tab');
    if (tabs.length > 1) {
      // Hover to show close button
      const lastTab = tabs[tabs.length - 1];
      lastTab.dispatchEvent(new MouseEvent('mouseenter'));
      setTimeout(() => {
        const closeButton = lastTab.querySelector('.tab-close');
        if (closeButton) {
          closeButton.click();
        }
      }, 100);
    }
  `);
  
  await sleep(1000);
  
  const tabsAfterClose = await mainWindow.webContents.executeJavaScript(`
    window.electronAPI.tabs.getTabs()
  `);
  log(`Tabs after close: ${tabsAfterClose.length}`);
  
  if (tabsAfterClose.length === 1) {
    log('✓ Tab closed successfully');
  } else {
    log('ERROR: Tab not closed');
  }

  // Print summary
  log('\n=== TEST SUMMARY ===');
  testResults.forEach(result => console.log(result));
  
  // Keep window open for manual inspection
  log('\nTests completed. Window will remain open for inspection.');
}

app.whenReady().then(() => {
  runTests().catch(err => {
    console.error('Test error:', err);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});