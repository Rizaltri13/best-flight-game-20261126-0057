// Langit Nusantara — the screenshot scenes behind ?shot=start|play|ring|land.
// Each one plays the real engine forward from a fresh sortie for a fixed
// number of steps, steered by a simple autopilot (bank toward the next ring,
// pitch toward its altitude, throttle held high), so the frame is what a
// short flight really looks like and the same seed always gives the same frame.

const STEP_S = 1 / 60;
const DEG_S = Math.PI / 180;

function clampS(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/** Angle from a to b in degrees, wrapped to (-180, 180]. */
function angleDiff(a, b) {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/**
 * The autopilot's intent for this frame: bank toward the target, pitch
 * toward its altitude, throttle to hold a cruise speed. In landing mode the
 * target is the runway threshold and the descent is kept gentle.
 */
function autopilot(state, world, landing) {
  let targetX;
  let targetY;
  let targetZ;
  if (landing) {
    targetX = world.runway.x;
    targetY = 8 + Math.max(0, world.runway.z - state.z - 450) * 0.055;
    targetZ = world.runway.z;
    state.gearDown = world.runway.z - state.z < 2200;
  } else {
    const ring = world.rings[state.nextRing];
    if (!ring) {
      targetX = world.runway.x;
      targetY = 200;
      targetZ = world.runway.z;
    } else {
      targetX = ring.x;
      targetY = ring.y;
      targetZ = ring.z;
    }
  }
  const dx = targetX - state.x;
  const dz = targetZ - state.z;
  const wantHeading = (Math.atan2(dx, dz) / DEG_S + 360) % 360;
  const diff = angleDiff(state.heading, wantHeading);
  const bank = clampS(diff / 28, -1, 1);
  const altError = targetY - state.y;
  let pitch = 0;
  if (landing) {
    pitch = clampS(altError / 60, -0.45, 0.3);
  } else {
    pitch = clampS(altError / 90, -0.5, 0.7);
  }
  // Terrain avoidance: if the ground ahead rises above the aeroplane, climb
  // now — the volcano's slopes are not a line the course should ever take.
  const headingRad = (state.heading * DEG_S);
  for (const ahead of [400, 800, 1200]) {
    const tx = state.x + Math.sin(headingRad) * ahead;
    const tz = state.z + Math.cos(headingRad) * ahead;
    if (world.heightAt(tx, tz) > state.y - 40) pitch = 1;
  }
  let throttle = 0;
  const wantSpeed = landing ? 58 : 92;
  if (state.speed < wantSpeed - 6) throttle = 0.6;
  else if (state.speed > wantSpeed + 6) throttle = -0.6;
  return { pitch, bank, throttle, brake: landing && state.speed > 62 && world.runway.z - state.z < 1200 };
}

/**
 * A straight-in final for the win scene: aim at a point past the far end
 * of the strip (so the heading never flips around the runway centre the
 * way the autopilot's does), hold a gentle descent onto the centreline,
 * gear down, landing speed. The engine still flies every step — this only
 * chooses the stick inputs, like a pilot who has stopped sightseeing.
 */
function flyStraightIn(state, world, maxSeconds) {
  const steps = Math.floor(maxSeconds / STEP_S);
  for (let i = 0; i < steps; i += 1) {
    const aimZ = world.runway.z + 2000;
    const dx = world.runway.x - state.x;
    const dz = aimZ - state.z;
    const wantHeading = (Math.atan2(dx, dz) / DEG_S + 360) % 360;
    const diff = angleDiff(state.heading, wantHeading);
    const bank = clampS(diff / 30, -0.7, 0.7);
    const distToStrip = world.runway.z - state.z;
    // A steeper glide than the autopilot's: the shallow one crossed the
    // far end of the strip still airborne and wandered off over the sea.
    const targetY = 9 + Math.max(0, distToStrip - 150) * 0.09;
    const pitch = clampS((targetY - state.y) / 45, -0.55, 0.3);
    state.gearDown = distToStrip < 2400;
    let throttle = 0;
    if (state.speed < 54) throttle = 0.6;
    else if (state.speed > 60) throttle = -0.6;
    stepFlight(state, { pitch, bank, throttle, brake: state.speed > 60 }, STEP_S, world);
    if (state.screen !== SCREEN_PLAY) break;
  }
  return state;
}

/** Run the autopilot for up to `maxSeconds`, stopping early on `stopWhen`. */
function fly(state, world, maxSeconds, landing, stopWhen) {
  const steps = Math.floor(maxSeconds / STEP_S);
  for (let i = 0; i < steps; i += 1) {
    stepFlight(state, autopilot(state, world, landing), STEP_S, world);
    if (state.screen !== SCREEN_PLAY) break;
    if (stopWhen && stopWhen(state)) break;
  }
  return state;
}

/**
 * Set `world` and a fresh state to the named scene and return the screen to
 * draw over it. Names: start (title over the departure strip), play
 * (mid-course, a ring ahead), ring (passing a ring), land (final approach
 * to the runway, gear down), cover (the play frame, staged as the entry's
 * cover image), win (the whole sortie flown to its landing and its win
 * screen: stars, final score, fuel and daylight left).
 */
function stageShot(name, world) {
  const state = createState();
  state.screen = SCREEN_PLAY;
  state.speed = 0;
  if (name === 'start') {
    // Idling on the departure strip at dawn: the title screen over the
    // aeroplane, the sea and the islands ahead.
    state.screen = SCREEN_TITLE;
    state.y = 10;
    state.speed = 0;
    return { state, screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'ring') {
    fly(state, world, 120, false, (s) => s.z > 2550);
    return { state, screen: state.screen === SCREEN_PLAY ? SCREEN_PLAY : state.screen, best: state.score };
  }
  if (name === 'land') {
    // Fly the whole course, collect the last ring on the centreline, then
    // the approach: gear down, gentle descent.
    fly(state, world, 200, false, (s) => s.z > 7400);
    if (state.screen === SCREEN_PLAY) {
      fly(state, world, 60, false, (s) => s.nextRing >= 8 || s.z > 8200);
    }
    if (state.screen === SCREEN_PLAY) {
      fly(state, world, 120, true, (s) => s.z > world.runway.z - 500);
    }
    const screen = state.screen === SCREEN_PLAY ? SCREEN_PLAY : state.screen;
    return { state, screen, best: state.score };
  }
  if (name === 'win') {
    // Fly the course, collect the last ring on the centreline, then fly a
    // straight-in final until the sortie ends: the win screen over the
    // strip, with the stars and the score the flight earned.
    fly(state, world, 200, false, (s) => s.z > 7400);
    if (state.screen === SCREEN_PLAY) {
      fly(state, world, 60, false, (s) => s.nextRing >= 8 || s.z > 8200);
    }
    if (state.screen === SCREEN_PLAY) {
      flyStraightIn(state, world, 180);
    }
    return { state, screen: state.screen, best: state.score };
  }
  // play and cover: about 45 seconds into the sortie, mid-course with the
  // volcano ahead and a ring on the nose.
  fly(state, world, 46, false, null);
  return { state, screen: state.screen === SCREEN_PLAY ? SCREEN_PLAY : state.screen, best: state.score };
}
