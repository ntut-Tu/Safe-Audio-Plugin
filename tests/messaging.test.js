import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createChromeMock } from './mocks/chrome.mock.js';
import { setupWebAudioMock, teardownWebAudioMock } from './mocks/webAudio.mock.js';

let chromeMock;

describe('Chrome Extension Messaging and Routing', () => {
  beforeEach(() => {
    chromeMock = createChromeMock();
    global.chrome = chromeMock.chrome;
    setupWebAudioMock();
  });

  afterEach(() => {
    chromeMock.clearAll();
    delete global.chrome;
    teardownWebAudioMock();
  });

  it('should register listeners and respond synchronously to getSettings in background', async () => {
    // Import background.js to register its listeners
    await import('../background.js?test=messaging-bg');

    const messageListeners = chrome.runtime.onMessage.listeners;
    expect(messageListeners.size).toBeGreaterThan(0);

    // Get the first listener
    const listener = Array.from(messageListeners)[0];
    
    // Send a getSettings message
    const sendResponseSpy = vi.fn();
    const result = listener(
      { target: 'background', type: 'getSettings', tabId: 10 },
      {},
      sendResponseSpy
    );

    // Verify it returned false (synchronous response)
    expect(result).toBe(false);
    expect(sendResponseSpy).toHaveBeenCalled();
    expect(sendResponseSpy.mock.calls[0][0]).toBeDefined();
    expect(sendResponseSpy.mock.calls[0][0].enabled).toBe(false); // Default settings
  });

  it('should return false synchronously in offscreen listener to prevent premature channel closure', async () => {
    // Import offscreen.js
    await import('../src/offscreen.js?test=messaging-offscreen');

    const messageListeners = chrome.runtime.onMessage.listeners;
    // The background worker and offscreen document are mocked in the same environment,
    // so we search for the listener added by offscreen.js
    const offscreenListener = Array.from(messageListeners).find(
      l => l.toString().includes('offscreen') || l.name === 'offscreenListener' || l.toString().includes('target')
    );

    if (offscreenListener) {
      const result = offscreenListener(
        { target: 'background', type: 'getSettings', tabId: 10 }, // A message for background
        {},
        () => {}
      );

      // Verify that it did not return a Promise (async function would return a Promise)
      expect(result).not.toBeInstanceOf(Promise);
      expect(result).toBe(false); // Handled early and ignored
    }
  });

  it('should synchronize stats activation in onConnect', async () => {
    await import('../background.js?test=messaging-connect');
    
    const connectListeners = chrome.runtime.onConnect.listeners;
    expect(connectListeners.size).toBeGreaterThan(0);

    const connectListener = Array.from(connectListeners)[0];
    
    // Create a mock port
    const mockPort = {
      name: 'popup-10',
      onDisconnect: { addListener: vi.fn() },
      postMessage: vi.fn()
    };

    // Trigger onConnect
    connectListener(mockPort);

    // Wait a tick for async calls inside startCapture to execute
    await new Promise(resolve => setTimeout(resolve, 0));

    // Verify that startCapture is triggered (which opens offscreen document)
    expect(chrome.offscreen.createDocument).toHaveBeenCalled();
  });

  it('should notify popup port of tabCapture errors when lastError occurs', async () => {
    await import('../background.js?test=messaging-error');
    
    // Mock chrome.tabCapture to trigger lastError
    chrome.tabCapture.getMediaStreamId.mockImplementationOnce((options, callback) => {
      chrome.runtime.lastError = { message: 'Cannot capture a tab with an active stream.' };
      callback(null);
      delete chrome.runtime.lastError;
    });

    const connectListeners = chrome.runtime.onConnect.listeners;
    const connectListener = Array.from(connectListeners)[0];
    
    const mockPort = {
      name: 'popup-12',
      onDisconnect: { addListener: vi.fn() },
      postMessage: vi.fn()
    };

    // Trigger connect (which triggers startCapture)
    connectListener(mockPort);

    // Wait a tick for async calls inside startCapture to execute
    await new Promise(resolve => setTimeout(resolve, 0));

    // Verify postMessage was called on port with the capture error
    expect(mockPort.postMessage).toHaveBeenCalled();
    expect(mockPort.postMessage.mock.calls[0][0].type).toBe('error');
    expect(mockPort.postMessage.mock.calls[0][0].code).toBe('capture_failed');
  });
});
