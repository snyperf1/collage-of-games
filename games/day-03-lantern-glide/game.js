const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const BASE_WIDTH = 960;
const BASE_HEIGHT = 540;
const BELT_Y = 348;
const BELT_H = 94;
const RAIL_Y = 116;
const PARCEL_W = 54;
const PARCEL_H = 40;
const MAX_ON_BELT = 4;
const PICKUP_RADIUS_X = 46;
const PICKUP_RADIUS_Y = 34;
const BINS = [
  { type: 0, label: "SUN", x: 130, y: 158, w: 200, h: 106, color: "#f6a23c" },
  { type: 1, label: "WAVE", x: 380, y: 158, w: 200, h: 106, color: "#4fa7ff" },
  { type: 2, label: "SPARK", x: 630, y: 158, w: 200, h: 106, color: "#ef5d4a" },
];

const TYPE_COLORS = ["#f6a23c", "#4fa7ff", "#ef5d4a"];
const TYPE_LABELS = ["SUN", "WAVE", "SPARK"];
const PARCEL_PATTERN = [1, 0, 2, 1, 2, 0, 0, 1, 2, 2, 1, 0, 1, 0, 2, 1, 2, 0];
const BELT_SPEED_STAGES = [92, 100, 108, 116, 124];
const SPAWN_INTERVAL_STAGES = [1.6, 1.5, 1.38, 1.28, 1.18];

const keys = new Set();
const pointer = {
  active: false,
  x: BASE_WIDTH / 2,
  y: BASE_HEIGHT / 2,
};

let renderScale = 1;

let nextParcelId = 1;

const dustSpecks = Array.from({ length: 120 }, () => ({
  x: Math.random() * BASE_WIDTH,
  y: Math.random() * BASE_HEIGHT,
  a: 0.04 + Math.random() * 0.07,
  r: 0.6 + Math.random() * 1.4,
}));

const state = {
  mode: "menu",
  time: 0,
  timeLeft: 92,
  score: 0,
  sorted: 0,
  goal: 15,
  lives: 5,
  combo: 0,
  bestCombo: 0,
  beltOffset: 0,
  spawnTimer: 0,
  spawnEvery: 1.2,
  patternIndex: 0,
  flash: 0,
  messageTimer: 0,
  message: "",
  lastUpdate: performance.now(),
  crane: {
    x: BASE_WIDTH / 2,
    vx: 0,
    holdId: null,
    cableJitter: 0,
  },
  selectedBin: 1,
  parcels: [],
  particles: [],
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function configureCanvas() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  renderScale = dpr;
  canvas.width = Math.round(BASE_WIDTH * dpr);
  canvas.height = Math.round(BASE_HEIGHT * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
}

function resetRound(toMenu = true) {
  state.mode = toMenu ? "menu" : "playing";
  state.time = 0;
  state.timeLeft = 92;
  state.score = 0;
  state.sorted = 0;
  state.lives = 5;
  state.combo = 0;
  state.bestCombo = 0;
  state.beltOffset = 0;
  state.spawnTimer = 0.95;
  state.spawnEvery = SPAWN_INTERVAL_STAGES[0];
  state.patternIndex = 0;
  state.flash = 0;
  state.messageTimer = 0;
  state.message = "";
  state.crane.x = BASE_WIDTH / 2;
  state.crane.vx = 0;
  state.crane.holdId = null;
  state.crane.cableJitter = 0;
  state.selectedBin = 1;
  state.parcels = [];
  state.particles = [];
  pointer.x = BASE_WIDTH / 2;
  pointer.y = BASE_HEIGHT / 2;
  pointer.active = false;
  nextParcelId = 1;
}

function difficultyStageIndex() {
  return clamp(Math.floor(state.sorted / 3), 0, BELT_SPEED_STAGES.length - 1);
}

function currentBeltSpeed() {
  return BELT_SPEED_STAGES[difficultyStageIndex()];
}

function currentSpawnInterval() {
  return SPAWN_INTERVAL_STAGES[difficultyStageIndex()];
}

function startGame() {
  resetRound(false);
  state.lastUpdate = performance.now();
}

function togglePause() {
  if (state.mode === "playing") {
    state.mode = "paused";
  } else if (state.mode === "paused") {
    state.mode = "playing";
    state.lastUpdate = performance.now();
  }
}

function showMessage(text) {
  state.message = text;
  state.messageTimer = 0.75;
}

function spawnParticles(x, y, color, count, force = 1) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(50, 180) * force;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - rand(10, 90),
      life: rand(0.35, 0.9),
      maxLife: 1,
      size: rand(2, 5),
      color,
      rot: rand(0, Math.PI * 2),
      vr: rand(-6, 6),
    });
  }
}

