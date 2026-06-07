import { vi } from 'vitest';

class MockAudioParam {
  constructor(defaultValue) {
    this._value = defaultValue;
  }
  get value() {
    return this._value;
  }
  set value(val) {
    this._value = val;
  }
  setValueAtTime(val) {
    this._value = val;
  }
}

class MockAudioNode {
  constructor() {
    this.connections = new Set();
  }
  connect(dest) {
    this.connections.add(dest);
    return dest;
  }
  disconnect(dest) {
    if (dest) {
      this.connections.delete(dest);
    } else {
      this.connections.clear();
    }
  }
}

class MockGainNode extends MockAudioNode {
  constructor() {
    super();
    this.gain = new MockAudioParam(1.0);
  }
}

class MockDynamicsCompressorNode extends MockAudioNode {
  constructor() {
    super();
    this.threshold = new MockAudioParam(-24);
    this.knee = new MockAudioParam(30);
    this.ratio = new MockAudioParam(12);
    this.attack = new MockAudioParam(0.003);
    this.release = new MockAudioParam(0.25);
    this.reduction = 0; // reduction is a read-only float value
  }
}

class MockAnalyserNode extends MockAudioNode {
  constructor() {
    super();
    this.fftSize = 2048;
    this.frequencyBinCount = 1024;
  }
  getFloatTimeDomainData(array) {
    // Fill the array with a mock sine wave
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.sin(i * 0.1) * 0.5; // Amplitude of 0.5
    }
  }
  getByteTimeDomainData(array) {
    // Fill the array with a mock byte sine wave (centered around 128)
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.round(128 + Math.sin(i * 0.1) * 64);
    }
  }
}

class MockAudioDestinationNode extends MockAudioNode {}

class MockMediaStreamAudioSourceNode extends MockAudioNode {
  constructor(stream) {
    super();
    this.stream = stream;
  }
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.destination = new MockAudioDestinationNode();
  }
  createGain() {
    return new MockGainNode();
  }
  createDynamicsCompressor() {
    return new MockDynamicsCompressorNode();
  }
  createAnalyser() {
    return new MockAnalyserNode();
  }
  createMediaStreamSource(stream) {
    return new MockMediaStreamAudioSourceNode(stream);
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

class MockMediaStream {
  constructor() {
    this.id = 'mock-stream-id-' + Math.random();
    this.tracks = [{
      stop: vi.fn(),
      enabled: true
    }];
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
}

export const setupWebAudioMock = () => {
  global.AudioContext = MockAudioContext;
  global.MediaStream = MockMediaStream;
  global.window = global;

  // Mock navigator.mediaDevices
  if (!global.navigator) {
    global.navigator = {};
  }
  global.navigator.mediaDevices = {
    getUserMedia: vi.fn().mockImplementation(() => Promise.resolve(new MockMediaStream()))
  };
};

export const teardownWebAudioMock = () => {
  delete global.AudioContext;
  delete global.MediaStream;
  delete global.window;
  if (global.navigator && global.navigator.mediaDevices) {
    delete global.navigator.mediaDevices;
  }
};
