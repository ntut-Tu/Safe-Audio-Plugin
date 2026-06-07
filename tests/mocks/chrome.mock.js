import { vi } from 'vitest';

class MockEvent {
  constructor() {
    this.listeners = new Set();
  }
  addListener(listener) {
    this.listeners.add(listener);
  }
  removeListener(listener) {
    this.listeners.delete(listener);
  }
  trigger(...args) {
    this.listeners.forEach(listener => listener(...args));
  }
  clear() {
    this.listeners.clear();
  }
}

class MockStorageArea {
  constructor() {
    this.store = {};
  }
  get(keys, callback) {
    let result = {};
    if (typeof keys === 'string') {
      result[keys] = this.store[keys];
    } else if (Array.isArray(keys)) {
      keys.forEach(key => {
        result[key] = this.store[key];
      });
    } else if (keys === null || keys === undefined) {
      result = { ...this.store };
    } else {
      // keys is an object with default values
      Object.keys(keys).forEach(key => {
        result[key] = this.store[key] !== undefined ? this.store[key] : keys[key];
      });
    }
    if (callback) callback(result);
    return Promise.resolve(result);
  }
  set(items, callback) {
    Object.assign(this.store, items);
    if (callback) callback();
    return Promise.resolve();
  }
  remove(keys, callback) {
    if (typeof keys === 'string') {
      delete this.store[keys];
    } else if (Array.isArray(keys)) {
      keys.forEach(key => delete this.store[key]);
    }
    if (callback) callback();
    return Promise.resolve();
  }
  clear() {
    this.store = {};
  }
}

class MockPort {
  constructor(name) {
    this.name = name;
    this.onMessage = new MockEvent();
    this.onDisconnect = new MockEvent();
    this.otherSide = null;
  }
  postMessage(msg) {
    if (this.otherSide && this.otherSide.onMessage) {
      this.otherSide.onMessage.trigger(msg, this.otherSide);
    }
  }
  disconnect() {
    this.onDisconnect.trigger(this);
    if (this.otherSide) {
      this.otherSide.onDisconnect.trigger(this.otherSide);
    }
  }
}

export const createChromeMock = () => {
  const onMessage = new MockEvent();
  const onConnect = new MockEvent();
  const onRemoved = new MockEvent();

  const localStorage = new MockStorageArea();
  const sessionStorage = new MockStorageArea();

  const chromeMock = {
    runtime: {
      sendMessage: vi.fn((message, callback) => {
        // Simple mock trigger
        onMessage.trigger(message, {}, callback);
      }),
      onMessage,
      onConnect,
      connect: vi.fn(({ name } = {}) => {
        const clientPort = new MockPort(name);
        const serverPort = new MockPort(name);
        clientPort.otherSide = serverPort;
        serverPort.otherSide = clientPort;
        // Trigger server-side onConnect
        setTimeout(() => {
          onConnect.trigger(serverPort);
        }, 0);
        return clientPort;
      }),
      getURL: vi.fn((path) => `chrome-extension://mock-id/${path}`),
    },
    storage: {
      local: localStorage,
      session: sessionStorage,
    },
    tabs: {
      query: vi.fn((queryInfo, callback) => {
        const result = [{ id: 1, active: true, windowId: 1, title: 'Mock Tab' }];
        if (callback) callback(result);
        return Promise.resolve(result);
      }),
      onRemoved,
    },
    tabCapture: {
      getMediaStreamId: vi.fn((options, callback) => {
        if (callback) callback('mock-stream-id');
      }),
    },
    offscreen: {
      createDocument: vi.fn(() => Promise.resolve()),
      closeDocument: vi.fn(() => Promise.resolve()),
      hasDocument: vi.fn(() => Promise.resolve(false)),
      Reason: {
        USER_MEDIA: 'USER_MEDIA',
        AUDIO_PLAYBACK: 'AUDIO_PLAYBACK',
      }
    },
    i18n: {
      getUILanguage: vi.fn(() => 'zh-TW'),
      getMessage: vi.fn((key) => `[localized:${key}]`),
    }
  };

  return {
    chrome: chromeMock,
    clearAll: () => {
      onMessage.clear();
      onConnect.clear();
      onRemoved.clear();
      localStorage.clear();
      sessionStorage.clear();
      vi.clearAllMocks();
    }
  };
};
