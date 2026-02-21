const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const BASE_WIDTH = 960;
const BASE_HEIGHT = 540;
const ORCHARD_ROWS = 6;
const ORCHARD_COLS = 8;

const state = {
  mode: "menu",
  timeLeft: 90,
  score: 0,
  goal: 10,
  lives: 3,
  pulseCooldown: 0,
  pulseActive: 0,
  invincible: 0,
  player: {
    x: BASE_WIDTH / 2,
    y: BASE_HEIGHT / 2,
    r: 16,
    speed: 180,
  },
  pests: [],
  fruits: [],
  pulses: [],
  lastUpdate: performance.now(),
};

const keys = new Set();
let scale = 1;
let offsetX = 0;
let offsetY = 0;

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resetGame() {
  state.mode = "menu";
  state.timeLeft = 90;
  state.score = 0;
  state.lives = 3;
  state.pulseCooldown = 0;
  state.pulseActive = 0;
  state.invincible = 0;
  state.player.x = BASE_WIDTH / 2;
  state.player.y = BASE_HEIGHT / 2 + 40;
  state.pests = Array.from({ length: 5 }, () => createPest());
  state.fruits = Array.from({ length: 12 }, () => createFruit());
  state.pulses = [];
}

function startGame() {
  if (state.mode === "playing") return;
  state.mode = "playing";
  state.lastUpdate = performance.now();
}

function createFruit() {
  return {
    x: rand(80, BASE_WIDTH - 80),
    y: rand(80, BASE_HEIGHT - 80),
    r: 12,
    collected: false,
    shimmer: rand(0, Math.PI * 2),
  };
}

