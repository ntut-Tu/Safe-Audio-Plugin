export const translations = {
  en: {
    title: "SafeAudio - Volume Limiter",
    protectionSwitch: "Volume Protection",
    protectionOn: "ON",
    protectionOff: "OFF",
    statsTitle: "Audio Statistics",
    inputPeak: "Input Peak",
    outputPeak: "Output Peak",
    gainReduction: "Gain Reduction",
    realtimeWaveform: "Real-time Waveform",
    settingsTitle: "Compressor Settings",
    threshold: "Threshold (dB)",
    ratio: "Ratio",
    attack: "Attack Time (s)",
    release: "Release Time (s)",
    knee: "Knee (dB)",
    makeupGain: "Makeup Gain (dB)",
    resetBtn: "Reset",
    langEn: "English",
    langZh: "繁體中文",
    langJa: "日本語",
    noActiveAudio: "No audio stream detected. Play something first!",
    captureFailed: "Audio capture failed. This tab may be locked by a previous version of the plugin. Please refresh the page to restart capture."
  },
  zh_TW: {
    title: "SafeAudio - 音量突波防護",
    protectionSwitch: "防護開關",
    protectionOn: "開啟",
    protectionOff: "關閉",
    statsTitle: "音訊統計",
    inputPeak: "輸入峰值",
    outputPeak: "輸出峰值",
    gainReduction: "增益衰減",
    realtimeWaveform: "即時波形",
    settingsTitle: "壓縮器參數設定",
    threshold: "閾值 (dB)",
    ratio: "壓縮比率",
    attack: "起動時間 (秒)",
    release: "釋放時間 (秒)",
    knee: "拐點寬度 (dB)",
    makeupGain: "補償增益 (dB)",
    resetBtn: "重設",
    langEn: "English",
    langZh: "繁體中文",
    langJa: "日本語",
    noActiveAudio: "未偵測到音訊流。請先播放音訊！",
    captureFailed: "音訊防護啟用失敗。此分頁可能已被舊版插件鎖定，請重新整理此分頁後再試一次。"
  },
  ja: {
    title: "SafeAudio - 音量リミッター",
    protectionSwitch: "保護スイッチ",
    protectionOn: "オン",
    protectionOff: "オフ",
    statsTitle: "オーディオ統計",
    inputPeak: "入力ピーク",
    outputPeak: "出力ピーク",
    gainReduction: "ゲイン削減",
    realtimeWaveform: "リアルタイム波形",
    settingsTitle: "コンプレッサー設定",
    threshold: "しきい値 (dB)",
    ratio: "圧縮比",
    attack: "アタックタイム (秒)",
    release: "リリースタイム (秒)",
    knee: "ニー (dB)",
    makeupGain: "メイクアップゲイン (dB)",
    resetBtn: "リセット",
    langEn: "English",
    langZh: "繁體中文",
    langJa: "日本語",
    noActiveAudio: "音声が検出されません。音声を再生してください！",
    captureFailed: "音声キャプチャに失敗しました。このタブは古いバージョンのプラグインでロックされている可能性があります。再読み込みしてもう一度お試しください。"
  }
};

export class I18nManager {
  constructor() {
    this.currentLanguage = 'en';
  }

  async init() {
    let lang = null;
    
    // 1. Try to read from chrome storage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const data = await chrome.storage.local.get('selectedLanguage');
        if (data && data.selectedLanguage) {
          lang = data.selectedLanguage;
        }
      } catch (e) {
        console.error('Error reading language from chrome.storage:', e);
      }
    }

    // 2. Try browser UI language if no storage selection exists
    if (!lang) {
      if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) {
        lang = chrome.i18n.getUILanguage();
      } else if (typeof navigator !== 'undefined' && navigator.language) {
        lang = navigator.language;
      }
    }

    this.currentLanguage = this.normalizeLanguage(lang || 'en');
  }

  normalizeLanguage(lang) {
    if (!lang) return 'en';
    const cleanLang = lang.toLowerCase().replace('_', '-');
    if (cleanLang.startsWith('zh-tw') || cleanLang.startsWith('zh-hk') || cleanLang.startsWith('zh-mo') || cleanLang === 'zh-hant') {
      return 'zh_TW';
    }
    if (cleanLang.startsWith('ja')) {
      return 'ja';
    }
    return 'en';
  }

  getLanguage() {
    return this.currentLanguage;
  }

  async setLanguage(lang) {
    this.currentLanguage = this.normalizeLanguage(lang);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        await chrome.storage.local.set({ selectedLanguage: this.currentLanguage });
      } catch (e) {
        console.error('Error writing language to chrome.storage:', e);
      }
    }
  }

  getMessage(key) {
    const dict = translations[this.currentLanguage] || translations['en'];
    if (dict && dict[key] !== undefined) {
      return dict[key];
    }
    // Fallback to English
    const enDict = translations['en'];
    if (enDict && enDict[key] !== undefined) {
      return enDict[key];
    }
    // Fallback to the key itself
    return key;
  }
}
