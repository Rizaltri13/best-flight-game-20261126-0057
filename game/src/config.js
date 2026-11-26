// Langit Nusantara — tuning constants for the flight model, the course and the
// presentation. One place holds every number a designer would reach for, so the
// engine, the world and the renderer all agree about the same aeroplane.
export const WORLD = {
  seed: 20261126,
  // The course runs north (+Z) from the departure strip to the arrival strip.
  courseLength: 9200,
  startZ: 0,
  runwayZ: 8800,
  runwayX: 0,
  // Sea level is y = 0; nothing on land may rise above the volcano cap.
  volcanoHeight: 340,
  islandCount: 14,
  cloudCount: 42,
  ringCount: 8,
  ringRadius: 26,
};

export const PLANE = {
  // Metres per second at idle and at full throttle, in level flight.
  minSpeed: 34,
  maxSpeed: 118,
  // Below this the wing stops flying and the nose drops on its own.
  stallSpeed: 44,
  // Degrees per second of bank authority and pitch authority.
  bankRate: 95,
  pitchRate: 42,
  maxBank: 62,
  maxPitchUp: 24,
  maxPitchDown: -18,
  // Turn rate (deg/s) at a full 45-degree bank.
  turnAt45Bank: 26,
  // How fast speed chases the throttle's target speed.
  accel: 14,
  // Extra drag while the airbrake (Space) is held.
  brakeDrag: 26,
  // Crash tolerance: touching down harder than this vertical speed is a crash.
  landingMaxSink: 8,
  landingMaxSpeed: 64,
};

export const SORTIE = {
  // Fuel units: 100 at take-off, rings refund some, throttle burns the rest.
  fuelStart: 100,
  fuelBurnIdle: 0.16,
  fuelBurnFull: 0.85,
  fuelPerRing: 14,
  // Seconds before the sortie is called off for running out of daylight.
  timeLimit: 360,
  ringPoints: 150,
  landingPoints: 500,
  // Bonus for fuel left and for daylight left when the wheels touch down.
  fuelBonusPerUnit: 4,
  timeBonusPerSecond: 2,
};

export const VIEW = {
  width: 1280,
  height: 720,
  fovDegrees: 72,
  // Chase camera: metres behind and above the aeroplane.
  camBehind: 17,
  camAbove: 5.5,
  camLookAhead: 34,
  // Terrain grid: cell size and how far the painter draws around the camera.
  cellSize: 55,
  gridHalfX: 17,
  gridAhead: 46,
  gridBehind: 6,
};

export const COLOURS = {
  skyTop: '#1d4e89',
  skyMid: '#7fb2dd',
  skyLow: '#cfe8f5',
  haze: '#dceef8',
  seaDeep: '#0b5d8a',
  seaShallow: '#2fa3c8',
  sand: '#e8d29a',
  grass: '#5da24a',
  forest: '#2f6b2e',
  rock: '#8a7d72',
  volcano: '#6e5a52',
  runway: '#33373d',
  runwayLine: '#f5f2e6',
  ring: '#ffc93c',
  ringGlow: 'rgba(255, 201, 60, 0.35)',
  hudAmber: '#ffb347',
  hudCyan: '#7fe7ff',
  hudGreen: '#8dff9e',
  hudRed: '#ff6b5e',
  panel: 'rgba(10, 18, 30, 0.82)',
  panelEdge: '#2c4a63',
};