function createPest() {
  const angle = rand(0, Math.PI * 2);
  return {
    x: rand(120, BASE_WIDTH - 120),
    y: rand(100, BASE_HEIGHT - 100),
    r: 18,
    vx: Math.cos(angle) * rand(40, 70),
    vy: Math.sin(angle) * rand(40, 70),
    stunned: 0,
  };
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function resize() {
  const { innerWidth: width, innerHeight: height } = window;
  const scaleX = width / BASE_WIDTH;
  const scaleY = height / BASE_HEIGHT;
  scale = Math.min(scaleX, scaleY);
  offsetX = (width - BASE_WIDTH * scale) * 0.5;
  offsetY = (height - BASE_HEIGHT * scale) * 0.5;
}

function firePulse() {
  if (state.pulseCooldown > 0 || state.mode !== "playing") return;
  state.pulseCooldown = 3;
  state.pulseActive = 0.5;
  state.pulses.push({ x: state.player.x, y: state.player.y, r: 0, maxR: 140 });
  state.pests.forEach((pest) => {
    const dist = Math.hypot(pest.x - state.player.x, pest.y - state.player.y);
    if (dist <= 140) {
      pest.stunned = 1.5;
      pest.vx *= 0.3;
      pest.vy *= 0.3;
    }
  });
}

function updatePlayer(dt) {
  const moveX =
    (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) -
    (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
  const moveY =
    (keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0) -
    (keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0);

  const sprinting = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const speed = state.player.speed + (sprinting ? 90 : 0);
  const magnitude = Math.hypot(moveX, moveY) || 1;
  const dx = (moveX / magnitude) * speed * dt;
  const dy = (moveY / magnitude) * speed * dt;

  state.player.x = clamp(state.player.x + dx, 40, BASE_WIDTH - 40);
  state.player.y = clamp(state.player.y + dy, 40, BASE_HEIGHT - 40);
}

function updatePests(dt) {
  state.pests.forEach((pest) => {
    if (pest.stunned > 0) {
      pest.stunned = Math.max(0, pest.stunned - dt);
      return;
    }

    const distToPlayer = Math.hypot(state.player.x - pest.x, state.player.y - pest.y);
    if (distToPlayer < 200) {
      const angle = Math.atan2(state.player.y - pest.y, state.player.x - pest.x);
      pest.vx += Math.cos(angle) * 20 * dt;
      pest.vy += Math.sin(angle) * 20 * dt;
    } else if (Math.random() < 0.02) {
      const angle = rand(0, Math.PI * 2);
      pest.vx += Math.cos(angle) * 30 * dt;
      pest.vy += Math.sin(angle) * 30 * dt;
    }

    const speed = Math.hypot(pest.vx, pest.vy);
    const maxSpeed = 110;
    if (speed > maxSpeed) {
      pest.vx = (pest.vx / speed) * maxSpeed;
      pest.vy = (pest.vy / speed) * maxSpeed;
    }

    pest.x += pest.vx * dt;
    pest.y += pest.vy * dt;

    if (pest.x < 60 || pest.x > BASE_WIDTH - 60) pest.vx *= -1;
    if (pest.y < 60 || pest.y > BASE_HEIGHT - 60) pest.vy *= -1;
  });
}

function updateFruits() {
  state.fruits.forEach((fruit) => {
    if (fruit.collected) return;
    const dist = Math.hypot(state.player.x - fruit.x, state.player.y - fruit.y);
    if (dist < state.player.r + fruit.r + 4) {
      fruit.collected = true;
      state.score += 1;
    }
  });
}

function updatePulses(dt) {
  state.pulses.forEach((pulse) => {
    pulse.r += 300 * dt;
  });
  state.pulses = state.pulses.filter((pulse) => pulse.r <= pulse.maxR);
}

function handleCollisions() {
  if (state.invincible > 0) return;
  state.pests.forEach((pest) => {
    const dist = Math.hypot(state.player.x - pest.x, state.player.y - pest.y);
    if (dist < state.player.r + pest.r - 2) {
      state.lives -= 1;
      state.invincible = 1.5;
      const angle = Math.atan2(state.player.y - pest.y, state.player.x - pest.x);
      state.player.x = clamp(state.player.x + Math.cos(angle) * 40, 40, BASE_WIDTH - 40);
      state.player.y = clamp(state.player.y + Math.sin(angle) * 40, 40, BASE_HEIGHT - 40);
    }
  });
}

function update(dt) {
  if (state.mode !== "playing") return;

  state.timeLeft = Math.max(0, state.timeLeft - dt);
  state.pulseCooldown = Math.max(0, state.pulseCooldown - dt);
  state.pulseActive = Math.max(0, state.pulseActive - dt);
  state.invincible = Math.max(0, state.invincible - dt);

  updatePlayer(dt);
  updatePests(dt);
  updateFruits();
  updatePulses(dt);
  handleCollisions();

  if (state.score >= state.goal) {
    state.mode = "won";
  } else if (state.lives <= 0 || state.timeLeft <= 0) {
    state.mode = "lost";
  }
}

function drawBackdrop() {
  const gradient = ctx.createLinearGradient(0, 0, 0, BASE_HEIGHT);
  gradient.addColorStop(0, "#213125");
  gradient.addColorStop(0.5, "#1d2a1e");
  gradient.addColorStop(1, "#131a14");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  ctx.fillStyle = "#283a2d";
  ctx.beginPath();
  ctx.ellipse(200, 520, 260, 80, 0, 0, Math.PI * 2);
  ctx.ellipse(760, 530, 300, 90, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let row = 0; row < ORCHARD_ROWS; row += 1) {
    for (let col = 0; col < ORCHARD_COLS; col += 1) {
      const x = 80 + col * 110 + (row % 2 === 0 ? 20 : -10);
      const y = 110 + row * 70;
      ctx.fillStyle = "rgba(20, 35, 22, 0.7)";
      ctx.beginPath();
      ctx.ellipse(x, y + 24, 26, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3c5b3d";
      ctx.beginPath();
      ctx.ellipse(x, y, 26, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4f7a4b";
      ctx.beginPath();
      ctx.ellipse(x - 8, y - 6, 16, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPlayer() {
  const flicker = state.invincible > 0 && Math.floor(state.invincible * 10) % 2 === 0;
  if (flicker) return;
  ctx.fillStyle = "#f0ead2";
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, state.player.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#6d4c41";
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y - 4, state.player.r * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#f6bd60";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, state.player.r + 6, 0, Math.PI * 2);
  ctx.stroke();
}

function drawPests() {
  state.pests.forEach((pest) => {
    ctx.fillStyle = pest.stunned > 0 ? "#7ea172" : "#5b2c2c";
    ctx.beginPath();
    ctx.ellipse(pest.x, pest.y, pest.r, pest.r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#f7f1e3";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pest.x - 8, pest.y + 4);
    ctx.lineTo(pest.x - 16, pest.y + 10);
    ctx.moveTo(pest.x + 8, pest.y + 4);
    ctx.lineTo(pest.x + 16, pest.y + 10);
    ctx.stroke();
  });
}

function drawFruits() {
  state.fruits.forEach((fruit) => {
    if (fruit.collected) return;
    fruit.shimmer += 0.05;
    const pulse = 1 + Math.sin(fruit.shimmer) * 0.12;
    ctx.fillStyle = "#f4d35e";
    ctx.beginPath();
    ctx.arc(fruit.x, fruit.y, fruit.r * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 240, 180, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(fruit.x, fruit.y, fruit.r * pulse + 4, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function drawPulses() {
  state.pulses.forEach((pulse) => {
    ctx.strokeStyle = "rgba(246, 189, 96, 0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pulse.x, pulse.y, pulse.r, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function drawHud() {
  ctx.fillStyle = "rgba(18, 26, 18, 0.7)";
  ctx.fillRect(18, 18, 280, 90);

  ctx.fillStyle = "#f7f1e3";
  ctx.font = "18px 'Manrope', sans-serif";
  ctx.fillText(`Harvested: ${state.score}/${state.goal}`, 32, 46);
  ctx.fillText(`Lives: ${state.lives}`, 32, 68);
  ctx.fillText(`Time: ${Math.ceil(state.timeLeft)}s`, 32, 90);

  ctx.fillStyle = state.pulseCooldown > 0 ? "#f4a261" : "#b7efc5";
  ctx.fillText(
    `Chime: ${state.pulseCooldown > 0 ? state.pulseCooldown.toFixed(1) + "s" : "Ready"}`,
    170,
    68
  );
}

function drawMessage(title, lines) {
  ctx.fillStyle = "rgba(15, 22, 15, 0.8)";
  ctx.fillRect(160, 120, 640, 300);
  ctx.strokeStyle = "rgba(244, 162, 97, 0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(160, 120, 640, 300);

  ctx.fillStyle = "#f7f1e3";
  ctx.font = "28px 'Fraunces', serif";
  ctx.fillText(title, 190, 175);

  ctx.font = "18px 'Manrope', sans-serif";
  lines.forEach((line, index) => {
    ctx.fillText(line, 190, 215 + index * 26);
  });
}

function render() {
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  drawBackdrop();

  if (state.mode !== "menu") {
    drawFruits();
    drawPests();
    drawPlayer();
    drawPulses();
    drawHud();
  }

  if (state.mode === "menu") {
    drawMessage("Orchard Wardens", [
      "Collect 10 sunfruit before time runs out.",
      "Move: WASD or Arrow Keys",
      "Sprint: Shift   Chime Pulse: Space",
      "Pause: P   Restart: R   Fullscreen: F",
      "Press Enter to begin.",
    ]);
  } else if (state.mode === "paused") {
    drawMessage("Paused", ["Press P to resume or R to restart."]);
  } else if (state.mode === "won") {
    drawMessage("Orchard Secured", ["You protected the harvest!", "Press R to play again."]);
  } else if (state.mode === "lost") {
    drawMessage("Harvest Lost", ["The pests overwhelmed the grove.", "Press R to try again."]);
  }
}

function step(timestamp) {
  const dt = Math.min(0.032, (timestamp - state.lastUpdate) / 1000);
  state.lastUpdate = timestamp;
  update(dt);
  render();
  requestAnimationFrame(step);
}

window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) {
    update(1 / 60);
  }
  render();
};

window.render_game_to_text = () => {
  const payload = {
    mode: state.mode,
    note: "Origin (0,0) top-left. X increases right, Y increases down.",
    player: { x: state.player.x, y: state.player.y, r: state.player.r },
    pests: state.pests.map((pest) => ({
      x: pest.x,
      y: pest.y,
      r: pest.r,
      stunned: pest.stunned > 0,
    })),
    fruits: state.fruits.filter((fruit) => !fruit.collected).map((fruit) => ({
      x: fruit.x,
      y: fruit.y,
      r: fruit.r,
    })),
    score: state.score,
    lives: state.lives,
    timeLeft: Number(state.timeLeft.toFixed(2)),
    pulse: {
      cooldown: Number(state.pulseCooldown.toFixed(2)),
      active: state.pulseActive > 0,
    },
  };
  return JSON.stringify(payload);
};

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }

  keys.add(event.code);

  if (event.code === "Enter" && state.mode === "menu") {
    startGame();
  }

  if (event.code === "KeyP" && state.mode === "playing") {
    state.mode = "paused";
  } else if (event.code === "KeyP" && state.mode === "paused") {
    state.mode = "playing";
  }

  if (event.code === "KeyR") {
    resetGame();
  }

  if (event.code === "KeyF") {
    toggleFullscreen();
  }

  if (event.code === "Space") {
    firePulse();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("blur", () => {
  keys.clear();
});

document.addEventListener("fullscreenchange", resize);
window.addEventListener("resize", resize);

resetGame();
resize();
requestAnimationFrame(step);
