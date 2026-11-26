// Langit Nusantara — the flight engine: one aeroplane, one sortie. It owns the
// state (position, attitude, speed, fuel, rings, score), steps the physics, and
// decides the three endings: landed, crashed, or out of fuel and daylight.
// The renderer only reads this state; the input only writes an intent.
import { PLANE, SORTIE, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_WIN = 'win';
export const SCREEN_LOSE = 'lose';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_FUEL_EMPTY = 8;
export const EVENT_TIME_UP = 16;

const DEG = Math.PI / 180;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function moveToward(value, target, step) {
  if (value < target) return Math.min(target, value + step);
  if (value > target) return Math.max(target, value - step);
  return value;
}

/** A fresh sortie: on the departure strip, engine idling, daylight ahead. */
export function createState() {
  return {
    screen: SCREEN_TITLE,
    x: 0,
    y: 10,
    z: 0,
    heading: 0,
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0.55,
    fuel: SORTIE.fuelStart,
    timeLeft: SORTIE.timeLimit,
    score: 0,
    ringsPassed: 0,
    nextRing: 0,
    gearDown: false,
    landed: false,
    endReason: '',
    message: '',
    messageTime: 0,
    best: 0,
    // Flight-path trail for the renderer (last N positions, newest first).
    trail: [],
    // Per-frame derived values the HUD reads.
    verticalSpeed: 0,
    turnRate: 0,
    stalled: false,
    lowFuel: false,
  };
}

/**
 * One physics step. `input` is { pitch: -1..1, bank: -1..1, throttle: -1..1,
 * brake: bool } where pitch +1 is nose up and bank +1 is right wing down.
 * Returns an event bitmask (EVENT_RING, EVENT_LANDED, ...).
 */
export function stepFlight(state, input, dt, world) {
  if (state.screen !== SCREEN_PLAY) return EVENT_NONE;
  let events = EVENT_NONE;
  const ground = world.heightAt(state.x, state.z);

  // Throttle chases the stick; the airbrake drags the target speed down.
  state.throttle = clamp(state.throttle + input.throttle * dt * 0.7, 0, 1);
  let targetSpeed = PLANE.minSpeed + state.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
  if (input.brake) targetSpeed -= PLANE.brakeDrag;
  state.speed = moveToward(state.speed, targetSpeed, PLANE.accel * dt);

  // Attitude: bank and pitch chase their targets, then the nose follows.
  const bankTarget = clamp(input.bank, -1, 1) * PLANE.maxBank;
  const pitchTarget = clamp(input.pitch, -1, 1) * (input.pitch >= 0 ? PLANE.maxPitchUp : -PLANE.maxPitchDown);
  state.bank = moveToward(state.bank, bankTarget, PLANE.bankRate * dt);
  state.pitch = moveToward(state.pitch, pitchTarget, PLANE.pitchRate * dt);

  // A stalled wing cannot hold the nose up while airborne: it drops and the
  // aeroplane sinks. On the ground the wing is not flying yet, so the
  // take-off roll is unaffected.
  state.stalled = state.speed < PLANE.stallSpeed;
  const airborne = state.y - ground > 8;
  const effectivePitch = state.stalled && airborne ? Math.min(state.pitch, -6) : state.pitch;

  // Turning: bank tilts the lift vector, so the heading follows the bank.
  const turn = (state.bank / 45) * PLANE.turnAt45Bank * (state.speed / PLANE.maxSpeed + 0.35);
  state.turnRate = turn;
  state.heading = (state.heading + turn * dt + 360) % 360;

  // Move along the nose: forward speed splits into horizontal and vertical.
  const headingRad = state.heading * DEG;
  const pitchRad = effectivePitch * DEG;
  const forward = Math.cos(pitchRad) * state.speed;
  const vx = Math.sin(headingRad) * forward;
  const vz = Math.cos(headingRad) * forward;
  const vy = Math.sin(pitchRad) * state.speed;
  state.x += vx * dt;
  state.z += vz * dt;
  state.y += vy * dt;
  state.verticalSpeed = vy;

  // The world ends at the map edge: turn the aeroplane back, gently.
  if (state.z > WORLD.courseLength + 600 || Math.abs(state.x) > 2400 || state.z < -500) {
    state.heading = (state.heading + 180 * dt * 0.5 + 360) % 360;
    state.message = 'Balik! Kamu keluar dari area penerbangan.';
    state.messageTime = 2;
  }
  // Ceiling: thin air above 900 m will not hold the climb.
  if (state.y > 900) {
    state.y = 900;
    state.pitch = Math.min(state.pitch, 0);
  }

  // Fuel burns with the throttle; an empty tank is a dead stick.
  state.fuel -= (SORTIE.fuelBurnIdle + state.throttle * SORTIE.fuelBurnFull) * dt;
  state.lowFuel = state.fuel < 25;
  if (state.fuel <= 0) {
    state.fuel = 0;
    state.throttle = 0;
    events |= EVENT_FUEL_EMPTY;
  }

  // The clock runs down; dusk ends the sortie even in the air.
  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    events |= EVENT_TIME_UP;
  }

  // Rings: crossing the ring's plane inside its circle collects it.
  const ring = world.rings[state.nextRing];
  if (ring && !ring.passed) {
    const dx = state.x - ring.x;
    const dy = state.y - ring.y;
    const dz = state.z - ring.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < ring.radius * 0.95) {
      ring.passed = true;
      state.ringsPassed += 1;
      state.nextRing += 1;
      state.score += SORTIE.ringPoints;
      state.fuel = Math.min(SORTIE.fuelStart, state.fuel + SORTIE.fuelPerRing);
      state.message = `CINCIN ${state.ringsPassed}/8! +${SORTIE.ringPoints} poin, +bahan bakar`;
      state.messageTime = 2.5;
      events |= EVENT_RING;
    }
  }

  // Trail for the renderer: one point a step, capped.
  state.trail.unshift({ x: state.x, y: state.y, z: state.z });
  if (state.trail.length > 90) state.trail.pop();
  if (state.messageTime > 0) state.messageTime -= dt;

  // Ground contact: a slow aeroplane on dry land is rolling, not crashing —
  // that is the take-off roll, and a gentle touch-and-go. On the runway
  // strip it may be a landing, in the sea it is a ditching, anywhere else
  // at speed it is a crash.
  const clearance = state.y - ground;
  const runway = world.runway;
  const overRunway =
    Math.abs(state.x - runway.x) < runway.width / 2 + 6 &&
    Math.abs(state.z - runway.z) < runway.length / 2;
  if (clearance <= 2 && vy <= 0.5) {
    const sink = -vy;
    const aligned = Math.abs(((state.heading + 180) % 360) - 180) < 25 || Math.abs(state.heading) < 25;
    const gentle = sink <= PLANE.landingMaxSink && state.speed <= PLANE.landingMaxSpeed;
    if (overRunway && aligned && gentle && state.y - runway.y < 6) {
      state.landed = true;
      state.screen = SCREEN_WIN;
      state.score += SORTIE.landingPoints;
      state.score += Math.round(state.fuel * SORTIE.fuelBonusPerUnit);
      state.score += Math.round(state.timeLeft * SORTIE.timeBonusPerSecond);
      state.endReason = 'Mendarat mulus di Bandara Elang, Denpasar.';
      events |= EVENT_LANDED;
    } else if (state.speed < 58 && ground > 1 && sink <= PLANE.landingMaxSink) {
      // A gentle touch at low speed is a roll, not a crash: the take-off
      // roll, and a touch-and-go. A hard slam still breaks the aeroplane.
      state.y = ground + 2;
      state.verticalSpeed = 0;
    } else {
      state.screen = SCREEN_LOSE;
      state.endReason = clearance <= 0.5 && ground <= 1
        ? 'Mendarat di laut — pesawat tenggelam.'
        : sink > PLANE.landingMaxSink
          ? 'Pendaratan terlalu keras — roda patah.'
          : 'Menabrak tanah.';
      events |= EVENT_CRASHED;
    }
  }

  if (events & EVENT_FUEL_EMPTY) {
    // A dead stick can still glide to the strip; only the ground decides.
    state.message = 'BAHAN BAKAR HABIS — melayang tanpa mesin!';
    state.messageTime = 3;
  }
  if (events & EVENT_TIME_UP && state.screen === SCREEN_PLAY) {
    state.screen = SCREEN_LOSE;
    state.endReason = 'Waktu habis — matahari terbenam sebelum mendarat.';
  }
  return events;
}

/** Stars for the win screen: landing is one, rings earn the rest. */
export function starsFor(state) {
  if (!state.landed) return 0;
  if (state.ringsPassed >= 8) return 3;
  if (state.ringsPassed >= 5) return 2;
  return 1;
}

/** Compass label for a heading in degrees (0 = north). */
export function headingLabel(heading) {
  const points = ['U', 'UTL', 'TL', 'TTL', 'T', 'TTG', 'TG', 'STG', 'S', 'SBD', 'BD', 'BBD', 'B', 'BBL', 'BL', 'UBL'];
  const index = Math.round((((heading % 360) + 360) % 360) / 22.5) % 16;
  return points[index];
}
