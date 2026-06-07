import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createChromeMock } from './mocks/chrome.mock.js';

let chromeMock;

describe('Tab Settings Isolation and Management', () => {
  beforeEach(() => {
    chromeMock = createChromeMock();
    global.chrome = chromeMock.chrome;
  });

  afterEach(() => {
    chromeMock.clearAll();
    delete global.chrome;
  });

  it('should initialize default settings for a tab', async () => {
    const { TabSettingsManager } = await import('../src/settings.js');
    const manager = new TabSettingsManager();

    const settings = manager.get(1);
    expect(settings.enabled).toBe(false);
    expect(settings.threshold).toBe(-24);
    expect(settings.ratio).toBe(12);
    expect(settings.attack).toBe(0.003);
    expect(settings.release).toBe(0.25);
    expect(settings.knee).toBe(30);
    expect(settings.makeupGain).toBe(0);
  });

  it('should isolate settings between different tabs', async () => {
    const { TabSettingsManager } = await import('../src/settings.js?test=isolation');
    const manager = new TabSettingsManager();

    // Set tab 1 to enabled with threshold -40
    manager.update(1, { enabled: true, threshold: -40 });

    // Verify tab 1 settings changed
    const settings1 = manager.get(1);
    expect(settings1.enabled).toBe(true);
    expect(settings1.threshold).toBe(-40);

    // Verify tab 2 settings remain default
    const settings2 = manager.get(2);
    expect(settings2.enabled).toBe(false);
    expect(settings2.threshold).toBe(-24);
  });

  it('should reset settings to default values for a tab', async () => {
    const { TabSettingsManager } = await import('../src/settings.js?test=reset');
    const manager = new TabSettingsManager();

    manager.update(1, { enabled: true, threshold: -50, ratio: 20 });
    expect(manager.get(1).threshold).toBe(-50);

    manager.reset(1);
    const resetSettings = manager.get(1);
    expect(resetSettings.enabled).toBe(false);
    expect(resetSettings.threshold).toBe(-24);
    expect(resetSettings.ratio).toBe(12);
  });

  it('should remove settings when a tab is closed', async () => {
    const { TabSettingsManager } = await import('../src/settings.js?test=cleanup');
    const manager = new TabSettingsManager();

    manager.update(1, { enabled: true, threshold: -35 });
    expect(manager.has(1)).toBe(true);

    manager.remove(1);
    expect(manager.has(1)).toBe(false);
    // Getting it again should initialize a new default set
    expect(manager.get(1).enabled).toBe(false);
  });
});
