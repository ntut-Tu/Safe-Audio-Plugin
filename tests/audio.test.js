import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupWebAudioMock, teardownWebAudioMock } from './mocks/webAudio.mock.js';

describe('Web Audio Processing and Routing', () => {
  beforeEach(() => {
    setupWebAudioMock();
  });

  afterEach(() => {
    teardownWebAudioMock();
  });

  it('should initialize AudioContext and create node graph', async () => {
    // Import the audio controller logic
    const { TabAudioController } = await import('../src/audioController.js');
    const controller = new TabAudioController(1); // tabId = 1
    
    const mockStream = new MediaStream();
    await controller.init(mockStream);

    expect(controller.ctx).toBeDefined();
    expect(controller.source).toBeDefined();
    expect(controller.analyserBefore).toBeDefined();
    expect(controller.compressor).toBeDefined();
    expect(controller.gainNode).toBeDefined();
    expect(controller.analyserAfter).toBeDefined();
    
    // Default mode is bypass (enabled = false)
    expect(controller.enabled).toBe(false);
  });

  it('should route audio through compressor when enabled', async () => {
    const { TabAudioController } = await import('../src/audioController.js?test=routing-enabled');
    const controller = new TabAudioController(2);
    
    const mockStream = new MediaStream();
    await controller.init(mockStream);

    // Update settings: enable protection
    controller.updateSettings({
      enabled: true,
      threshold: -30,
      ratio: 15,
      attack: 0.005,
      release: 0.1,
      knee: 20,
      makeupGain: 4
    });

    expect(controller.enabled).toBe(true);

    // Verify parameters are mapped to compressor and gain node
    expect(controller.compressor.threshold.value).toBe(-30);
    expect(controller.compressor.ratio.value).toBe(15);
    expect(controller.compressor.attack.value).toBe(0.005);
    expect(controller.compressor.release.value).toBe(0.1);
    expect(controller.compressor.knee.value).toBe(20);
    
    // Makeup gain converts from dB to gain value multiplier: gain = 10^(db/20)
    // 4 dB = 10^(4/20) ~ 1.58489
    expect(controller.gainNode.gain.value).toBeCloseTo(Math.pow(10, 4 / 20));
  });

  it('should route audio directly bypassing compressor when disabled', async () => {
    const { TabAudioController } = await import('../src/audioController.js?test=routing-disabled');
    const controller = new TabAudioController(3);
    
    const mockStream = new MediaStream();
    await controller.init(mockStream);

    controller.updateSettings({ enabled: false, threshold: -20 });
    expect(controller.enabled).toBe(false);
  });

  it('should compute peak and RMS statistics correctly', async () => {
    const { TabAudioController } = await import('../src/audioController.js?test=stats');
    const controller = new TabAudioController(4);
    
    const mockStream = new MediaStream();
    await controller.init(mockStream);

    const stats = controller.getStats();
    
    // We mocked time-domain data as a sine wave with amplitude 0.5
    // Peak should be 0.5. In dB: 20 * log10(0.5) ~ -6.02 dB
    expect(stats.inputPeak).toBeCloseTo(20 * Math.log10(0.5), 1);
    
    // RMS of sine wave with amplitude A is A / sqrt(2) ~ 0.5 / 1.414 ~ 0.3535
    // In dB: 20 * log10(0.3535) ~ -9.03 dB
    expect(stats.inputRms).toBeCloseTo(20 * Math.log10(0.5 / Math.sqrt(2)), 1);
  });

  it('should release resources when closed', async () => {
    const { TabAudioController } = await import('../src/audioController.js?test=cleanup');
    const controller = new TabAudioController(5);
    
    const mockStream = new MediaStream();
    await controller.init(mockStream);

    const stopMock = mockStream.getAudioTracks()[0].stop;
    const ctx = controller.ctx;

    await controller.close();

    expect(stopMock).toHaveBeenCalled();
    expect(ctx.state).toBe('closed');
  });
});
