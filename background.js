import { TabSettingsManager } from './src/settings.js';

const settingsManager = new TabSettingsManager();
const activeCaptures = new Set(); // Set of tabIds currently captured
const activePorts = new Map(); // Map of tabId -> port
let offscreenCreating = null; // Promise tracker for offscreen doc creation

// Keep track of whether offscreen document is open
async function hasOffscreenDocument() {
  if (typeof chrome.offscreen.hasDocument === 'function') {
    return await chrome.offscreen.hasDocument();
  }
  // Fallback for older versions or test environments
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    return contexts.length > 0;
  } catch (e) {
    return false;
  }
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (offscreenCreating) {
    await offscreenCreating;
    return;
  }

  offscreenCreating = chrome.offscreen.createDocument({
    url: 'src/offscreen.html',
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Capture tab audio for real-time visualization and compression'
  });

  try {
    await offscreenCreating;
  } finally {
    offscreenCreating = null;
  }
}

async function closeOffscreenDocumentIfUnused() {
  if (activeCaptures.size === 0) {
    try {
      if (await hasOffscreenDocument()) {
        await chrome.offscreen.closeDocument();
      }
    } catch (e) {
      console.error('Error closing offscreen document:', e);
    }
  }
}

// Helper to send messages to offscreen document with error handling
function sendMessageToOffscreen(message) {
  chrome.runtime.sendMessage(message, () => {
    const err = chrome.runtime.lastError;
    if (err) {
      console.debug('Offscreen connection error caught:', err.message);
    }
  });
}

// Start tab capturing
async function startCapture(tabId) {
  if (activeCaptures.has(tabId)) {
    return;
  }

  try {
    await ensureOffscreenDocument();

    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      if (chrome.runtime.lastError) {
        console.error('tabCapture error:', chrome.runtime.lastError.message);
        const port = activePorts.get(tabId);
        if (port) {
          port.postMessage({ type: 'error', code: 'capture_failed', message: chrome.runtime.lastError.message });
        }
        return;
      }

      if (!streamId) {
        console.error('No streamId returned');
        return;
      }

      activeCaptures.add(tabId);
      
      const settings = settingsManager.get(tabId);

      // Send capture message to offscreen document
      sendMessageToOffscreen({
        target: 'offscreen',
        type: 'capture',
        tabId,
        streamId,
        settings
      });

      // If a popup port is currently active for this tab, start stats streaming immediately
      if (activePorts.has(tabId)) {
        sendMessageToOffscreen({
          target: 'offscreen',
          type: 'startStats',
          tabId
        });
      }
    });
  } catch (e) {
    console.error('Failed to start capture:', e);
  }
}

// Stop tab capturing
async function stopCapture(tabId) {
  if (!activeCaptures.has(tabId)) {
    return;
  }

  activeCaptures.delete(tabId);

  sendMessageToOffscreen({
    target: 'offscreen',
    type: 'release',
    tabId
  });

  await closeOffscreenDocumentIfUnused();
}

// Listen for messages from popup and offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'background') {
    switch (message.type) {
      case 'getSettings': {
        const settings = settingsManager.get(message.tabId);
        sendResponse(settings);
        return false; // Return false for synchronous response
      }
      case 'updateSettings': {
        const updated = settingsManager.update(message.tabId, message.settings);
        
        // If protection is enabled, make sure tab is captured
        if (updated.enabled) {
          startCapture(message.tabId);
        }

        // Send setting updates to offscreen if tab is captured
        if (activeCaptures.has(message.tabId)) {
          sendMessageToOffscreen({
            target: 'offscreen',
            type: 'update',
            tabId: message.tabId,
            settings: updated
          });
        } else if (!updated.enabled && activePorts.has(message.tabId)) {
          // If popup is open, protection is OFF, but capture is not started, we still capture to draw stats
          startCapture(message.tabId);
        }

        sendResponse(updated);
        return false; // Return false for synchronous response
      }
      case 'resetSettings': {
        const reset = settingsManager.reset(message.tabId);

        // Send reset parameters to offscreen
        if (activeCaptures.has(message.tabId)) {
          sendMessageToOffscreen({
            target: 'offscreen',
            type: 'update',
            tabId: message.tabId,
            settings: reset
          });
        }

        // If protection is reset to OFF and popup is closed, stop capture
        if (!reset.enabled && !activePorts.has(message.tabId)) {
          stopCapture(message.tabId);
        }

        sendResponse(reset);
        return false; // Return false for synchronous response
      }
      case 'stats': {
        // Forward statistics to the connected popup port
        const port = activePorts.get(message.tabId);
        if (port) {
          port.postMessage(message.stats);
        }
        return false;
      }
    }
  }
  return false; // No asynchronous response from other targets
});

// Handle popup ports for streaming real-time data
chrome.runtime.onConnect.addListener((port) => {
  if (port.name.startsWith('popup-')) {
    const tabId = parseInt(port.name.replace('popup-', ''), 10);
    if (isNaN(tabId)) return;

    activePorts.set(tabId, port);

    // If popup opens, we must capture audio to draw the waveform, even if protection is OFF
    const settings = settingsManager.get(tabId);
    if (settings.enabled || !activeCaptures.has(tabId)) {
      startCapture(tabId);
    }

    // Tell offscreen document to start streaming stats (only if it is already captured)
    if (activeCaptures.has(tabId)) {
      sendMessageToOffscreen({
        target: 'offscreen',
        type: 'startStats',
        tabId
      });
    }

    port.onDisconnect.addListener(() => {
      activePorts.delete(tabId);

      // Tell offscreen document to stop streaming stats to save CPU
      sendMessageToOffscreen({
        target: 'offscreen',
        type: 'stopStats',
        tabId
      });

      // If protection is disabled, release capture completely since popup is closed
      const currentSettings = settingsManager.get(tabId);
      if (!currentSettings.enabled) {
        stopCapture(tabId);
      }
    });
  }
});

// Clean up settings and captures when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  settingsManager.remove(tabId);
  activePorts.delete(tabId);
  if (activeCaptures.has(tabId)) {
    stopCapture(tabId);
  }
});
