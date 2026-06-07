import { TabAudioController } from './audioController.js';

const controllers = new Map(); // tabId -> TabAudioController
const statsIntervals = new Map(); // tabId -> setInterval ID

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== 'offscreen') return false;

  handleOffscreenMessage(message).catch((err) => {
    console.error('Error handling offscreen message:', err);
  });

  return false; // Indicates synchronous handling, no response callback needed
});

async function handleOffscreenMessage(message) {
  const { type, tabId } = message;

  switch (type) {
    case 'capture': {
      const { streamId, settings } = message;
      await handleCapture(tabId, streamId, settings);
      break;
    }
    case 'update': {
      const { settings } = message;
      handleUpdate(tabId, settings);
      break;
    }
    case 'release': {
      await handleRelease(tabId);
      break;
    }
    case 'startStats': {
      handleStartStats(tabId);
      break;
    }
    case 'stopStats': {
      handleStopStats(tabId);
      break;
    }
  }
}

async function handleCapture(tabId, streamId, settings) {
  // If we already have a controller for this tab, release it first
  if (controllers.has(tabId)) {
    await handleRelease(tabId);
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    const controller = new TabAudioController(tabId);
    await controller.init(stream);
    controller.updateSettings(settings);
    controllers.set(tabId, controller);
    
    console.log(`Successfully captured tab ${tabId}`);
  } catch (e) {
    console.error(`Error capturing tab ${tabId} with streamId ${streamId}:`, e);
  }
}

function handleUpdate(tabId, settings) {
  const controller = controllers.get(tabId);
  if (controller) {
    controller.updateSettings(settings);
  }
}

async function handleRelease(tabId) {
  handleStopStats(tabId);

  const controller = controllers.get(tabId);
  if (controller) {
    await controller.close();
    controllers.delete(tabId);
    console.log(`Released tab ${tabId}`);
  }
}

function handleStartStats(tabId) {
  if (statsIntervals.has(tabId)) {
    return; // Already streaming stats for this tab
  }

  const intervalId = setInterval(() => {
    const controller = controllers.get(tabId);
    if (controller) {
      const stats = controller.getStats();
      chrome.runtime.sendMessage({
        target: 'background',
        type: 'stats',
        tabId,
        stats
      }, () => {
        // Access chrome.runtime.lastError to catch and silence closed-port errors
        const err = chrome.runtime.lastError;
      });
    }
  }, 50); // ~20 fps, smooth visual response, low CPU load

  statsIntervals.set(tabId, intervalId);
}

function handleStopStats(tabId) {
  const intervalId = statsIntervals.get(tabId);
  if (intervalId) {
    clearInterval(intervalId);
    statsIntervals.delete(tabId);
  }
}
