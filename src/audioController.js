export class TabAudioController {
  constructor(tabId) {
    this.tabId = tabId;
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.analyserBefore = null;
    this.compressor = null;
    this.gainNode = null;
    this.analyserAfter = null;
    this.enabled = false;
  }

  async init(stream) {
    this.stream = stream;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    this.source = this.ctx.createMediaStreamSource(stream);
    this.analyserBefore = this.ctx.createAnalyser();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.gainNode = this.ctx.createGain();
    this.analyserAfter = this.ctx.createAnalyser();

    // Default FFT size for waveforms and VU meters
    this.analyserBefore.fftSize = 1024;
    this.analyserAfter.fftSize = 1024;

    this.enabled = false;
    this.applyRouting();
  }

  applyRouting() {
    if (!this.source) return;

    // Disconnect everything first to clear paths
    try {
      this.source.disconnect();
      this.analyserBefore.disconnect();
      this.compressor.disconnect();
      this.gainNode.disconnect();
      this.analyserAfter.disconnect();
    } catch (e) {
      // Ignore disconnect errors if nodes weren't connected
    }

    if (this.enabled) {
      // Active protection route:
      // Tab Source -> Analyser Before -> Compressor (Limiter) -> Gain (Makeup) -> Analyser After -> Speakers (destination)
      this.source.connect(this.analyserBefore);
      this.analyserBefore.connect(this.compressor);
      this.compressor.connect(this.gainNode);
      this.gainNode.connect(this.analyserAfter);
      this.analyserAfter.connect(this.ctx.destination);
    } else {
      // Bypassed route (direct):
      // Tab Source -> Analyser Before -> Gain (Makeup) -> Analyser After -> Speakers (destination)
      this.source.connect(this.analyserBefore);
      this.analyserBefore.connect(this.gainNode);
      this.gainNode.connect(this.analyserAfter);
      this.analyserAfter.connect(this.ctx.destination);
    }
  }

  updateSettings(settings) {
    if (!this.ctx) return;

    const enabledChanged = this.enabled !== !!settings.enabled;
    this.enabled = !!settings.enabled;

    if (enabledChanged) {
      this.applyRouting();
    }

    // Update DynamicsCompressorNode parameters
    if (this.compressor) {
      if (settings.threshold !== undefined) this.compressor.threshold.value = settings.threshold;
      if (settings.knee !== undefined) this.compressor.knee.value = settings.knee;
      if (settings.ratio !== undefined) this.compressor.ratio.value = settings.ratio;
      if (settings.attack !== undefined) this.compressor.attack.value = settings.attack;
      if (settings.release !== undefined) this.compressor.release.value = settings.release;
    }

    // Update GainNode parameter (makeup gain in dB to linear gain conversion)
    if (this.gainNode && settings.makeupGain !== undefined) {
      const linearGain = Math.pow(10, settings.makeupGain / 20);
      this.gainNode.gain.value = linearGain;
    }
  }

  getStats() {
    if (!this.analyserBefore || !this.analyserAfter) {
      return {
        inputPeak: -100,
        inputRms: -100,
        outputPeak: -100,
        outputRms: -100,
        gainReduction: 0,
        inputWaveform: [],
        outputWaveform: []
      };
    }

    const bufferLength = this.analyserBefore.frequencyBinCount;
    const dataArrayBefore = new Float32Array(bufferLength);
    const dataArrayAfter = new Float32Array(bufferLength);

    this.analyserBefore.getFloatTimeDomainData(dataArrayBefore);
    this.analyserAfter.getFloatTimeDomainData(dataArrayAfter);

    const calcStats = (data) => {
      let sumSquares = 0;
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const val = data[i];
        const absVal = Math.abs(val);
        if (absVal > peak) peak = absVal;
        sumSquares += val * val;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      
      const peakDb = peak > 0.00001 ? 20 * Math.log10(peak) : -100;
      const rmsDb = rms > 0.00001 ? 20 * Math.log10(rms) : -100;

      return { peakDb, rmsDb };
    };

    const statsBefore = calcStats(dataArrayBefore);
    const statsAfter = calcStats(dataArrayAfter);

    // DynamicCompressorNode.reduction is a float indicating gain reduction in dB
    // In some browsers, reduction is a negative value; in others, it's positive. We standardize it to negative dB or 0.
    let reduction = 0;
    if (this.enabled && this.compressor) {
      reduction = this.compressor.reduction;
      if (typeof reduction === 'object' && reduction.value !== undefined) {
        reduction = reduction.value; // Fallback in case of mock differences
      }
    }

    // Downsample waveform data to 128 elements for UI performance
    const downsampleWaveform = (data, pointsCount = 128) => {
      const step = Math.floor(data.length / pointsCount) || 1;
      const result = [];
      for (let i = 0; i < data.length && result.length < pointsCount; i += step) {
        result.push(Number(data[i].toFixed(4)));
      }
      return result;
    };

    return {
      inputPeak: statsBefore.peakDb,
      inputRms: statsBefore.rmsDb,
      outputPeak: statsAfter.peakDb,
      outputRms: statsAfter.rmsDb,
      gainReduction: Number(reduction),
      inputWaveform: downsampleWaveform(dataArrayBefore),
      outputWaveform: downsampleWaveform(dataArrayAfter)
    };
  }

  async close() {
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch (e) {
        // Context might already be closed
      }
    }
    if (this.stream) {
      try {
        this.stream.getTracks().forEach(track => track.stop());
      } catch (e) {
        // Stream might already be stopped
      }
    }
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.analyserBefore = null;
    this.compressor = null;
    this.gainNode = null;
    this.analyserAfter = null;
  }
}
