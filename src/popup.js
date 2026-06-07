import { I18nManager } from './i18n.js';

let currentTabId = null;
let i18n = null;
let currentSettings = null;
let port = null;
let silenceTimer = null;

// Initialize i18n manager and locate active tab
document.addEventListener('DOMContentLoaded', async () => {
  i18n = new I18nManager();
  await i18n.init();
  translateUI();

  // Load language select
  const langSelect = document.getElementById('lang-select');
  langSelect.value = i18n.getLanguage();
  langSelect.addEventListener('change', async (e) => {
    await i18n.setLanguage(e.target.value);
    translateUI();
  });

  // Get current active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      currentTabId = tabs[0].id;
      initPopup();
    }
  });
});

async function initPopup() {
  // 1. Fetch current tab settings from background
  chrome.runtime.sendMessage(
    { target: 'background', type: 'getSettings', tabId: currentTabId },
    (settings) => {
      if (chrome.runtime.lastError || !settings) {
        console.warn('Failed to get settings:', chrome.runtime.lastError);
        return;
      }
      currentSettings = settings;
      updateUIControls(settings);
      
      // Establish port connection to background for streaming audio stats
      connectTelemetryPort();
    }
  );

  // 2. Setup UI Event Listeners
  setupEventListeners();
}

function connectTelemetryPort() {
  if (port) {
    port.disconnect();
  }

  // Connect port to background
  port = chrome.runtime.connect({ name: `popup-${currentTabId}` });

  // Listen for real-time stats or errors
  port.onMessage.addListener((msg) => {
    if (msg && msg.type === 'error') {
      handleCaptureError(msg);
    } else {
      renderRealtimeData(msg);
    }
  });

  port.onDisconnect.addListener(() => {
    port = null;
  });
}

function handleCaptureError(error) {
  // Hide no audio warning
  const warningBanner = document.getElementById('no-audio-warning');
  if (warningBanner) warningBanner.classList.add('hidden');

  // Show critical capture error warning (e.g. reload required)
  const errorBanner = document.getElementById('error-warning');
  if (errorBanner) {
    errorBanner.classList.remove('hidden');
  }

  // Reset VU meters and canvases to silence
  renderRealtimeData({
    inputPeak: -100,
    outputPeak: -100,
    gainReduction: 0,
    inputWaveform: [],
    outputWaveform: []
  });
}

function translateUI() {
  // Find all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    const translation = i18n.getMessage(key);
    if (translation) {
      if (element.tagName === 'INPUT' && element.type === 'button') {
        element.value = translation;
      } else {
        element.textContent = translation;
      }
    }
  });

  // Update specific slider badges and statuses
  if (currentSettings) {
    updateUIControls(currentSettings);
  }
}

function updateUIControls(settings) {
  // Update toggle state
  const toggle = document.getElementById('protection-toggle');
  toggle.checked = !!settings.enabled;

  // Update status label
  const statusLabel = document.getElementById('protection-status-label');
  if (settings.enabled) {
    statusLabel.textContent = i18n.getMessage('protectionOn');
    statusLabel.classList.add('active');
    statusLabel.classList.remove('text-muted');
  } else {
    statusLabel.textContent = i18n.getMessage('protectionOff');
    statusLabel.classList.remove('active');
    statusLabel.classList.add('text-muted');
  }

  // Update sliders
  document.getElementById('param-threshold').value = settings.threshold;
  document.getElementById('param-ratio').value = settings.ratio;
  document.getElementById('param-attack').value = settings.attack;
  document.getElementById('param-release').value = settings.release;
  document.getElementById('param-knee').value = settings.knee;
  document.getElementById('param-makeup-gain').value = settings.makeupGain;

  // Update badges
  document.getElementById('threshold-val').textContent = `${settings.threshold} dB`;
  document.getElementById('ratio-val').textContent = `${settings.ratio.toFixed(1)}:1`;
  
  // Attack display: show in ms if less than 0.1s
  const attackMs = Math.round(settings.attack * 1000);
  document.getElementById('attack-val').textContent = `${attackMs} ms`;

  // Release display
  const releaseMs = Math.round(settings.release * 1000);
  document.getElementById('release-val').textContent = `${releaseMs} ms`;

  document.getElementById('knee-val').textContent = `${settings.knee} dB`;
  document.getElementById('makeup-gain-val').textContent = `${settings.makeupGain} dB`;
}

function setupEventListeners() {
  // Protection Toggle
  const toggle = document.getElementById('protection-toggle');
  toggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    updateSettings({ enabled });
  });

  // Parameter Sliders
  setupSliderListener('param-threshold', 'threshold', (val) => `${val} dB`);
  setupSliderListener('param-ratio', 'ratio', (val) => `${parseFloat(val).toFixed(1)}:1`);
  setupSliderListener('param-attack', 'attack', (val) => `${Math.round(val * 1000)} ms`);
  setupSliderListener('param-release', 'release', (val) => `${Math.round(val * 1000)} ms`);
  setupSliderListener('param-knee', 'knee', (val) => `${val} dB`);
  setupSliderListener('param-makeup-gain', 'makeupGain', (val) => `${val} dB`);

  // Settings Drawer Toggle
  const drawer = document.getElementById('settings-drawer');
  const toggleBtn = document.getElementById('settings-toggle-btn');
  const closeBtn = document.getElementById('settings-close-btn');

  toggleBtn.addEventListener('click', () => {
    drawer.classList.toggle('hidden');
  });

  closeBtn.addEventListener('click', () => {
    drawer.classList.add('hidden');
  });

  // Reset Button
  const resetBtn = document.getElementById('reset-btn');
  resetBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage(
      { target: 'background', type: 'resetSettings', tabId: currentTabId },
      (settings) => {
        if (chrome.runtime.lastError || !settings) return;
        currentSettings = settings;
        updateUIControls(settings);
      }
    );
  });
}

