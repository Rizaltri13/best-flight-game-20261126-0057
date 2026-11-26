// Langit Nusantara — the game loop and the wiring: fixed-step physics, screen
// changes on keys, the canvas sized to the window, and the ?shot= staging
// the screenshots are taken from. The loop never trusts the wall clock for
// the simulation: every step is 1/60 s of flight.
import { buildWorld } from './world.js';
import {
  SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSE, SCREEN_WIN, SCREEN_LOSE,
  createState, stepFlight, EVENT_RING, EVENT_LANDED, EVENT_CRASHED,
  EVENT_FUEL_EMPTY,
} from './engine.js';
import { renderFrame } from './render.js';
import { createInput, attachInput, readIntent, idleMouse } from './input.js';
import {
  createAudio, startAudio, updateAudio, playRing, playAlarm, playFanfare,
  playThud, toggleMute,
} from './audio.js';
import { stageShot } from './shots.js';
import { VIEW } from './config.js';

const STEP = 1 / 60;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusLine = document.getElementById('status');

const world = buildWorld();
const input = createInput();
const audio = createAudio();
let state = createState();
let best = 0;
try {
  best = Number(window.localStorage.getItem('langit-nusantara-best') || 0) || 0;
} catch {
  best = 0;
}
state.best = best;

function saveBest() {
  try {
    window.localStorage.setItem('langit-nusantara-best', String(best));
  } catch {
    // Private mode or file://: the best score simply does not persist.
  }
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function announce(text) {
  if (statusLine) statusLine.textContent = text;
}

function startSortie() {
  const keepBest = best;
  state = createState();
  state.best = keepBest;
  state.screen = SCREEN_PLAY;
  state.speed = 0;
  state.throttle = 0.55;
  startAudio(audio);
  announce('Lepas landas! Terbang melewati delapan cincin, lalu mendarat di Denpasar.');
}

function restart() {
  startSortie();
}

function onKey(code) {
  startAudio(audio);
  if (code === 'Enter' && state.screen === SCREEN_TITLE) {
    startSortie();
    return;
  }
  if (code === 'KeyR' && (state.screen === SCREEN_WIN || state.screen === SCREEN_LOSE || state.screen === SCREEN_PAUSE)) {
    restart();
    return;
  }
  if (code === 'KeyP' && (state.screen === SCREEN_PLAY || state.screen === SCREEN_PAUSE)) {
    state.screen = state.screen === SCREEN_PLAY ? SCREEN_PAUSE : SCREEN_PLAY;
    announce(state.screen === SCREEN_PAUSE ? 'Jeda.' : 'Lanjut terbang.');
    return;
  }
  if (code === 'KeyG' && state.screen === SCREEN_PLAY) {
    state.gearDown = !state.gearDown;
    state.message = state.gearDown ? 'Roda pendarat turun.' : 'Roda pendarat naik.';
    state.messageTime = 1.5;
    return;
  }
  if (code === 'KeyM') {
    const muted = toggleMute(audio);
    state.message = muted ? 'Suara mati.' : 'Suara hidup.';
    state.messageTime = 1.5;
  }
}

attachInput(canvas, input, { onKey });
window.addEventListener('resize', resize);
resize();

let accumulator = 0;
let lastTime = performance.now();
let alarmCooldown = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  idleMouse(input, now);
  if (state.screen === SCREEN_PLAY) {
    accumulator += dt;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      const events = stepFlight(state, readIntent(input), STEP, world);
      if (events & EVENT_RING) playRing(audio);
      if (events & EVENT_LANDED) {
        playFanfare(audio);
        if (state.score > best) {
          best = state.score;
          state.best = best;
          saveBest();
        }
        announce(`Mendarat mulus! Skor ${state.score}.`);
      }
      if (events & EVENT_CRASHED) {
        playThud(audio);
        announce(`Penerbangan gagal: ${state.endReason}`);
      }
      if (events & EVENT_FUEL_EMPTY) playAlarm(audio);
      if (state.stalled && alarmCooldown <= 0) {
        playAlarm(audio);
        alarmCooldown = 3;
      }
      if (alarmCooldown > 0) alarmCooldown -= STEP;
    }
  }
  updateAudio(audio, state);
  renderFrame(ctx, state, world, canvas.width, canvas.height, now / 1000);
  requestAnimationFrame(frame);
}

// Screenshot staging: ?shot=start|play|ring|land renders one deterministic
// frame of the real game and stops, so the capture is repeatable.
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
if (shotName) {
  const staged = stageShot(shotName, world);
  state = staged.state;
  state.best = best;
  state.screen = staged.screen;
  renderFrame(ctx, state, world, VIEW.width, VIEW.height, 12.5);
  window.__shotReady = true;
  window.__game = { get state() { return state; }, world };
} else {
  window.__game = { get state() { return state; }, world };
  requestAnimationFrame(frame);
}