function createParcel() {
  const type = PARCEL_PATTERN[state.patternIndex % PARCEL_PATTERN.length];
  state.patternIndex += 1;
  const speed = currentBeltSpeed();
  const id = nextParcelId++;
  return {
    id,
    type,
    x: -PARCEL_W - 32,
    y: BELT_Y + BELT_H / 2,
    w: PARCEL_W,
    h: PARCEL_H,
    vx: speed,
    bob: (id * Math.PI) / 7,
    rot: ((id % 7) - 3) * 0.01,
    grabbed: false,
    scored: false,
  };
}

function getHeldParcel() {
  return state.parcels.find((parcel) => parcel.id === state.crane.holdId) || null;
}

function previewParcelTypes(count = 4) {
  const next = [];
  for (let i = 0; i < count; i++) {
    next.push(PARCEL_PATTERN[(state.patternIndex + i) % PARCEL_PATTERN.length]);
  }
  return next;
}

function cycleBin(dir) {
  state.selectedBin = (state.selectedBin + dir + BINS.length) % BINS.length;
}

function updateCrane(dt) {
  let move = 0;
  if (keys.has("ArrowLeft")) move -= 1;
  if (keys.has("ArrowRight")) move += 1;

  const maxSpeed = 480;
  if (move !== 0) {
    state.crane.vx = move * maxSpeed;
  } else {
    if (pointer.active) {
      const diff = pointer.x - state.crane.x;
      if (Math.abs(diff) < 5) {
        state.crane.vx = 0;
      } else {
        state.crane.vx = clamp(diff * 8, -maxSpeed, maxSpeed);
      }
    } else {
      state.crane.vx *= Math.pow(0.12, dt * 7);
    }
  }

  state.crane.x = clamp(state.crane.x + state.crane.vx * dt, 64, BASE_WIDTH - 64);
  state.crane.cableJitter += dt * (Math.abs(state.crane.vx) > 20 ? 10 : 4);
}

