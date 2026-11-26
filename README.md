[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/Rizaltri13/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/Rizaltri13/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# Langit Nusantara — Terbang di Atas Kepulauan

An entry for the [make.fun "Make the best flight game" bounty](https://make.fun/bounty/best-flight-game-20261126-0057).

Fly the little red-and-white prop plane **Elang Nusantara E-01** across an
Indonesian archipelago at golden hour: sea, beaches, forested islands and one
smoking volcano below, clouds above. Thread **8 golden rings**, mind your
fuel and the setting sun, then bring her home — gear down, gentle descent —
onto the runway at **Bandara Elang, Denpasar**.

## How to play

Open `game/index.html` in desktop Chrome (or serve `game/` with
`node serve.ts` and open http://localhost:8080). No network, no build step.

| Key | Action |
| --- | --- |
| ↑ / ↓ | Pitch nose up / down |
| ← / → | Bank and turn |
| W / S | Throttle up / down |
| Space | Airbrake |
| G | Landing gear |
| P | Pause |
| R | Restart |
| M | Mute |
| Enter | Take off |

Mouse: move to steer, scroll wheel for throttle.

## The sortie

- **8 rings** — each one is +150 points and +14 fuel.
- **Fuel** — burns with the throttle; rings refund it. An empty tank means a dead-stick glide.
- **Daylight** — 6 minutes. Dusk ends the sortie.
- **Landing** — on the runway, aligned, slow, sinking gently. A hard or crooked touchdown is a crash, and so is the sea.
- **Score** — rings + landing bonus + fuel and daylight left. 3 stars for all 8 rings and a clean landing.

## What is inside

- `game/src/world.js` — the seeded archipelago: islands, volcano, ring course, runway, clouds.
- `game/src/engine.js` — the flight model: pitch, bank, turn, stall, fuel, rings, landings and crashes.
- `game/src/render.js` — the chase-view painter: sky, sea, terrain, runway, rings, the aeroplane sprite, and the lit instruments (artificial horizon, altimeter, airspeed, compass, fuel, throttle).
- `game/src/input.js` — keyboard and mouse.
- `game/src/audio.js` — synthesised WebAudio: engine hum, wind, ring chime, stall alarm, landing fanfare.
- `game/src/shots.js` — the deterministic screenshot scenes (`?shot=start|play|ring|land`).
- `game/src/main.js` — the fixed-step game loop.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.

Original idea, art, sounds and names — nothing copied from a commercial game.
The terrain is a procedural archipelago inspired by Indonesia; the aeroplane,
the airport and the mission are invented.

## License

MIT — see [LICENSE](LICENSE).