function setupSliderListener(sliderId, settingName, displayFormatter) {
  const slider = document.getElementById(sliderId);
  const badgeId = sliderId.replace('param-', '') + '-val';
  const badge = document.getElementById(badgeId);

  slider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    badge.textContent = displayFormatter(val);
    updateSettings({ [settingName]: val });
  });
}

function updateSettings(newSettings) {
  if (!currentTabId) return;

  chrome.runtime.sendMessage(
    { target: 'background', type: 'updateSettings', tabId: currentTabId, settings: newSettings },
    (updatedSettings) => {
      if (chrome.runtime.lastError || !updatedSettings) return;
      currentSettings = updatedSettings;
      updateUIControls(updatedSettings);
    }
  );
}

function renderRealtimeData(stats) {
  // Hide error banner since we successfully received data
  const errorBanner = document.getElementById('error-warning');
  if (errorBanner) {
    errorBanner.classList.add('hidden');
  }

  // Check for audio presence
  // If peak is above -90 dB, there is active audio
  const hasAudio = stats.inputPeak > -90;
  
  const warningBanner = document.getElementById('no-audio-warning');
  if (hasAudio) {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    warningBanner.classList.add('hidden');
  } else {
    // If silent, wait 1.5 seconds before showing warning to prevent flickering
    if (!silenceTimer && !warningBanner.classList.contains('hidden')) {
      // warning already shown
    } else if (!silenceTimer) {
      silenceTimer = setTimeout(() => {
        warningBanner.classList.remove('hidden');
      }, 1500);
    }
  }

  // Update peak value text
  const inputPeakText = document.getElementById('input-peak-val');
  const outputPeakText = document.getElementById('output-peak-val');
  const gainReductText = document.getElementById('gain-reduction-val');

  inputPeakText.textContent = hasAudio ? `${stats.inputPeak.toFixed(1)} dB` : '-100.0 dB';
  outputPeakText.textContent = hasAudio ? `${stats.outputPeak.toFixed(1)} dB` : '-100.0 dB';
  gainReductText.textContent = stats.gainReduction < -0.1 ? `${stats.gainReduction.toFixed(1)} dB` : '0.0 dB';

  // Update VU meter bar widths
  // Map dB range [-60, 0] to percentage [0, 100]
  const dbToPct = (db) => {
    if (db <= -60) return 0;
    if (db >= 0) return 100;
    return ((db + 60) / 60) * 100;
  };

  const inputVuBar = document.getElementById('input-vu-bar');
  const outputVuBar = document.getElementById('output-vu-bar');
  
  inputVuBar.style.width = `${dbToPct(hasAudio ? stats.inputPeak : -100)}%`;
  outputVuBar.style.width = `${dbToPct(hasAudio ? stats.outputPeak : -100)}%`;

  // Update Reduction Meter bar width
  // Map reduction range [0, 30] to percentage [0, 100]
  const reductionBar = document.getElementById('reduction-bar');
  const reductionDb = Math.abs(stats.gainReduction);
  const reductionPct = Math.min(100, (reductionDb / 30) * 100);
  reductionBar.style.width = `${reductionPct}%`;

  // Render waveforms on canvases
  const canvasBefore = document.getElementById('canvas-before');
  const canvasAfter = document.getElementById('canvas-after');

  // Input Waveform (Cyan)
  drawWaveform(
    canvasBefore, 
    stats.inputWaveform, 
    '#00f2fe', 
    'rgba(0, 242, 254, 0.3)'
  );
  
  // Output Waveform (Magenta)
  // When protection is disabled, the controller bypasses compression, so input and output waveforms will be identical.
  drawWaveform(
    canvasAfter, 
    stats.outputWaveform, 
    '#f857a6', 
    'rgba(248, 87, 166, 0.3)'
  );
}

function drawWaveform(canvas, dataArray, color, glowColor) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  ctx.clearRect(0, 0, width, height);
  
  // Draw center reference line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  if (!dataArray || dataArray.length === 0) return;

  ctx.strokeStyle = color;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 4;
  ctx.lineWidth = 2;
  ctx.beginPath();

  const sliceWidth = width / dataArray.length;
  let x = 0;

  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i]; // value between -1.0 and 1.0
    const y = (height / 2) + (v * (height / 2) * 0.9); // scale down slightly to keep inside borders

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    x += sliceWidth;
  }

  ctx.stroke();
  
  // Reset shadow for performance
  ctx.shadowBlur = 0;
}