function updateParcels(dt) {
  for (let i = state.parcels.length - 1; i >= 0; i--) {
    const parcel = state.parcels[i];
    parcel.bob += dt * 4;

    if (parcel.grabbed) {
      parcel.x = state.crane.x;
      parcel.y = 256 + Math.sin(state.time * 8 + parcel.id) * 4;
      parcel.rot = Math.sin(state.time * 6 + parcel.id) * 0.05;
      continue;
    }

    parcel.x += parcel.vx * dt;
    parcel.y = BELT_Y + BELT_H / 2 + Math.sin(parcel.bob) * 2;

    if (parcel.x - parcel.w / 2 > BASE_WIDTH + 12) {
      state.parcels.splice(i, 1);
      if (!parcel.scored) {
        state.lives -= 1;
        state.combo = 0;
        state.flash = 0.24;
        showMessage("Missed parcel");
        spawnParticles(BASE_WIDTH - 18, BELT_Y + BELT_H / 2, "#ef5d4a", 12, 0.8);
      }
    }
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    p.vy += 180 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

function spawnLoop(dt) {
  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) {
    return;
  }

  const activeOnBelt = state.parcels.filter((p) => !p.grabbed).length;
  if (activeOnBelt >= MAX_ON_BELT) {
    state.spawnTimer = 0.22;
    return;
  }

  state.parcels.push(createParcel());
  state.spawnEvery = currentSpawnInterval();
  state.spawnTimer = state.spawnEvery;
}

function update(dt) {
  if (state.mode !== "playing") return;

  state.time += dt;
  state.timeLeft = Math.max(0, state.timeLeft - dt);
  state.flash = Math.max(0, state.flash - dt);
  state.messageTimer = Math.max(0, state.messageTimer - dt);
  state.beltOffset = (state.beltOffset + currentBeltSpeed() * dt) % 48;

  updateCrane(dt);
  spawnLoop(dt);
  updateParcels(dt);
  updateParticles(dt);

  if (state.lives <= 0) {
    state.mode = "lost";
    showMessage("Warehouse jammed");
  } else if (state.sorted >= state.goal) {
    state.mode = "won";
    showMessage("Shift cleared");
    spawnParticles(BASE_WIDTH / 2, 150, "#4fa7ff", 40, 1.4);
    spawnParticles(BASE_WIDTH / 2, 150, "#f6a23c", 40, 1.4);
  } else if (state.timeLeft <= 0) {
    state.mode = "lost";
    showMessage("Shift ended");
  }
}

function parcelUnderCrane() {
  let best = null;
  let bestDist = Infinity;
  for (const parcel of state.parcels) {
    if (parcel.grabbed) continue;
    const dx = Math.abs(parcel.x - state.crane.x);
    const dy = Math.abs(parcel.y - (BELT_Y + BELT_H / 2));
    if (dx < PICKUP_RADIUS_X && dy < PICKUP_RADIUS_Y && dx < bestDist) {
      best = parcel;
      bestDist = dx;
    }
  }
  return best;
}

function grabParcel() {
  if (state.crane.holdId != null) return false;
  const parcel = parcelUnderCrane();
  if (!parcel) {
    showMessage("No parcel in reach");
    return false;
  }
  parcel.grabbed = true;
  state.crane.holdId = parcel.id;
  showMessage(`Picked ${TYPE_LABELS[parcel.type]}`);
  return true;
}

function selectedBinFromPoint(x, y) {
  for (let i = 0; i < BINS.length; i++) {
    const bin = BINS[i];
    if (x >= bin.x && x <= bin.x + bin.w && y >= bin.y && y <= bin.y + bin.h) {
      return i;
    }
  }
  return null;
}

function resolveDrop(binIndex) {
  const parcel = getHeldParcel();
  if (!parcel) {
    state.crane.holdId = null;
    return false;
  }

  const bin = BINS[binIndex];
  const correct = parcel.type === bin.type;
  const idx = state.parcels.findIndex((p) => p.id === parcel.id);
  if (idx >= 0) {
    state.parcels.splice(idx, 1);
  }
  state.crane.holdId = null;

  if (correct) {
    state.combo += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.sorted += 1;
    state.score += 100 + (state.combo - 1) * 20;
    state.flash = 0.14;
    showMessage(`${bin.label} sorted x${state.combo}`);
    spawnParticles(bin.x + bin.w / 2, bin.y + bin.h / 2, bin.color, 18, 1.05);
  } else {
    state.lives -= 1;
    state.combo = 0;
    state.score = Math.max(0, state.score - 15);
    state.flash = 0.24;
    showMessage(`Wrong bin for ${TYPE_LABELS[parcel.type]}`);
    spawnParticles(bin.x + bin.w / 2, bin.y + bin.h / 2, "#ef5d4a", 14, 0.9);
  }

  return true;
}

function attemptAction(preferredBin = null) {
  if (state.mode === "menu" || state.mode === "won" || state.mode === "lost") {
    startGame();
    return;
  }
  if (state.mode === "paused") {
    togglePause();
    return;
  }
  if (state.mode !== "playing") return;

  if (state.crane.holdId == null) {
    grabParcel();
    return;
  }

  let binIndex = preferredBin;
  if (binIndex == null && pointer.active) {
    binIndex = selectedBinFromPoint(pointer.x, pointer.y);
    if (binIndex != null) state.selectedBin = binIndex;
  }
  if (binIndex == null) binIndex = state.selectedBin;

  resolveDrop(binIndex);
}

function drawRoundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSticker(type, x, y, size, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = TYPE_COLORS[type];
  ctx.strokeStyle = "rgba(28, 22, 14, 0.22)";
  ctx.lineWidth = 1.4;

  if (type === 0) {
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (type === 1) {
    drawRoundedRect(-size * 1.1, -size * 0.75, size * 2.2, size * 1.5, size * 0.45);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.moveTo(-size * 0.7, -size * 0.15);
    ctx.quadraticCurveTo(0, -size * 0.55, size * 0.7, -size * 0.15);
    ctx.moveTo(-size * 0.7, size * 0.2);
    ctx.quadraticCurveTo(0, -size * 0.2, size * 0.7, size * 0.2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.05);
    ctx.lineTo(size * 0.95, size * 0.95);
    ctx.lineTo(-size * 0.95, size * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawPaperBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, BASE_HEIGHT);
  grad.addColorStop(0, "#faf5ea");
  grad.addColorStop(1, "#efe5d4");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  ctx.fillStyle = "rgba(120, 90, 55, 0.03)";
  for (const speck of dustSpecks) {
    ctx.globalAlpha = speck.a;
    ctx.beginPath();
    ctx.arc(speck.x, speck.y, speck.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(60, 45, 27, 0.06)";
  ctx.lineWidth = 1;
  for (let y = 0; y < BASE_HEIGHT; y += 36) {
    ctx.beginPath();
    ctx.moveTo(0, y + (y % 72 === 0 ? 2 : 0));
    ctx.lineTo(BASE_WIDTH, y);
    ctx.stroke();
  }
}

function drawBins() {
  ctx.save();
  ctx.font = "700 14px Space Grotesk";
  ctx.textAlign = "center";
  for (let i = 0; i < BINS.length; i++) {
    const bin = BINS[i];
    const active = i === state.selectedBin;
    const shadowOffset = active ? 8 : 4;

    ctx.fillStyle = active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.82)";
    ctx.shadowColor = active ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.06)";
    ctx.shadowBlur = active ? 18 : 10;
    ctx.shadowOffsetY = shadowOffset;
    drawRoundedRect(bin.x, bin.y, bin.w, bin.h, 16);
    ctx.fill();
    ctx.shadowColor = "transparent";

    ctx.fillStyle = active ? `${bin.color}18` : "rgba(255,255,255,0)";
    drawRoundedRect(bin.x + 4, bin.y + 4, bin.w - 8, bin.h - 8, 14);
    ctx.fill();

    ctx.lineWidth = active ? 3 : 1.6;
    ctx.strokeStyle = active ? bin.color : "rgba(60, 46, 28, 0.18)";
    drawRoundedRect(bin.x, bin.y, bin.w, bin.h, 16);
    ctx.stroke();

    ctx.fillStyle = active ? "rgba(28, 21, 13, 0.95)" : "rgba(28, 21, 13, 0.85)";
    ctx.fillText(bin.label, bin.x + bin.w / 2, bin.y + 28);
    drawSticker(bin.type, bin.x + 38, bin.y + 54, 12, active ? 1 : 0.9);

    ctx.fillStyle = "rgba(60, 45, 25, 0.55)";
    ctx.font = "500 11px Space Grotesk";
    ctx.textAlign = "left";
    ctx.fillText(active ? "Selected bin" : "Drop zone", bin.x + 62, bin.y + 58);
    ctx.font = "700 14px Space Grotesk";
    ctx.textAlign = "center";

    ctx.fillStyle = "rgba(40, 34, 26, 0.08)";
    drawRoundedRect(bin.x + 18, bin.y + 66, bin.w - 36, 24, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(40, 34, 26, 0.08)";
    ctx.stroke();
  }
  ctx.restore();
}

function drawRailAndCrane() {
  ctx.save();
  ctx.fillStyle = "#2c3a4b";
  drawRoundedRect(70, RAIL_Y - 18, BASE_WIDTH - 140, 14, 7);
  ctx.fill();
  ctx.fillStyle = "#40546d";
  drawRoundedRect(70, RAIL_Y - 8, BASE_WIDTH - 140, 8, 4);
  ctx.fill();

  const trolleyX = state.crane.x - 28;
  ctx.fillStyle = "#1e2937";
  drawRoundedRect(trolleyX, RAIL_Y - 30, 56, 28, 10);
  ctx.fill();
  ctx.fillStyle = "#5c6f89";
  drawRoundedRect(trolleyX + 8, RAIL_Y - 24, 40, 10, 5);
  ctx.fill();

  const cableX = state.crane.x + Math.sin(state.crane.cableJitter) * 1.8;
  ctx.strokeStyle = "rgba(22, 23, 27, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cableX, RAIL_Y - 4);
  ctx.lineTo(cableX, 236);
  ctx.stroke();

  ctx.fillStyle = "#263242";
  drawRoundedRect(cableX - 24, 236, 48, 16, 7);
  ctx.fill();

  ctx.strokeStyle = "#f6a23c";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cableX - 12, 252);
  ctx.lineTo(cableX - 6, 268);
  ctx.moveTo(cableX + 12, 252);
  ctx.lineTo(cableX + 6, 268);
  ctx.stroke();

  ctx.strokeStyle = "rgba(33, 40, 51, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(56, 275);
  ctx.lineTo(BASE_WIDTH - 56, 275);
  ctx.stroke();
  ctx.restore();
}

function drawConveyor() {
  ctx.save();
  ctx.fillStyle = "rgba(32, 24, 16, 0.08)";
  ctx.beginPath();
  ctx.ellipse(BASE_WIDTH / 2, BELT_Y + BELT_H + 16, 380, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2b2f39";
  drawRoundedRect(48, BELT_Y, BASE_WIDTH - 96, BELT_H, 22);
  ctx.fill();

  ctx.fillStyle = "#3d4452";
  drawRoundedRect(60, BELT_Y + 14, BASE_WIDTH - 120, BELT_H - 28, 18);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  drawRoundedRect(60, BELT_Y + 14, BASE_WIDTH - 120, BELT_H - 28, 18);
  ctx.clip();
  for (let x = -64; x < BASE_WIDTH + 64; x += 48) {
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(x + state.beltOffset, BELT_Y + 16, 20, BELT_H - 32);
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(x + 20 + state.beltOffset, BELT_Y + 16, 10, BELT_H - 32);
  }

  for (let x = 88; x < BASE_WIDTH - 80; x += 120) {
    const arrowX = ((x + state.beltOffset * 0.9) % (BASE_WIDTH + 70)) - 35;
    const cy = BELT_Y + BELT_H / 2;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(arrowX - 10, cy - 8);
    ctx.lineTo(arrowX + 6, cy);
    ctx.lineTo(arrowX - 10, cy + 8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  for (let i = 0; i < 10; i++) {
    const cx = 96 + i * 86;
    ctx.fillStyle = "#6f7888";
    ctx.beginPath();
    ctx.arc(cx, BELT_Y + BELT_H / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1e2430";
    ctx.beginPath();
    ctx.arc(cx, BELT_Y + BELT_H / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPickupGuide() {
  if (state.mode !== "playing") return;
  const holding = state.crane.holdId != null;
  const y = BELT_Y + BELT_H / 2;

  ctx.save();
  ctx.strokeStyle = holding ? "rgba(79,167,255,0.55)" : "rgba(246,162,60,0.45)";
  ctx.fillStyle = holding ? "rgba(79,167,255,0.08)" : "rgba(246,162,60,0.08)";
  ctx.lineWidth = 2;
  drawRoundedRect(state.crane.x - 44, y - 22, 88, 44, 12);
  ctx.fill();
  ctx.stroke();

  if (holding) {
    const bin = BINS[state.selectedBin];
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "rgba(79,167,255,0.45)";
    ctx.beginPath();
    ctx.moveTo(state.crane.x, 274);
    ctx.lineTo(bin.x + bin.w / 2, bin.y + bin.h + 4);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawParcel(parcel) {
  ctx.save();
  ctx.translate(parcel.x, parcel.y);
  ctx.rotate(parcel.rot);

  ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
  ctx.beginPath();
  ctx.ellipse(0, 18, parcel.w * 0.38, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#d89f62";
  drawRoundedRect(-parcel.w / 2, -parcel.h / 2, parcel.w, parcel.h, 10);
  ctx.fill();

  ctx.fillStyle = "#e6ba86";
  drawRoundedRect(-parcel.w / 2 + 4, -parcel.h / 2 + 4, parcel.w - 8, parcel.h - 8, 8);
  ctx.fill();

  ctx.fillStyle = "#c8874e";
  ctx.fillRect(-4, -parcel.h / 2 + 2, 8, parcel.h - 4);
  ctx.fillRect(-parcel.w / 2 + 2, -3, parcel.w - 4, 6);

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  drawRoundedRect(-parcel.w / 2 + 8, -parcel.h / 2 + 8, 24, 18, 5);
  ctx.fill();
  drawSticker(parcel.type, -parcel.w / 2 + 20, -parcel.h / 2 + 17, 6.2);

  ctx.restore();
}

function drawParcels() {
  for (const parcel of state.parcels) {
    drawParcel(parcel);
  }
}

function drawParticles() {
  ctx.save();
  for (const p of state.particles) {
    const alpha = clamp(p.life, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.rotate(-p.rot);
    ctx.translate(-p.x, -p.y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawHud() {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.shadowColor = "rgba(0,0,0,0.08)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  drawRoundedRect(34, 22, 310, 108, 16);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(35, 29, 21, 0.12)";
  ctx.lineWidth = 1.4;
  drawRoundedRect(34, 22, 310, 108, 16);
  ctx.stroke();

  ctx.fillStyle = "#211b14";
  ctx.font = "700 14px Space Grotesk";
  ctx.fillText("DAY 3 • PARCEL SORT SPRINT", 52, 48);

  ctx.font = "500 13px Space Grotesk";
  ctx.fillStyle = "rgba(33,27,20,0.78)";
  ctx.fillText(`Sorted ${state.sorted}/${state.goal}`, 52, 74);
  ctx.fillText(`Score ${state.score}`, 170, 74);
  ctx.fillText(`Lives ${state.lives}`, 264, 74);

  ctx.fillText(`Time ${Math.ceil(state.timeLeft)}s`, 52, 98);
  ctx.fillText(`Combo x${state.combo}`, 170, 98);
  ctx.fillText(`Best x${state.bestCombo}`, 264, 98);

  const progress = state.sorted / state.goal;
  ctx.fillStyle = "rgba(37, 31, 23, 0.08)";
  drawRoundedRect(52, 108, 274, 10, 5);
  ctx.fill();
  const barW = 274 * clamp(progress, 0, 1);
  const barGrad = ctx.createLinearGradient(52, 0, 326, 0);
  barGrad.addColorStop(0, "#f6a23c");
  barGrad.addColorStop(1, "#4fa7ff");
  ctx.fillStyle = barGrad;
  drawRoundedRect(52, 108, barW, 10, 5);
  ctx.fill();

  ctx.fillStyle = "rgba(33,27,20,0.65)";
  ctx.font = "500 12px Space Grotesk";
  ctx.fillText("Move: arrows / mouse • Pick/Drop: Space / click • Bin: 1/2/3 or Q/E", 370, 38);
  ctx.fillText(`Conveyor -> ${Math.round(currentBeltSpeed())} px/s • Queue cap ${MAX_ON_BELT} • Pause: P • Restart: R • Fullscreen: F`, 370, 58);

  if (state.messageTimer > 0) {
    const alpha = Math.min(1, state.messageTimer / 0.4);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    drawRoundedRect(370, 76, 250, 42, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(33,27,20,0.1)";
    drawRoundedRect(370, 76, 250, 42, 12);
    ctx.stroke();
    ctx.fillStyle = "#211b14";
    ctx.font = "700 14px Space Grotesk";
    ctx.fillText(state.message, 386, 102);
    ctx.globalAlpha = 1;
  }

  const preview = previewParcelTypes(5);
  ctx.fillStyle = "rgba(33,27,20,0.6)";
  ctx.font = "700 11px Space Grotesk";
  ctx.fillText("NEXT", 634, 102);
  for (let i = 0; i < preview.length; i++) {
    const px = 672 + i * 38;
    drawRoundedRect(px - 14, 85, 28, 28, 8);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
    ctx.strokeStyle = "rgba(33,27,20,0.1)";
    ctx.stroke();
    drawSticker(preview[i], px, 99, 6.5);
  }

  ctx.restore();
}

function drawBinSelectionArrows() {
  ctx.save();
  const bin = BINS[state.selectedBin];
  const y = bin.y + bin.h + 12;
  ctx.textAlign = "center";
  ctx.font = "700 12px Space Grotesk";
  ctx.fillStyle = "rgba(33,27,20,0.55)";
  ctx.fillText("Q", bin.x + 18, y);
  ctx.fillText("E", bin.x + bin.w - 18, y);
  ctx.strokeStyle = "rgba(33,27,20,0.25)";
  ctx.beginPath();
  ctx.moveTo(bin.x + 28, y - 4);
  ctx.lineTo(bin.x + 60, y - 4);
  ctx.moveTo(bin.x + bin.w - 28, y - 4);
  ctx.lineTo(bin.x + bin.w - 60, y - 4);
  ctx.stroke();
  ctx.restore();
}

function drawOverlay() {
  if (state.mode === "playing") return;

  ctx.save();
  ctx.fillStyle = state.mode === "menu" ? "rgba(248, 242, 231, 0.84)" : "rgba(245, 238, 225, 0.88)";
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.shadowColor = "rgba(0,0,0,0.08)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  drawRoundedRect(180, 120, 600, 290, 24);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(33,27,20,0.12)";
  ctx.lineWidth = 1.5;
  drawRoundedRect(180, 120, 600, 290, 24);
  ctx.stroke();

  let title = "Parcel Sort Sprint";
  let subtitle = "Run the crane and keep the conveyor flowing.";
  if (state.mode === "paused") {
    title = "Paused";
    subtitle = "Press P or Space to resume the shift.";
  } else if (state.mode === "won") {
    title = "Shift Cleared";
    subtitle = `Sorted ${state.sorted} parcels with score ${state.score}.`;
  } else if (state.mode === "lost") {
    title = "Warehouse Jam";
    subtitle = `Sorted ${state.sorted}/${state.goal}. Pattern resets each run for deterministic retries.`;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#201912";
  ctx.font = "700 40px Space Grotesk";
  ctx.fillText(title, BASE_WIDTH / 2, 186);
  ctx.font = "500 18px Space Grotesk";
  ctx.fillStyle = "rgba(32,25,18,0.72)";
  ctx.fillText(subtitle, BASE_WIDTH / 2, 220);

  ctx.font = "500 15px Space Grotesk";
  ctx.fillStyle = "rgba(32,25,18,0.8)";
  ctx.fillText("Arrow keys or mouse move the crane. Use 1/2/3 or Q/E to pick a bin.", BASE_WIDTH / 2, 275);
  ctx.fillText("Space or click picks a box, then drops it into the selected bin.", BASE_WIDTH / 2, 302);
  ctx.fillText(`Sort ${state.goal} parcels before time runs out. Misses and wrong bins cost lives.`, BASE_WIDTH / 2, 329);

  ctx.fillStyle = "#f6a23c";
  drawRoundedRect(355, 350, 250, 34, 12);
  ctx.fill();
  ctx.fillStyle = "#1e1710";
  ctx.font = "700 14px Space Grotesk";
  ctx.fillText(state.mode === "menu" ? "PRESS SPACE OR CLICK TO START" : "PRESS SPACE OR CLICK", BASE_WIDTH / 2, 373);

  ctx.restore();
}

function drawFlash() {
  if (state.flash <= 0) return;
  ctx.save();
  ctx.globalAlpha = state.flash * 0.75;
  ctx.fillStyle = state.lives > 0 ? "#fff6d8" : "#ffd7d2";
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  ctx.restore();
}

function render() {
  drawPaperBackground();
  drawBins();
  drawRailAndCrane();
  drawConveyor();
  drawPickupGuide();
  drawParcels();
  drawParticles();
  drawBinSelectionArrows();
  drawHud();
  drawFlash();
  drawOverlay();
}

function step(dt) {
  update(dt);
  render();
}

function loop(now) {
  const dt = Math.min(0.05, (now - state.lastUpdate) / 1000);
  state.lastUpdate = now;
  step(dt);
  requestAnimationFrame(loop);
}

function toCanvasCoords(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = BASE_WIDTH / rect.width;
  const scaleY = BASE_HEIGHT / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

canvas.addEventListener("pointermove", (event) => {
  const pos = toCanvasCoords(event);
  pointer.active = true;
  pointer.x = pos.x;
  pointer.y = pos.y;
  const binIndex = selectedBinFromPoint(pos.x, pos.y);
  if (binIndex != null) {
    state.selectedBin = binIndex;
  }
});

canvas.addEventListener("pointerleave", () => {
  pointer.active = false;
});

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  const pos = toCanvasCoords(event);
  pointer.active = true;
  pointer.x = pos.x;
  pointer.y = pos.y;
  const binIndex = selectedBinFromPoint(pos.x, pos.y);
  attemptAction(binIndex);
});

canvas.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("keydown", (event) => {
  const code = event.code;
  if (["ArrowLeft", "ArrowRight", "Space", "Enter", "Digit1", "Digit2", "Digit3"].includes(code)) {
    event.preventDefault();
  }

  keys.add(code);

  if (event.repeat) return;

  if (code === "Digit1") {
    state.selectedBin = 0;
  } else if (code === "Digit2") {
    state.selectedBin = 1;
  } else if (code === "Digit3") {
    state.selectedBin = 2;
  } else if (code === "KeyQ" || code === "KeyA" || code === "ArrowUp") {
    cycleBin(-1);
  } else if (code === "KeyE" || code === "KeyB" || code === "ArrowDown") {
    cycleBin(1);
  } else if (code === "Space" || code === "Enter") {
    attemptAction();
  } else if (code === "KeyP") {
    togglePause();
  } else if (code === "KeyR") {
    resetRound(true);
  } else if (code === "KeyF") {
    if (!document.fullscreenElement) {
      canvas.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("blur", () => {
  keys.clear();
});

window.addEventListener("resize", () => {
  configureCanvas();
});

function renderGameToText() {
  const held = getHeldParcel();
  const payload = {
    mode: state.mode,
    coord: "origin top-left, x right, y down",
    timeLeft: Number(state.timeLeft.toFixed(1)),
    score: state.score,
    sorted: state.sorted,
    goal: state.goal,
    lives: state.lives,
    combo: state.combo,
    selectedBin: {
      index: state.selectedBin,
      label: BINS[state.selectedBin].label,
      type: BINS[state.selectedBin].type,
    },
    crane: {
      x: Number(state.crane.x.toFixed(1)),
      holding: held
        ? {
            id: held.id,
            type: held.type,
            label: TYPE_LABELS[held.type],
          }
        : null,
    },
    parcels: state.parcels.map((parcel) => ({
      id: parcel.id,
      type: parcel.type,
      label: TYPE_LABELS[parcel.type],
      x: Number(parcel.x.toFixed(1)),
      y: Number(parcel.y.toFixed(1)),
      grabbed: parcel.grabbed,
    })),
    nextSpawnIn: Number(Math.max(0, state.spawnTimer).toFixed(2)),
    beltSpeed: currentBeltSpeed(),
    nextTypes: previewParcelTypes(5).map((type) => TYPE_LABELS[type]),
  };
  return JSON.stringify(payload);
}

window.render_game_to_text = renderGameToText;
window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) {
    step(1 / 60);
  }
};

resetRound(true);
configureCanvas();
requestAnimationFrame(loop);
