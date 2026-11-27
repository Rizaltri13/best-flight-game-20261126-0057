// Langit Nusantara — the renderer: a chase-view canvas painter. It projects the
// world (sky, sea, island terrain, runway, rings, clouds) with a small
// perspective camera, draws the aeroplane as a vector sprite, and lights the
// instruments and HUD. No images, no fonts from the network: everything is
// drawn, every frame, from the state the engine owns.

const DEG_R = Math.PI / 180;

function clampR(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Terrain colour for a height, varied a little per cell so slopes read. */
function terrainColour(h, vary) {
  if (h < 1.5) return COLOURS.seaShallow;
  if (h < 4) return COLOURS.sand;
  if (h < 40) return vary > 0.5 ? '#63a851' : COLOURS.grass;
  if (h < 95) return vary > 0.5 ? '#559548' : '#4c8a41';
  if (h < 190) return vary > 0.5 ? '#357a33' : COLOURS.forest;
  if (h < 280) return COLOURS.rock;
  return COLOURS.volcano;
}

/** Build the chase camera from the aeroplane's attitude. */
function cameraFor(state) {
  const headingRad = state.heading * DEG_R;
  const pitchRad = state.pitch * DEG_R;
  const fx = Math.sin(headingRad) * Math.cos(pitchRad);
  const fy = Math.sin(pitchRad);
  const fz = Math.cos(headingRad) * Math.cos(pitchRad);
  const cam = {
    x: state.x - fx * VIEW.camBehind,
    y: state.y - fy * VIEW.camBehind + VIEW.camAbove,
    z: state.z - fz * VIEW.camBehind,
  };
  const look = {
    x: state.x + fx * VIEW.camLookAhead,
    y: state.y + fy * VIEW.camLookAhead,
    z: state.z + fz * VIEW.camLookAhead,
  };
  let F = { x: look.x - cam.x, y: look.y - cam.y, z: look.z - cam.z };
  const fl = Math.hypot(F.x, F.y, F.z) || 1;
  F = { x: F.x / fl, y: F.y / fl, z: F.z / fl };
  // Right = F x world-up, then true up = Right x F. Roll the camera a
  // little with the aeroplane's bank so the world tilts as it banks.
  let R = { x: -F.z, y: 0, z: F.x };
  const rl = Math.hypot(R.x, R.z) || 1;
  R = { x: R.x / rl, y: 0, z: R.z / rl };
  let U = {
    x: R.y * F.z - R.z * F.y,
    y: R.z * F.x - R.x * F.z,
    z: R.x * F.y - R.y * F.x,
  };
  const bankRad = -state.bank * DEG_R * 0.55;
  const cb = Math.cos(bankRad);
  const sb = Math.sin(bankRad);
  const R2 = { x: R.x * cb + U.x * sb, y: R.y * cb + U.y * sb, z: R.z * cb + U.z * sb };
  const U2 = { x: U.x * cb - R.x * sb, y: U.y * cb - R.y * sb, z: U.z * cb - R.z * sb };
  return { pos: cam, F, R: R2, U: U2, pitch: Math.asin(clampR(F.y, -1, 1)) };
}

function makeProjector(cam, w, h) {
  const focal = (h / 2) / Math.tan((VIEW.fovDegrees / 2) * DEG_R);
  return function project(x, y, z) {
    const dx = x - cam.pos.x;
    const dy = y - cam.pos.y;
    const dz = z - cam.pos.z;
    const cx = dx * cam.R.x + dy * cam.R.y + dz * cam.R.z;
    const cy = dx * cam.U.x + dy * cam.U.y + dz * cam.U.z;
    const cz = dx * cam.F.x + dy * cam.F.y + dz * cam.F.z;
    if (cz < 1.5) return null;
    return { x: w / 2 + (cx * focal) / cz, y: h / 2 - (cy * focal) / cz, depth: cz, scale: focal / cz };
  };
}

function drawSky(ctx, w, h, cam, time) {
  const horizonY = h / 2 - Math.tan(cam.pitch) * ((h / 2) / Math.tan((VIEW.fovDegrees / 2) * DEG_R));
  const sky = ctx.createLinearGradient(0, 0, 0, Math.max(horizonY, 1));
  sky.addColorStop(0, COLOURS.skyTop);
  sky.addColorStop(0.6, COLOURS.skyMid);
  sky.addColorStop(1, COLOURS.skyLow);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, Math.max(horizonY, 1));
  // Low sun, late afternoon over the strait.
  const sunX = w * 0.78;
  const sunY = Math.max(40, horizonY - 150);
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 120);
  glow.addColorStop(0, 'rgba(255, 236, 180, 0.95)');
  glow.addColorStop(0.25, 'rgba(255, 214, 120, 0.55)');
  glow.addColorStop(1, 'rgba(255, 214, 120, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 130, sunY - 130, 260, 260);
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
  ctx.fill();
  // Sea below the horizon, with a soft haze band where they meet.
  const sea = ctx.createLinearGradient(0, horizonY, 0, h);
  sea.addColorStop(0, COLOURS.haze);
  sea.addColorStop(0.12, COLOURS.seaShallow);
  sea.addColorStop(1, COLOURS.seaDeep);
  ctx.fillStyle = sea;
  ctx.fillRect(0, Math.max(horizonY, 0), w, h - Math.max(horizonY, 0));
  // Sun glitter: a broken column of light on the water under the sun, so
  // the open sea reads as water and not as a flat band of colour.
  ctx.save();
  for (let row = 0; row < 9; row += 1) {
    const gy = horizonY + 14 + row * row * 3.4;
    if (gy > h - 130) break;
    const gw = 26 + row * 30;
    const jitter = (hash2(row, 7) - 0.5) * gw * 0.7;
    ctx.fillStyle = `rgba(255, 240, 190, ${0.16 - row * 0.013})`;
    ctx.beginPath();
    ctx.ellipse(sunX + jitter, gy, gw / 2, 2.2 + row * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return horizonY;
}

function drawTerrain(ctx, project, world, state) {
  const cell = VIEW.cellSize;
  const camX = state.x;
  const camZ = state.z;
  const x0 = Math.floor((camX - VIEW.gridHalfX * cell) / cell) * cell;
  const x1 = camX + VIEW.gridHalfX * cell;
  const z0 = Math.floor((camZ - VIEW.gridBehind * cell) / cell) * cell;
  const z1 = camZ + VIEW.gridAhead * cell;
  const quads = [];
  for (let z = z0; z < z1; z += cell) {
    for (let x = x0; x < x1; x += cell) {
      const h00 = world.heightAt(x, z);
      const h10 = world.heightAt(x + cell, z);
      const h01 = world.heightAt(x, z + cell);
      const h11 = world.heightAt(x + cell, z + cell);
      const avg = (h00 + h10 + h01 + h11) / 4;
      const p00 = project(x, h00, z);
      const p10 = project(x + cell, h10, z);
      const p01 = project(x, h01, z + cell);
      const p11 = project(x + cell, h11, z + cell);
      if (!p00 || !p10 || !p01 || !p11) continue;
      const depth = (p00.depth + p10.depth + p01.depth + p11.depth) / 4;
      quads.push({ p00, p10, p01, p11, avg, depth, vary: hash2(x, z), slope: Math.abs(h00 - h11) + Math.abs(h10 - h01) });
    }
  }
  quads.sort((a, b) => b.depth - a.depth);
  for (const q of quads) {
    if (q.avg < 0.5) continue; // open sea is the gradient underneath
    let colour = terrainColour(q.avg, q.vary);
    if (q.slope > 14) {
      // Steep ground reads darker, so ridges and cliffs show — graduated
      // with the slope, so hillsides shade smoothly instead of banding.
      const steep = Math.min(1, (q.slope - 14) / 34);
      ctx.fillStyle = shade(colour, 1 - steep * 0.3);
    } else {
      ctx.fillStyle = colour;
    }
    ctx.beginPath();
    ctx.moveTo(q.p00.x, q.p00.y);
    ctx.lineTo(q.p10.x, q.p10.y);
    ctx.lineTo(q.p11.x, q.p11.y);
    ctx.lineTo(q.p01.x, q.p01.y);
    ctx.closePath();
    ctx.fill();
  }
}

/** Darken a #rrggbb colour by a factor. */
function shade(hex, factor) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  return `rgb(${r},${g},${b})`;
}

function drawRunway(ctx, project, world) {
  const r = world.runway;
  const hw = r.width / 2;
  const hl = r.length / 2;
  const corners = [
    project(r.x - hw, r.y, r.z - hl),
    project(r.x + hw, r.y, r.z - hl),
    project(r.x + hw, r.y, r.z + hl),
    project(r.x - hw, r.y, r.z + hl),
  ];
  if (corners.some((c) => !c)) return;
  ctx.fillStyle = COLOURS.runway;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fill();
  // Centreline dashes and threshold bars.
  ctx.strokeStyle = COLOURS.runwayLine;
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i += 1) {
    const zA = r.z - hl + 60 + i * 90;
    const zB = zA + 42;
    const a = project(r.x, r.y + 0.3, zA);
    const b = project(r.x, r.y + 0.3, zB);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Runway edge lights, amber, every 90 m.
  ctx.fillStyle = COLOURS.hudAmber;
  for (let i = 0; i <= 10; i += 1) {
    const z = r.z - hl + i * 90;
    for (const side of [-1, 1]) {
      const p = project(r.x + side * (hw + 3), r.y + 1, z);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.5, 3.5 * p.scale * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Control tower and two hangars beside the strip.
  drawBox(ctx, project, r.x + 120, r.y, r.z - 120, 26, 46, 26, '#c8ccd2', '#5d6b7a');
  drawBox(ctx, project, r.x + 120, r.y + 46, r.z - 120, 30, 12, 30, '#7fe7ff', '#2c4a63');
  drawBox(ctx, project, r.x - 130, r.y, r.z + 60, 60, 22, 40, '#b8452f', '#7e2f1f');
  drawBox(ctx, project, r.x - 130, r.y, r.z + 140, 60, 22, 40, '#3f7d4e', '#2a5233');
}

function drawBox(ctx, project, x, y, z, w, h, d, colour, roof) {
  const hw = w / 2;
  const hd = d / 2;
  const top = [
    project(x - hw, y + h, z - hd), project(x + hw, y + h, z - hd),
    project(x + hw, y + h, z + hd), project(x - hw, y + h, z + hd),
  ];
  const front = [
    project(x - hw, y, z + hd), project(x + hw, y, z + hd),
    project(x + hw, y + h, z + hd), project(x - hw, y + h, z + hd),
  ];
  if (top.some((c) => !c) || front.some((c) => !c)) return;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(front[0].x, front[0].y);
  for (let i = 1; i < 4; i += 1) ctx.lineTo(front[i].x, front[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(top[0].x, top[0].y);
  for (let i = 1; i < 4; i += 1) ctx.lineTo(top[i].x, top[i].y);
  ctx.closePath();
  ctx.fill();
}

/**
 * The boats on the sea lanes: a pointed hull, a white cabin or a triangular
 * perahu sail, and a pale V of wake behind. Drawn far-to-near so a nearer
 * boat overlaps a farther one, and skipped when too small to read.
 */
function drawBoats(ctx, project, world) {
  const list = [];
  for (const boat of world.boats || []) {
    const p = project(boat.x, 0, boat.z);
    if (!p) continue;
    list.push({ boat, p });
  }
  list.sort((a, b) => b.p.depth - a.p.depth);
  for (const { boat, p } of list) {
    const s = boat.size * p.scale;
    if (s < 5 || s > 260) continue;
    const rad = boat.heading * DEG_R;
    const fx = Math.sin(rad);
    const fz = Math.cos(rad);
    // Project the hull's four corners from its heading so the boat sits in
    // the world, not on the screen.
    const corners = [
      [fx * 0.5, fz * 0.5, 0],
      [fz * 0.16, -fx * 0.16, 1],
      [-fx * 0.42, -fz * 0.42, 1],
      [-fz * 0.16, fx * 0.16, 1],
    ];
    const pts = corners.map(([ox, oz]) => project(boat.x + ox * boat.size, 0.4, boat.z + oz * boat.size));
    if (pts.some((q) => !q)) continue;
    // Wake: two pale streaks trailing the stern.
    const stern = project(boat.x - fx * boat.size * 0.5, 0.2, boat.z - fz * boat.size * 0.5);
    const wakeEnd = project(boat.x - fx * boat.size * 2.1, 0.2, boat.z - fz * boat.size * 2.1);
    if (stern && wakeEnd) {
      ctx.save();
      ctx.strokeStyle = 'rgba(230, 248, 255, 0.5)';
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(stern.x, stern.y);
      ctx.lineTo(wakeEnd.x + s * 0.16, wakeEnd.y);
      ctx.moveTo(stern.x, stern.y);
      ctx.lineTo(wakeEnd.x - s * 0.16, wakeEnd.y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#7a4a2b';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
    if (boat.sail) {
      // A white lateen sail above the hull.
      ctx.fillStyle = 'rgba(250, 248, 238, 0.95)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y - s * 0.85);
      ctx.lineTo(p.x + s * 0.42, p.y - s * 0.06);
      ctx.closePath();
      ctx.fill();
    } else {
      // A small white cabin block amidships.
      ctx.fillStyle = '#f2ede0';
      ctx.fillRect(p.x - s * 0.11, p.y - s * 0.2, s * 0.22, s * 0.18);
    }
  }
}

function drawRings(ctx, project, world, state) {
  for (let i = 0; i < world.rings.length; i += 1) {
    const ring = world.rings[i];
    if (ring.passed) continue;
    const p = project(ring.x, ring.y, ring.z);
    if (!p) continue;
    const radius = ring.radius * p.scale;
    if (radius < 3 || radius > 900) continue;
    const isNext = i === state.nextRing;
    ctx.save();
    ctx.globalAlpha = isNext ? 1 : 0.55;
    ctx.strokeStyle = COLOURS.ringGlow;
    ctx.lineWidth = Math.max(4, radius * 0.22);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = isNext ? COLOURS.ring : '#d8b25a';
    ctx.lineWidth = Math.max(2, radius * 0.07);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    // Chevrons on the ring point the way through it.
    ctx.fillStyle = COLOURS.ring;
    for (let k = -1; k <= 1; k += 1) {
      const a = -Math.PI / 2 + k * 0.5;
      const cx = p.x + Math.cos(a) * radius * 0.55;
      const cy = p.y + Math.sin(a) * radius * 0.55;
      ctx.beginPath();
      ctx.moveTo(cx, cy - radius * 0.12);
      ctx.lineTo(cx + radius * 0.1, cy + radius * 0.08);
      ctx.lineTo(cx - radius * 0.1, cy + radius * 0.08);
      ctx.closePath();
      ctx.fill();
    }
    if (isNext && radius < 70) {
      ctx.fillStyle = COLOURS.hudAmber;
      ctx.font = `bold ${Math.max(13, Math.min(22, radius * 0.22))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${i + 1}/8`, p.x, p.y - radius - 10);
    }
    ctx.restore();
  }
}

function drawClouds(ctx, project, world, state) {
  const list = [];
  for (const cloud of world.clouds) {
    const p = project(cloud.x, cloud.y, cloud.z);
    if (!p) continue;
    list.push({ cloud, p });
  }
  list.sort((a, b) => b.p.depth - a.p.depth);
  for (const { cloud, p } of list) {
    const size = cloud.size * p.scale;
    if (size < 4 || size > 900) continue;
    ctx.save();
    ctx.globalAlpha = 0.85;
    // A shaded belly first, so the cloud reads as a body with a sunlit top
    // and a grey underside rather than a flat white blob.
    const belly = ctx.createRadialGradient(p.x, p.y + size * 0.22, 1, p.x, p.y + size * 0.22, size * 0.95);
    belly.addColorStop(0, 'rgba(148, 178, 205, 0.55)');
    belly.addColorStop(1, 'rgba(148, 178, 205, 0)');
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.arc(p.x, p.y + size * 0.22, size * 0.95, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < cloud.puffs; i += 1) {
      const off = (hash2(cloud.x, i * 17) - 0.5) * size * 1.4;
      const offY = (hash2(cloud.z, i * 31) - 0.5) * size * 0.3;
      const r = size * (0.45 + hash2(i, cloud.x) * 0.35);
      const grad = ctx.createRadialGradient(p.x + off, p.y + offY, 1, p.x + off, p.y + offY, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x + off, p.y + offY, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** The aeroplane, seen from behind and above: red-and-white livery, prop blur. */
function drawPlane(ctx, project, state, time) {
  const headingRad = state.heading * DEG_R;
  const pitchRad = state.pitch * DEG_R;
  const nose = {
    x: state.x + Math.sin(headingRad) * Math.cos(pitchRad) * 7,
    y: state.y + Math.sin(pitchRad) * 7,
    z: state.z + Math.cos(headingRad) * Math.cos(pitchRad) * 7,
  };
  const p = project(nose.x, nose.y, nose.z);
  if (!p) return;
  const cx = p.x;
  const cy = p.y + 46;
  const scale = clampR(p.scale * 0.9, 0.35, 2.2);
  const span = 150 * scale;
  const len = 150 * scale;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-state.bank * DEG_R);
  // Propeller blur at the nose (top of the sprite, the aeroplane flies up-screen):
  // a faint disc with two brighter streaks, not a solid bubble.
  ctx.fillStyle = 'rgba(220, 230, 240, 0.16)';
  ctx.beginPath();
  ctx.ellipse(0, -len * 0.52, span * 0.16, len * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(240, 246, 250, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-span * 0.15, -len * 0.52);
  ctx.lineTo(span * 0.15, -len * 0.52);
  ctx.stroke();
  // Main wings, red with white tips and a darker trailing edge, so the wing
  // reads as a surface with a front and a back.
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(-span / 2, len * 0.08);
  ctx.lineTo(-span * 0.08, -len * 0.02);
  ctx.lineTo(span * 0.08, -len * 0.02);
  ctx.lineTo(span / 2, len * 0.08);
  ctx.lineTo(span * 0.3, len * 0.16);
  ctx.lineTo(-span * 0.3, len * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#93302a';
  ctx.beginPath();
  ctx.moveTo(-span * 0.3, len * 0.115);
  ctx.lineTo(span * 0.3, len * 0.115);
  ctx.lineTo(span * 0.3, len * 0.16);
  ctx.lineTo(-span * 0.3, len * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f5f2e6';
  ctx.fillRect(-span / 2, len * 0.08, span * 0.09, len * 0.05);
  ctx.fillRect(span * 0.41, len * 0.08, span * 0.09, len * 0.05);
  // Fuselage: white body, red spine stripe, tapering to the tail.
  ctx.fillStyle = '#f5f2e6';
  ctx.beginPath();
  ctx.moveTo(0, -len * 0.55);
  ctx.quadraticCurveTo(span * 0.09, -len * 0.1, span * 0.07, len * 0.34);
  ctx.lineTo(-span * 0.07, len * 0.34);
  ctx.quadraticCurveTo(-span * 0.09, -len * 0.1, 0, -len * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(-span * 0.015, -len * 0.5, span * 0.03, len * 0.8);
  // The canopy: a dark glass teardrop over the cockpit, with a pale
  // sun-catch along its spine — the detail that makes the sprite read as a
  // built aeroplane rather than a flat cut-out.
  ctx.fillStyle = '#22384c';
  ctx.beginPath();
  ctx.ellipse(0, -len * 0.16, span * 0.045, len * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(190, 225, 245, 0.75)';
  ctx.beginPath();
  ctx.ellipse(-span * 0.012, -len * 0.2, span * 0.016, len * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  // Panel shading down the fuselage's right flank.
  ctx.fillStyle = 'rgba(120, 110, 100, 0.25)';
  ctx.beginPath();
  ctx.moveTo(span * 0.03, -len * 0.34);
  ctx.quadraticCurveTo(span * 0.075, -len * 0.05, span * 0.06, len * 0.32);
  ctx.lineTo(span * 0.03, len * 0.32);
  ctx.closePath();
  ctx.fill();
  // Tailplane and fin.
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(-span * 0.22, len * 0.3);
  ctx.lineTo(span * 0.22, len * 0.3);
  ctx.lineTo(span * 0.12, len * 0.4);
  ctx.lineTo(-span * 0.12, len * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, len * 0.22);
  ctx.lineTo(span * 0.05, len * 0.42);
  ctx.lineTo(-span * 0.05, len * 0.42);
  ctx.closePath();
  ctx.fill();
  // Navigation lights: red port (left wingtip), green starboard (right
  // wingtip), blinking white tail — the aviation convention, seen from
  // behind the aeroplane.
  ctx.fillStyle = '#ff5a4e';
  ctx.beginPath();
  ctx.arc(-span / 2, len * 0.12, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#37e07a';
  ctx.beginPath();
  ctx.arc(span / 2, len * 0.12, 4, 0, Math.PI * 2);
  ctx.fill();
  if (Math.floor(time * 2) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, len * 0.42, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Soft shadow on the ground far below, when the aeroplane is low.
  const groundY = 0;
  const shadow = project(state.x, groundY + 1, state.z);
  if (shadow && state.y < 260) {
    ctx.save();
    ctx.globalAlpha = clampR(0.35 - state.y / 900, 0.05, 0.35);
    ctx.fillStyle = '#06283d';
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, 26 * shadow.scale * 0.4, 8 * shadow.scale * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawHud(ctx, w, h, state, world) {
  const altM = Math.max(0, Math.round(state.y));
  const speedKmh = Math.round(state.speed * 3.6);
  const hdg = Math.round(((state.heading % 360) + 360) % 360);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // Top-left: the three numbers the brief demands — altitude, speed, heading.
  ctx.fillStyle = 'rgba(8, 16, 28, 0.55)';
  ctx.fillRect(14, 12, 300, 86);
  ctx.strokeStyle = COLOURS.panelEdge;
  ctx.strokeRect(14, 12, 300, 86);
  ctx.fillStyle = COLOURS.hudCyan;
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(`ALT ${altM} m`, 26, 42);
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.fillText(`SPD ${speedKmh} km/h`, 26, 72);
  ctx.fillStyle = COLOURS.hudGreen;
  ctx.fillText(`HDG ${String(hdg).padStart(3, '0')}° ${headingLabel(state.heading)}`, 26, 94 - 8 + 8);
  // Top-centre: compass strip with the heading centred.
  const stripW = 340;
  const stripX = w / 2 - stripW / 2;
  ctx.fillStyle = 'rgba(8, 16, 28, 0.55)';
  ctx.fillRect(stripX, 12, stripW, 40);
  ctx.strokeStyle = COLOURS.panelEdge;
  ctx.strokeRect(stripX, 12, stripW, 40);
  ctx.save();
  ctx.beginPath();
  ctx.rect(stripX, 12, stripW, 40);
  ctx.clip();
  ctx.fillStyle = COLOURS.hudCyan;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let d = -60; d <= 60; d += 15) {
    const deg = Math.round(((hdg + d) % 360 + 360) % 360);
    const x = stripX + stripW / 2 + d * (stripW / 130);
    const label = deg % 90 === 0 ? ['N', 'E', 'S', 'W'][deg / 90] : String(deg);
    ctx.fillText(label, x, 38);
    ctx.fillRect(x - 1, 16, 2, 8);
  }
  ctx.restore();
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 7, 12);
  ctx.lineTo(w / 2 + 7, 12);
  ctx.lineTo(w / 2, 24);
  ctx.closePath();
  ctx.fill();
  // Top-right: score, rings, daylight.
  ctx.fillStyle = 'rgba(8, 16, 28, 0.55)';
  ctx.fillRect(w - 314, 12, 300, 86);
  ctx.strokeStyle = COLOURS.panelEdge;
  ctx.strokeRect(w - 314, 12, 300, 86);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText(`SCORE ${state.score}`, w - 26, 42);
  ctx.fillStyle = COLOURS.hudCyan;
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText(`RINGS ${state.ringsPassed}/8`, w - 26, 70);
  const mm = Math.floor(state.timeLeft / 60);
  const ss = Math.floor(state.timeLeft % 60);
  ctx.fillStyle = state.timeLeft < 60 ? COLOURS.hudRed : COLOURS.hudGreen;
  ctx.fillText(`DAYLIGHT ${mm}:${String(ss).padStart(2, '0')}`, w - 26, 94);
  // Next-ring pointer: distance and a chevron toward it.
  const ring = world.rings[state.nextRing];
  if (ring && state.screen === SCREEN_PLAY) {
    const dx = ring.x - state.x;
    const dz = ring.z - state.z;
    const dist = Math.round(Math.hypot(dx, state.y - ring.y, dz));
    const bearing = (Math.atan2(dx, dz) / DEG_R + 360) % 360;
    let rel = ((bearing - state.heading + 540) % 360) - 180;
    ctx.textAlign = 'center';
    ctx.fillStyle = COLOURS.hudAmber;
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(`NEXT RING ${dist} m ${rel > 15 ? '▶' : rel < -15 ? '◀' : '▲'}`, w / 2, 78);
    // The sortie's objective, spelled out under the compass: thread every
    // golden ring, then put her down at Denpasar before the light goes.
    ctx.fillStyle = 'rgba(220, 238, 248, 0.92)';
    ctx.font = 'bold 14px system-ui, sans-serif';
    const objective = state.nextRing < 8
      ? 'MISSION: THREAD THE 8 GOLDEN RINGS — THEN LAND AT DENPASAR'
      : 'MISSION: ALL RINGS FLOWN — LAND AT DENPASAR, GEAR DOWN';
    ctx.fillText(objective, w / 2, 100);
  }
  // Centre message flash.
  if (state.messageTime > 0 && state.message) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(8, 16, 28, 0.6)';
    const tw = ctx.measureText(state.message).width + 36;
    ctx.fillRect(w / 2 - tw / 2, 108, tw, 40);
    ctx.fillStyle = COLOURS.hudAmber;
    ctx.fillText(state.message, w / 2, 136);
  }
  drawInstruments(ctx, w, h, state);
}

/** The lit instrument panel along the bottom: horizon, gauges, fuel, throttle. */
function drawInstruments(ctx, w, h, state) {
  const panelH = 118;
  const y0 = h - panelH;
  ctx.fillStyle = COLOURS.panel;
  ctx.fillRect(0, y0, w, panelH);
  ctx.strokeStyle = COLOURS.panelEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y0);
  ctx.lineTo(w, y0);
  ctx.stroke();
  // Artificial horizon.
  const cx = 92;
  const cy = y0 + panelH / 2;
  const r = 46;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-state.bank * DEG_R);
  // Nose up moves the real horizon DOWN on the instrument: the horizon line
  // sits below the fixed aeroplane symbol by the pitch angle, so more sky
  // shows above it. (It used to move up — inverted.)
  const pitchPx = -clampR(state.pitch, -30, 30) * 1.6;
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(-r - 4, -r - 4 - pitchPx, r * 2 + 8, r + 4 + pitchPx);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-r - 4, -pitchPx, r * 2 + 8, r + 4 + pitchPx);
  ctx.strokeStyle = '#f5f2e6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, -pitchPx);
  ctx.lineTo(r, -pitchPx);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = COLOURS.hudAmber;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy);
  ctx.lineTo(cx - 4, cy);
  ctx.lineTo(cx, cy - 5);
  ctx.lineTo(cx + 4, cy);
  ctx.lineTo(cx + 16, cy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLOURS.hudCyan;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', cx, y0 + panelH - 8);
  // Altimeter + vertical speed.
  const ax = 250;
  ctx.fillStyle = COLOURS.hudCyan;
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.max(0, Math.round(state.y))}`, ax, cy - 8);
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = '#9fc6dd';
  ctx.fillText('metres', ax, cy + 12);
  const vs = state.verticalSpeed;
  ctx.fillStyle = vs > 0.5 ? COLOURS.hudGreen : vs < -0.5 ? COLOURS.hudRed : COLOURS.hudCyan;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(`${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`, ax, cy + 34);
  ctx.fillStyle = '#9fc6dd';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('VERTICAL', ax, y0 + panelH - 8);
  // Airspeed.
  const sx = 430;
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(`${Math.round(state.speed * 3.6)}`, sx, cy - 8);
  ctx.fillStyle = '#9fc6dd';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('km/h', sx, cy + 12);
  ctx.fillStyle = state.stalled ? COLOURS.hudRed : COLOURS.hudGreen;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(state.stalled ? 'STALL!' : 'FLYING', sx, cy + 34);
  // Fuel gauge.
  const fx = 620;
  ctx.fillStyle = '#9fc6dd';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('FUEL', fx, cy - 22);
  ctx.fillStyle = '#12283a';
  ctx.fillRect(fx, cy - 12, 150, 16);
  ctx.fillStyle = state.fuel < 25 ? COLOURS.hudRed : COLOURS.hudGreen;
  ctx.fillRect(fx, cy - 12, 150 * clampR(state.fuel / 100, 0, 1), 16);
  ctx.strokeStyle = COLOURS.panelEdge;
  ctx.strokeRect(fx, cy - 12, 150, 16);
  ctx.fillStyle = COLOURS.hudCyan;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`${Math.round(state.fuel)}%`, fx + 158, cy + 2);
  // Throttle bar.
  ctx.fillStyle = '#9fc6dd';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('THROTTLE', fx, cy + 24);
  ctx.fillStyle = '#12283a';
  ctx.fillRect(fx, cy + 32, 150, 10);
  ctx.fillStyle = COLOURS.hudAmber;
  ctx.fillRect(fx, cy + 32, 150 * clampR(state.throttle, 0, 1), 10);
  ctx.strokeStyle = COLOURS.panelEdge;
  ctx.strokeRect(fx, cy + 32, 150, 10);
  // Warning lights.
  const wx = 850;
  ctx.textAlign = 'left';
  const warnings = [
    { on: state.stalled, label: 'STALL', colour: COLOURS.hudRed },
    { on: state.lowFuel, label: 'LOW FUEL', colour: COLOURS.hudRed },
    { on: state.gearDown, label: 'GEAR DOWN', colour: COLOURS.hudGreen },
  ];
  warnings.forEach((warn, i) => {
    const lx = wx + i * 130;
    ctx.fillStyle = warn.on ? warn.colour : '#24384a';
    ctx.beginPath();
    ctx.arc(lx + 8, cy - 6, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = warn.on ? warn.colour : '#5a7285';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(warn.label, lx + 20, cy - 1);
  });
  ctx.fillStyle = '#9fc6dd';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('Elang Nusantara E-01  •  Bandara Elang, Denpasar', wx, cy + 30);
}

function overlay(ctx, w, h, lines, title, colour) {
  ctx.fillStyle = 'rgba(6, 14, 24, 0.5)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = colour;
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.fillText(title, w / 2, h / 2 - 130);
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillStyle = '#dceef8';
  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, h / 2 - 80 + i * 32);
  });
}

function drawTitle(ctx, w, h, state) {
  overlay(ctx, w, h, [
    'Fly the Indonesian archipelago — thread 8 golden rings,',
    'then land her gently at Bandara Elang, Denpasar.',
    '',
    '↑ / ↓  pitch the nose      ← / →  turn & bank',
    'W / S  throttle      Space  airbrake      G  landing gear',
    'Mouse: move to steer, wheel for throttle',
    'P  pause      R  restart      M  sound',
    '',
    'Press ENTER to take off',
  ], 'LANGIT NUSANTARA', COLOURS.hudAmber);
  ctx.fillStyle = COLOURS.hudCyan;
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText('Elang Nusantara E-01  •  Best score: ' + state.best, w / 2, h / 2 + 215);
}

function drawEnd(ctx, w, h, state) {
  if (state.screen === SCREEN_WIN) {
    const stars = starsFor(state);
    overlay(ctx, w, h, [
      state.endReason,
      '',
      `Final score: ${state.score}   •   Rings: ${state.ringsPassed}/8`,
      `Fuel left: ${Math.round(state.fuel)}%   •   Daylight left: ${Math.round(state.timeLeft)} s`,
      '',
      'Press R to fly again',
    ], state.gearDown ? 'SMOOTH LANDING!' : 'BELLY LANDING!', state.gearDown ? COLOURS.hudGreen : COLOURS.hudAmber);
    ctx.font = '64px system-ui, sans-serif';
    ctx.fillText('★'.repeat(stars) + '☆'.repeat(3 - stars), w / 2, h / 2 + 130);
  } else if (state.screen === SCREEN_LOSE) {
    overlay(ctx, w, h, [
      state.endReason,
      '',
      `Score: ${state.score}   •   Rings: ${state.ringsPassed}/8`,
      '',
      'Press R to try again',
    ], 'FLIGHT OVER', COLOURS.hudRed);
  } else if (state.screen === SCREEN_PAUSE) {
    overlay(ctx, w, h, [
      'The flight is paused.',
      '',
      'Press P to resume, R to restart',
    ], 'PAUSED', COLOURS.hudCyan);
  }
}

/** Draw one frame: world, aeroplane, HUD, then the screen overlay. */
function renderFrame(ctx, state, world, w, h, time) {
  const cam = cameraFor(state);
  const project = makeProjector(cam, w, h);
  drawSky(ctx, w, h, cam, time);
  drawTerrain(ctx, project, world, state);
  drawBoats(ctx, project, world);
  drawRunway(ctx, project, world);
  drawRings(ctx, project, world, state);
  drawClouds(ctx, project, world, state);
  drawPlane(ctx, project, state, time);
  drawHud(ctx, w, h, state, world);
  if (state.screen === SCREEN_TITLE) drawTitle(ctx, w, h, state);
  if (state.screen !== SCREEN_TITLE && state.screen !== SCREEN_PLAY) drawEnd(ctx, w, h, state);
}
