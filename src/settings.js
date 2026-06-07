export const DEFAULT_SETTINGS = {
  enabled: false,
  threshold: -24,
  ratio: 12,
  attack: 0.003,
  release: 0.25,
  knee: 30,
  makeupGain: 0
};

export class TabSettingsManager {
  constructor() {
    this.tabSettings = new Map();
  }

  get(tabId) {
    if (!this.tabSettings.has(tabId)) {
      this.tabSettings.set(tabId, { ...DEFAULT_SETTINGS });
    }
    return this.tabSettings.get(tabId);
  }

  update(tabId, newSettings) {
    const current = this.get(tabId);
    const updated = { ...current, ...newSettings };
    this.tabSettings.set(tabId, updated);
    return updated;
  }

  reset(tabId) {
    this.tabSettings.set(tabId, { ...DEFAULT_SETTINGS });
    return this.tabSettings.get(tabId);
  }

  remove(tabId) {
    return this.tabSettings.delete(tabId);
  }

  has(tabId) {
    return this.tabSettings.has(tabId);
  }
}
