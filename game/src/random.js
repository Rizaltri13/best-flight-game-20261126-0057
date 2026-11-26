// A tiny deterministic random-number source (mulberry32) plus the value-noise
// helpers the terrain and the clouds are built from. Same seed, same islands,
// same rings, same sky — every run, every screenshot, every machine.
/** A seeded generator: returns a float in [0, 1) and never touches Math.random. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 2D value noise in [0, 1): smooth, repeatable, seed-fixed. */
export function makeNoise(seed) {
  const rand = mulberry32(seed);
  const size = 64;
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i += 1) grid[i] = rand();
  const smooth = (t) => t * t * (3 - 2 * t);
  return function noise(x, z) {
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    const tx = smooth(x - fx);
    const tz = smooth(z - fz);
    const at = (gx, gz) => grid[((gz % size + size) % size) * size + ((gx % size + size) % size)];
    const a = at(fx, fz);
    const b = at(fx + 1, fz);
    const c = at(fx, fz + 1);
    const d = at(fx + 1, fz + 1);
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };
}

/** Pick `count` items out of `list` with the seeded generator, no repeats. */
export function pickSome(rand, list, count) {
  const copy = list.slice();
  const out = [];
  while (copy.length > 0 && out.length < count) {
    out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  }
  return out;
}
