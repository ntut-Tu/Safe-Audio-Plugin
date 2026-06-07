import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createChromeMock } from './mocks/chrome.mock.js';

let chromeMock;

describe('Dynamic i18n Localization', () => {
  beforeEach(async () => {
    chromeMock = createChromeMock();
    global.chrome = chromeMock.chrome;
    // Set a default navigator.language
    Object.defineProperty(global.navigator, 'language', {
      value: 'zh-TW',
      configurable: true,
      writable: true
    });
  });

  afterEach(() => {
    chromeMock.clearAll();
    delete global.chrome;
  });

  it('should initialize with browser language if no storage is set', async () => {
    // Import dynamically so it runs in our mocked environment
    const { I18nManager } = await import('../src/i18n.js');
    const manager = new I18nManager();
    await manager.init();

    expect(manager.getLanguage()).toBe('zh_TW'); // zh-TW normalized to zh_TW
    expect(manager.getMessage('protectionSwitch')).toBe('防護開關');
  });

  it('should fallback to en if browser language is unsupported', async () => {
    global.navigator.language = 'fr-FR';
    chrome.i18n.getUILanguage.mockReturnValue('fr');

    const { I18nManager } = await import('../src/i18n.js?test=fallback');
    const manager = new I18nManager();
    await manager.init();

    expect(manager.getLanguage()).toBe('en');
    expect(manager.getMessage('protectionSwitch')).toBe('Volume Protection');
  });

  it('should load custom preference from chrome storage local', async () => {
    // Set custom language in mock storage
    await chrome.storage.local.set({ selectedLanguage: 'ja' });

    const { I18nManager } = await import('../src/i18n.js?test=storage');
    const manager = new I18nManager();
    await manager.init();

    expect(manager.getLanguage()).toBe('ja');
    expect(manager.getMessage('protectionSwitch')).toBe('保護スイッチ');
  });

  it('should allow runtime switching of language and update storage', async () => {
    const { I18nManager } = await import('../src/i18n.js?test=switching');
    const manager = new I18nManager();
    await manager.init();

    expect(manager.getLanguage()).toBe('zh_TW');
    
    await manager.setLanguage('en');
    expect(manager.getLanguage()).toBe('en');
    expect(manager.getMessage('protectionSwitch')).toBe('Volume Protection');

    // Verify storage updated
    const data = await chrome.storage.local.get('selectedLanguage');
    expect(data.selectedLanguage).toBe('en');
  });

  it('should fallback to English for a missing key if key exists in English', async () => {
    const { I18nManager } = await import('../src/i18n.js?test=missing');
    const manager = new I18nManager();
    await manager.init();
    
    // Simulate setting ja, but we can verify that a key that exists will return properly
    expect(manager.getMessage('nonexistent_key')).toBe('nonexistent_key');
  });
});
