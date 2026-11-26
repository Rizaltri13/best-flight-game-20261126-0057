// Langit Nusantara — sound, synthesised live with WebAudio: an engine hum
// that follows the throttle, a chime for each ring, an alarm when the wing
// stalls, and a short fanfare for a good landing. No audio files, no network.
function createAudio() {
  return {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    windGain: null,
    muted: false,
    started: false,
  };
}

/** Start the audio graph. Must run from a user gesture (key or click). */
function startAudio(audio) {
  if (audio.started) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audio.ctx = new Ctx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.5;
    audio.master.connect(audio.ctx.destination);
    // Engine: a low sawtooth plus a soft sub sine, through a low-pass.
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.connect(audio.master);
    audio.engineOsc = audio.ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 68;
    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0;
    audio.engineOsc.connect(audio.engineGain);
    audio.engineGain.connect(filter);
    audio.engineOsc.start();
    // Wind: looped filtered noise whose level follows the airspeed.
    const buffer = audio.ctx.createBuffer(1, audio.ctx.sampleRate * 2, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = audio.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const windFilter = audio.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 900;
    audio.windGain = audio.ctx.createGain();
    audio.windGain.gain.value = 0;
    noise.connect(windFilter);
    windFilter.connect(audio.windGain);
    audio.windGain.connect(audio.master);
    noise.start();
    audio.started = true;
  } catch {
    audio.started = false;
  }
}

/** Follow the aeroplane each frame: pitch and loudness track throttle/speed. */
function updateAudio(audio, state) {
  if (!audio.started || !audio.ctx) return;
  const t = audio.ctx.currentTime;
  const throttle = state.screen === 'play' ? state.throttle : 0;
  audio.engineOsc.frequency.setTargetAtTime(58 + throttle * 70, t, 0.1);
  audio.engineGain.gain.setTargetAtTime(state.screen === 'play' ? 0.05 + throttle * 0.06 : 0, t, 0.15);
  audio.windGain.gain.setTargetAtTime(state.screen === 'play' ? Math.min(0.12, state.speed / 900) : 0, t, 0.2);
}

/** A short tone: frequency, seconds, shape, loudness. */
function tone(audio, freq, seconds, type, volume, when = 0) {
  if (!audio.started || !audio.ctx) return;
  const t = audio.ctx.currentTime + when;
  const osc = audio.ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = audio.ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(t);
  osc.stop(t + seconds + 0.05);
}

/** Two-note chime when a ring is collected. */
function playRing(audio) {
  tone(audio, 880, 0.25, 'sine', 0.22);
  tone(audio, 1318, 0.4, 'sine', 0.18, 0.09);
}

/** Low alarm for a stall or an empty tank. */
function playAlarm(audio) {
  tone(audio, 220, 0.18, 'square', 0.12);
  tone(audio, 220, 0.18, 'square', 0.12, 0.22);
}

/** Rising arpeggio for a landing worth celebrating. */
function playFanfare(audio) {
  const notes = [523, 659, 784, 1046];
  notes.forEach((freq, i) => tone(audio, freq, 0.5, 'triangle', 0.2, i * 0.13));
}

/** A dull thud for a crash. */
function playThud(audio) {
  tone(audio, 70, 0.5, 'sine', 0.4);
  tone(audio, 45, 0.7, 'sine', 0.3, 0.05);
}

/** Mute or unmute everything at once. */
function toggleMute(audio) {
  audio.muted = !audio.muted;
  if (audio.master && audio.ctx) {
    audio.master.gain.setTargetAtTime(audio.muted ? 0 : 0.5, audio.ctx.currentTime, 0.05);
  }
  return audio.muted;
}
