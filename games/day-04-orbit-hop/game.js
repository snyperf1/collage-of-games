const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const BASE_WIDTH = 960;
const BASE_HEIGHT = 540;
const CENTER = { x: BASE_WIDTH / 2, y: BASE_HEIGHT / 2 };
const RINGS = [90, 140, 190, 240];
const MAX_TIME = 70;
const GOAL = 12;

const keys = new Set();
const pointer = {
  x: CENTER.x,
  y: CENTER.y,
  down: false,
  actionQueued: 0,
};

const state = {
  mode: "menu",
  time: 0,
  timeLeft: MAX_TIME,
  score: 0,
  lives: 3,
  ringIndex: 1,
  angle: -Math.PI / 2,
  hop: null,
  invuln: 0,
  comets: [],
  beacons: [],
  particles: [],
  spawnTimer: 0,
  cometTimer: 0,
  lastUpdate: performance.now(),
  seed: 92481,
};

const starfield = Array.from({ length: 110 }, () => ({
  x: Math.random() * BASE_WIDTH,
  y: Math.random() * BASE_HEIGHT,
  r: 0.6 + Math.random() * 1.2,
  a: 0.2 + Math.random() * 0.7,
}));

const rng = (() => {
  let seed = state.seed;
  return {
    next() {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      seed >>>= 0;
      return seed / 4294967295;
    },
    range(min, max) {
      return min + (max - min) * this.next();
    },
    reset(newSeed) {
      seed = newSeed >>> 0;
    },
  };
})();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function angleDiff(a, b) {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = BASE_WIDTH * dpr;
  canvas.height = BASE_HEIGHT * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resetRound(toMenu = true) {
  state.mode = toMenu ? "menu" : "playing";
  state.time = 0;
  state.timeLeft = MAX_TIME;
  state.score = 0;
  state.lives = 3;
  state.ringIndex = 1;
  state.angle = -Math.PI / 2;
  state.hop = null;
  state.invuln = 0;
  state.beacons = [];
  state.comets = [];
  state.particles = [];
  state.spawnTimer = 0.2;
  state.cometTimer = 1.8;
  state.seed = 92481;
  rng.reset(state.seed);
  pointer.actionQueued = 0;
  for (let i = 0; i < 3; i++) spawnBeacon();
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

function setMode(mode) {
  state.mode = mode;
}

function spawnBeacon() {
  let ringIndex = Math.floor(rng.range(0, RINGS.length));
  let angle = rng.range(0, Math.PI * 2);
  for (let tries = 0; tries < 10; tries++) {
    ringIndex = Math.floor(rng.range(0, RINGS.length));
    angle = rng.range(0, Math.PI * 2);
    const nearPlayer =
      ringIndex === state.ringIndex && Math.abs(angleDiff(angle, state.angle)) < 0.4;
    const tooClose = state.beacons.some(
      (b) => b.ringIndex === ringIndex && Math.abs(angleDiff(b.angle, angle)) < 0.35
    );
    if (!nearPlayer && !tooClose) break;
  }
  state.beacons.push({
    ringIndex,
    angle,
    pulse: rng.range(0, Math.PI * 2),
  });
}

function spawnComet() {
  state.comets.push({
    angle: rng.range(0, Math.PI * 2),
    radius: RINGS[RINGS.length - 1] + 120,
    speed: rng.range(130, 190),
  });
}

function queueHop(dir) {
  if (state.mode !== "playing") return;
  if (state.hop) return;
  const target = clamp(state.ringIndex + dir, 0, RINGS.length - 1);
  if (target === state.ringIndex) return;
  state.hop = {
    from: state.ringIndex,
    to: target,
    t: 0,
    duration: 0.2,
  };
}

function handlePointerAction(event) {
  if (state.mode === "menu") {
    startGame();
    return;
  }
  if (state.mode === "win" || state.mode === "lose") {
    resetRound(true);
    return;
  }
  if (state.mode !== "playing") return;

  let dir = 1;
  if (event.button === 2) {
    dir = -1;
  } else {
    dir = pointer.x < CENTER.x ? -1 : 1;
  }
  queueHop(dir);
}

function updatePlayer(dt) {
  const baseSpeed = 1.2;
  const ringBoost = state.ringIndex * 0.2;
  state.angle += (baseSpeed + ringBoost) * dt;

  if (state.hop) {
    state.hop.t += dt / state.hop.duration;
    if (state.hop.t >= 1) {
      state.ringIndex = state.hop.to;
      state.hop = null;
    }
  }

  if (state.invuln > 0) state.invuln = Math.max(0, state.invuln - dt);
}

function updateBeacons(dt) {
  for (const beacon of state.beacons) {
    beacon.pulse += dt * 2;
  }
}

function updateComets(dt) {
  for (let i = state.comets.length - 1; i >= 0; i--) {
    const comet = state.comets[i];
    comet.radius -= comet.speed * dt;
    if (comet.radius < RINGS[0] - 80) {
      state.comets.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const particle = state.particles[i];
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 20 * dt;
    if (particle.life <= 0) state.particles.splice(i, 1);
  }
}

function spawnBurst(angle, radius, color) {
  const x = CENTER.x + Math.cos(angle) * radius;
  const y = CENTER.y + Math.sin(angle) * radius;
  for (let i = 0; i < 12; i++) {
    const theta = rng.range(0, Math.PI * 2);
    const speed = rng.range(50, 140);
    state.particles.push({
      x,
      y,
      vx: Math.cos(theta) * speed,
      vy: Math.sin(theta) * speed,
      life: rng.range(0.4, 0.9),
      color,
    });
  }
}

function checkCollisions() {
  const currentRadius = getPlayerRadius();
  const playerX = CENTER.x + Math.cos(state.angle) * currentRadius;
  const playerY = CENTER.y + Math.sin(state.angle) * currentRadius;

  for (let i = state.beacons.length - 1; i >= 0; i--) {
    const beacon = state.beacons[i];
    const beaconRadius = RINGS[beacon.ringIndex];
    const bx = CENTER.x + Math.cos(beacon.angle) * beaconRadius;
    const by = CENTER.y + Math.sin(beacon.angle) * beaconRadius;
    const dist = Math.hypot(playerX - bx, playerY - by);
    if (dist < 18) {
      state.beacons.splice(i, 1);
      state.score += 1;
      spawnBurst(beacon.angle, beaconRadius, "#8fffd4");
      spawnBeacon();
    }
  }

  if (state.invuln <= 0) {
    for (const comet of state.comets) {
      const cx = CENTER.x + Math.cos(comet.angle) * comet.radius;
      const cy = CENTER.y + Math.sin(comet.angle) * comet.radius;
      const dist = Math.hypot(playerX - cx, playerY - cy);
      if (dist < 20) {
        state.lives -= 1;
        state.invuln = 1.1;
        spawnBurst(comet.angle, comet.radius, "#ff9b7a");
        break;
      }
    }
  }
}

function getPlayerRadius() {
  if (!state.hop) return RINGS[state.ringIndex];
  const t = Math.min(1, state.hop.t);
  return lerp(RINGS[state.hop.from], RINGS[state.hop.to], t);
}

function update(dt) {
  if (state.mode !== "playing") return;

  state.time += dt;
  state.timeLeft -= dt;

  state.spawnTimer -= dt;
  state.cometTimer -= dt;

  if (state.spawnTimer <= 0) {
    state.spawnTimer = rng.range(1.2, 2.2);
    if (state.beacons.length < 4) spawnBeacon();
  }

  if (state.cometTimer <= 0) {
    state.cometTimer = rng.range(2.4, 3.4);
    spawnComet();
  }

  if (pointer.actionQueued !== 0) {
    queueHop(pointer.actionQueued);
    pointer.actionQueued = 0;
  }

  updatePlayer(dt);
  updateBeacons(dt);
  updateComets(dt);
  updateParticles(dt);
  checkCollisions();

  if (state.score >= GOAL) {
    setMode("win");
  }

  if (state.lives <= 0 || state.timeLeft <= 0) {
    setMode("lose");
  }
}

function drawBackground() {
  ctx.save();
  const gradient = ctx.createRadialGradient(
    CENTER.x,
    CENTER.y,
    40,
    CENTER.x,
    CENTER.y,
    420
  );
  gradient.addColorStop(0, "#111a3c");
  gradient.addColorStop(0.6, "#080c1c");
  gradient.addColorStop(1, "#04060d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  for (const star of starfield) {
    ctx.fillStyle = `rgba(200,220,255,${star.a})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRings() {
  ctx.save();
  ctx.strokeStyle = "rgba(150, 190, 255, 0.18)";
  ctx.lineWidth = 2;
  RINGS.forEach((r, index) => {
    ctx.beginPath();
    ctx.arc(CENTER.x, CENTER.y, r, 0, Math.PI * 2);
    ctx.stroke();
    if (index === state.ringIndex && state.mode === "playing") {
      ctx.strokeStyle = "rgba(140, 255, 214, 0.45)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(CENTER.x, CENTER.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(150, 190, 255, 0.18)";
      ctx.lineWidth = 2;
    }
  });
  ctx.restore();
}

function drawBeacons() {
  ctx.save();
  for (const beacon of state.beacons) {
    const r = RINGS[beacon.ringIndex];
    const x = CENTER.x + Math.cos(beacon.angle) * r;
    const y = CENTER.y + Math.sin(beacon.angle) * r;
    const pulse = 6 + Math.sin(beacon.pulse) * 2;
    ctx.fillStyle = "rgba(140, 255, 212, 0.9)";
    ctx.beginPath();
    ctx.arc(x, y, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(140, 255, 212, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, pulse + 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawComets() {
  ctx.save();
  for (const comet of state.comets) {
    const x = CENTER.x + Math.cos(comet.angle) * comet.radius;
    const y = CENTER.y + Math.sin(comet.angle) * comet.radius;
    const tailX = CENTER.x + Math.cos(comet.angle) * (comet.radius + 24);
    const tailY = CENTER.y + Math.sin(comet.angle) * (comet.radius + 24);
    ctx.strokeStyle = "rgba(255, 169, 115, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = "#ffb08a";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlayer() {
  const r = getPlayerRadius();
  const x = CENTER.x + Math.cos(state.angle) * r;
  const y = CENTER.y + Math.sin(state.angle) * r;
  ctx.save();
  const glow = state.invuln > 0 ? "rgba(255, 200, 140, 0.8)" : "rgba(120, 200, 255, 0.9)";
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (const particle of state.particles) {
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = clamp(particle.life, 0, 1);
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHud() {
  ctx.save();
  ctx.fillStyle = "rgba(10, 12, 26, 0.6)";
  ctx.fillRect(24, 22, 280, 64);
  ctx.strokeStyle = "rgba(150, 200, 255, 0.3)";
  ctx.strokeRect(24, 22, 280, 64);

  ctx.fillStyle = "#eaf0ff";
  ctx.font = "600 16px Sora";
  ctx.fillText(`Signals: ${state.score}/${GOAL}`, 40, 48);
  ctx.fillText(`Time: ${Math.ceil(state.timeLeft)}s`, 40, 72);

  ctx.textAlign = "right";
  ctx.fillText(`Shields: ${state.lives}`, 280, 48);
  ctx.textAlign = "left";
  ctx.restore();
}

function drawOverlay() {
  ctx.save();
  ctx.fillStyle = "rgba(6, 8, 16, 0.7)";
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  ctx.fillStyle = "#f0f4ff";
  ctx.textAlign = "center";
  ctx.font = "700 34px Sora";
  const title =
    state.mode === "menu"
      ? "Orbit Hop Relay"
      : state.mode === "paused"
      ? "Paused"
      : state.mode === "win"
      ? "Relay Complete"
      : "Orbit Lost";
  ctx.fillText(title, CENTER.x, CENTER.y - 40);

  ctx.font = "400 18px Sora";
  if (state.mode === "menu") {
    ctx.fillText("Click or tap to start the relay.", CENTER.x, CENTER.y + 4);
    ctx.fillText("Tap left/right side to hop rings. Right click to hop inward.", CENTER.x, CENTER.y + 32);
    ctx.fillText("Q/E also hop. Collect 12 signals before time runs out.", CENTER.x, CENTER.y + 60);
    ctx.fillText("Press F for fullscreen.", CENTER.x, CENTER.y + 88);
  } else if (state.mode === "paused") {
    ctx.fillText("Press P to resume.", CENTER.x, CENTER.y + 16);
  } else if (state.mode === "win") {
    ctx.fillText("Signal chain secured. Press R to play again.", CENTER.x, CENTER.y + 16);
  } else if (state.mode === "lose") {
    ctx.fillText("The orbit collapsed. Press R to try again.", CENTER.x, CENTER.y + 16);
  }

  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  drawBackground();
  drawRings();
  drawBeacons();
  drawComets();
  drawParticles();
  drawPlayer();
  drawHud();

  if (state.mode !== "playing") {
    drawOverlay();
  }
}

function tick(now) {
  const dt = Math.min(0.04, (now - state.lastUpdate) / 1000);
  state.lastUpdate = now;
  if (state.mode === "playing") update(dt);
  render();
  requestAnimationFrame(tick);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function handleKeyDown(event) {
  keys.add(event.code);
  if (event.code === "KeyF") toggleFullscreen();
  if (event.code === "KeyP") togglePause();
  if (event.code === "KeyR") resetRound(true);
  if (event.code === "Enter" && state.mode === "menu") startGame();
  if (event.code === "KeyQ") pointer.actionQueued = -1;
  if (event.code === "KeyE") pointer.actionQueued = 1;
}

function handleKeyUp(event) {
  keys.delete(event.code);
}

canvas.addEventListener("pointermove", (event) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * BASE_WIDTH;
  pointer.y = ((event.clientY - rect.top) / rect.height) * BASE_HEIGHT;
});

canvas.addEventListener("pointerdown", (event) => {
  pointer.down = true;
  handlePointerAction(event);
});

canvas.addEventListener("pointerup", () => {
  pointer.down = false;
});

canvas.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("resize", resizeCanvas);
window.addEventListener("fullscreenchange", () => {
  document.body.classList.toggle("fullscreen", !!document.fullscreenElement);
  resizeCanvas();
});

window.render_game_to_text = () => {
  const playerRadius = getPlayerRadius();
  const playerPos = {
    x: CENTER.x + Math.cos(state.angle) * playerRadius,
    y: CENTER.y + Math.sin(state.angle) * playerRadius,
    r: 10,
  };
  return JSON.stringify({
    mode: state.mode,
    score: state.score,
    goal: GOAL,
    timeLeft: Number(state.timeLeft.toFixed(2)),
    lives: state.lives,
    player: {
      ringIndex: state.ringIndex,
      angle: Number(state.angle.toFixed(3)),
      position: playerPos,
    },
    beacons: state.beacons.map((b) => ({
      ringIndex: b.ringIndex,
      angle: Number(b.angle.toFixed(3)),
    })),
    comets: state.comets.map((c) => ({
      angle: Number(c.angle.toFixed(3)),
      radius: Number(c.radius.toFixed(1)),
    })),
    coordinateSystem: "origin at top-left, center at (480,270), +x right, +y down, angles in radians",
  });
};

window.advanceTime = (ms) => {
  const step = 1 / 60;
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) {
    if (state.mode === "playing") update(step);
    render();
  }
};

resizeCanvas();
resetRound(true);
requestAnimationFrame(tick);
