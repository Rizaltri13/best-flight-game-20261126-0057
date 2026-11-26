// Langit Nusantara — input: keyboard and mouse, both steering the same
// aeroplane. Keys are the precise way to fly; the mouse is the relaxed way:
// move it to bank and pitch, roll the wheel for throttle.
export function createInput() {
  return {
    keys: new Set(),
    // Mouse steering: -1..1 offsets from the canvas centre, 0 when idle.
    mouseX: 0,
    mouseY: 0,
    mouseActive: false,
    mouseTime: 0,
    wheel: 0,
  };
}

/** Read the intent the engine steps with this frame. */
export function readIntent(input) {
  const k = input.keys;
  let pitch = 0;
  let bank = 0;
  // Keys are binary, so they steer at 60% authority: a held ArrowDown gives
  // a gentle descent a landing can survive, while the mouse keeps full range.
  if (k.has('ArrowUp')) pitch += 0.6;
  if (k.has('ArrowDown')) pitch -= 0.6;
  if (k.has('ArrowLeft')) bank -= 1;
  if (k.has('ArrowRight')) bank += 1;
  let throttle = 0;
  if (k.has('KeyW')) throttle += 1;
  if (k.has('KeyS')) throttle -= 1;
  throttle += input.wheel;
  input.wheel = 0;
  // The mouse steers only while it has moved recently; keys always win.
  if (input.mouseActive && pitch === 0 && bank === 0) {
    bank = input.mouseX;
    pitch = -input.mouseY;
  }
  return {
    pitch: Math.max(-1, Math.min(1, pitch)),
    bank: Math.max(-1, Math.min(1, bank)),
    throttle: Math.max(-1, Math.min(1, throttle)),
    brake: k.has('Space'),
  };
}

/** Wire keyboard and mouse listeners onto the canvas; returns a detach fn. */
export function attachInput(canvas, input, hooks) {
  function onKeyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (event.repeat) return;
    input.keys.add(event.code);
    if (hooks.onKey) hooks.onKey(event.code);
  }
  function onKeyUp(event) {
    input.keys.delete(event.code);
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    input.mouseY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    input.mouseActive = true;
    input.mouseTime = performance.now();
  }
  function onWheel(event) {
    event.preventDefault();
    input.wheel += event.deltaY < 0 ? 0.12 : -0.12;
  }
  function onBlur() {
    input.keys.clear();
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  return function detach() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('wheel', onWheel);
  };
}

/** The mouse goes quiet after 2.5 s without moving; keys take over again. */
export function idleMouse(input, now) {
  if (input.mouseActive && now - input.mouseTime > 2500) {
    input.mouseActive = false;
    input.mouseX = 0;
    input.mouseY = 0;
  }
}
