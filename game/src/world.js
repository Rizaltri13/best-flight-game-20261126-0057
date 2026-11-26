// Langit Nusantara — the world: an Indonesian archipelago (sea, islands with
// beaches, forest and one volcano), the ring course, the arrival runway and the
// clouds. Everything is derived from the fixed seed in config.js, so the world
// a screenshot shows is the world a player flies.
import { WORLD } from './config.js';
import { mulberry32, makeNoise } from './random.js';

// A bump: a smooth hill that fades to nothing at its radius.
function bump(dx, dz, radius) {
  const d2 = (dx * dx + dz * dz) / (radius * radius);
  if (d2 >= 1) return 0;
  const t = 1 - d2;
  return t * t;
}

export function buildWorld() {
  const rand = mulberry32(WORLD.seed);
  const noise = makeNoise(WORLD.seed ^ 0x9e3779b9);
  const islands = [];
  // Scatter islands along the course, keeping the start strip and the runway
  // island clear of neighbours so both strips sit on open ground.
  const spots = [];
  for (let i = 0; i < WORLD.islandCount; i += 1) {
    const z = 700 + rand() * (WORLD.courseLength - 1400);
    const x = (rand() * 2 - 1) * 1150;
    if (Math.abs(z - WORLD.runwayZ) < 700 && Math.abs(x) < 420) continue;
    if (z < 500 && Math.abs(x) < 300) continue;
    spots.push({ x, z, radius: 260 + rand() * 420, height: 55 + rand() * 130 });
  }
  for (const spot of spots) islands.push(spot);
  // The volcano island: tall, grey, unmistakable from the air.
  islands.push({ x: -560, z: 4600, radius: 620, height: WORLD.volcanoHeight, volcano: true });
  // The runway island: long, flat, coastal, with the strip on its spine.
  islands.push({ x: 0, z: WORLD.runwayZ, radius: 900, height: 26, flat: true });
  // The departure island, smaller and greener, under the start line.
  islands.push({ x: 0, z: 60, radius: 520, height: 42, flat: true });

  // The ring course: eight golden rings threading the islands, each one
  // reachable from the last without a brutal turn.
  const rings = [];
  let rx = 0;
  for (let i = 0; i < WORLD.ringCount; i += 1) {
    const z = 800 + i * 1000;
    rx = Math.max(-650, Math.min(650, rx + (rand() * 2 - 1) * 420));
    // Keep the rings clear of the volcano's slopes: no ring inside its
    // shoulders, so the course never asks for a suicidal line.
    if (Math.abs(z - 4600) < 800 && Math.abs(rx + 560) < 750) {
      rx = rx < -560 ? -560 - 750 : -560 + 750;
      rx = Math.max(-650, Math.min(650, rx));
    }
    const alt = 150 + rand() * 110;
    rings.push({ x: rx, y: alt, z, radius: WORLD.ringRadius, passed: false });
  }
  // The last ring sits on the runway centreline so the final approach is a
  // straight, readable line: rings, then threshold, then touchdown.
  rings[rings.length - 1].x = 0;
  rings[rings.length - 1].y = 170;
  rings[rings.length - 1].z = 7900;
  // No ring may sit inside a hillside: lift any ring that the terrain would
  // swallow to 80 m above the ground under it.
  for (const ring of rings) {
    const ground = heightAt(ring.x, ring.z);
    if (ground > ring.y - 80) ring.y = Math.min(340, ground + 80);
  }

  const clouds = [];
  for (let i = 0; i < WORLD.cloudCount; i += 1) {
    clouds.push({
      x: (rand() * 2 - 1) * 2200,
      y: 380 + rand() * 220,
      z: rand() * WORLD.courseLength,
      size: 90 + rand() * 190,
      puffs: 3 + Math.floor(rand() * 3),
    });
  }

  // Ground height at (x, z): sea is 0, islands rise from their bumps, and a
  // little noise roughens the slopes. The runway island is flattened near
  // the strip so the ground under the threshold is dead level.
  function heightAt(x, z) {
    let h = -6;
    for (const island of islands) {
      const base = bump(x - island.x, z - island.z, island.radius) * island.height;
      h += base;
    }
    const n = noise(x * 0.004 + 40, z * 0.004 + 40) - 0.5;
    h += n * 14 * Math.max(0, Math.min(1, h / 60));
    if (Math.abs(x - WORLD.runwayX) < 260 && Math.abs(z - WORLD.runwayZ) < 620) {
      const edge = Math.max(Math.abs(x - WORLD.runwayX) / 260, Math.abs(z - WORLD.runwayZ) / 620);
      const flat = 8;
      h = flat + (h - flat) * Math.max(0, edge - 0.55) * 2.2;
      if (edge < 0.55) h = flat;
    }
    if (Math.abs(x) < 200 && z < 420) {
      const edge = Math.max(Math.abs(x) / 200, z / 420);
      h = 6 + (h - 6) * Math.max(0, edge - 0.5) * 2;
      if (edge < 0.5) h = 6;
    }
    return Math.max(-6, h);
  }

  // The runway: a strip on the flat island, heading north, with numbers.
  const runway = {
    x: WORLD.runwayX,
    z: WORLD.runwayZ,
    y: 8,
    length: 900,
    width: 46,
    heading: 0,
  };

  return { islands, rings, clouds, runway, heightAt };
}
