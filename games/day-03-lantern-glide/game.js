const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const BASE_WIDTH = 960;
const BASE_HEIGHT = 540;

const pointer = {
  x: BASE_WIDTH / 2,
  y: BASE_HEIGHT / 2,
  active: false,
};

const state = {
  mode: "title",
  time: 0,
  score: 0,
  collected: 0,
  goal: 10,
  energy: 100,
  maxEnergy: 100,
  shields: 3,
  blinkCooldown: 0,
  blinkFlash: 0,
  invuln: 0,
  player: {
    x: BASE_WIDTH / 2,
    y: BASE_HEIGHT / 2,
    r: 14,
    vx: 0,
    vy: 0,
  },
  target: {
    x: BASE_WIDTH / 2,
    y: BASE_HEIGHT / 2,
    active: false,
  },
  sparks: [],
  wraiths: [],
  spawnTimer: 0,
  wraithTimer: 0,
  lastUpdate: performance.now(),
};

const stars = Array.from({ length: 80 }, () => ({
  x: Math.random() * BASE_WIDTH,
  y: Math.random() * BASE_HEIGHT,
  r: 0.6 + Math.random() * 1.4,
  tw: Math.random() * Math.PI * 2,
}));

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function resetGame() {
  state.mode = "title";
  state.time = 0;
  state.score = 0;
  state.collected = 0;
  state.energy = state.maxEnergy;
  state.shields = 3;
  state.blinkCooldown = 0;
  state.blinkFlash = 0;
  state.invuln = 0;
  state.player.x = BASE_WIDTH / 2;
  state.player.y = BASE_HEIGHT / 2;
  state.player.vx = 0;
  state.player.vy = 0;
  state.target.x = BASE_WIDTH / 2;
  state.target.y = BASE_HEIGHT / 2;
  state.target.active = false;
  pointer.x = state.target.x;
  pointer.y = state.target.y;
  state.sparks = Array.from({ length: 5 }, () => createSpark());
  state.wraiths = Array.from({ length: 2 }, () => createWraith());
  state.spawnTimer = 0;
  state.wraithTimer = 0;
}

function startGame() {
  if (state.mode === "playing") return;
  if (state.mode === "title" || state.mode === "won" || state.mode === "lost") {
    resetGame();
  }
  state.mode = "playing";
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

function createSpark() {
  return {
    x: rand(70, BASE_WIDTH - 70),
    y: rand(70, BASE_HEIGHT - 90),
    r: rand(8, 12),
    glow: rand(0, Math.PI * 2),
  };
}

function createWraith() {
  const edge = Math.floor(rand(0, 4));
  let x = 0;
  let y = 0;
  if (edge === 0) {
    x = rand(40, BASE_WIDTH - 40);
    y = -40;
  } else if (edge === 1) {
    x = BASE_WIDTH + 40;
    y = rand(40, BASE_HEIGHT - 40);
  } else if (edge === 2) {
    x = rand(40, BASE_WIDTH - 40);
    y = BASE_HEIGHT + 40;
  } else {
    x = -40;
    y = rand(40, BASE_HEIGHT - 40);
  }
  return {
    x,
    y,
    r: rand(16, 22),
    speed: rand(45, 70),
    drift: rand(-0.6, 0.6),
  };
}

function attemptBlink(point) {
  if (state.mode !== "playing") return;
  if (state.blinkCooldown > 0) return;
  const dx = point.x - state.player.x;
  const dy = point.y - state.player.y;
  const dist = Math.hypot(dx, dy) || 1;
  const maxRange = 180;
  const travel = Math.min(maxRange, dist);
  state.player.x = clamp(state.player.x + (dx / dist) * travel, 40, BASE_WIDTH - 40);
  state.player.y = clamp(state.player.y + (dy / dist) * travel, 40, BASE_HEIGHT - 40);
  state.player.vx = 0;
  state.player.vy = 0;
  state.blinkCooldown = 2.5;
  state.blinkFlash = 0.35;
  state.energy = clamp(state.energy - 6, 0, state.maxEnergy);
}

function updatePlayer(dt) {
  if (!state.target.active) {
    state.player.vx *= Math.pow(0.85, dt * 60);
    state.player.vy *= Math.pow(0.85, dt * 60);
  } else {
    const dx = state.target.x - state.player.x;
    const dy = state.target.y - state.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 6) {
      const speed = 220;
      const desiredX = (dx / dist) * speed;
      const desiredY = (dy / dist) * speed;
      state.player.vx = lerp(state.player.vx, desiredX, Math.min(1, dt * 6));
      state.player.vy = lerp(state.player.vy, desiredY, Math.min(1, dt * 6));
    } else {
      state.player.vx *= 0.9;
      state.player.vy *= 0.9;
    }
  }

  state.player.x = clamp(state.player.x + state.player.vx * dt, 40, BASE_WIDTH - 40);
  state.player.y = clamp(state.player.y + state.player.vy * dt, 40, BASE_HEIGHT - 40);
}

function updateSparks(dt) {
  state.sparks.forEach((spark) => {
    spark.glow += dt * 3;
  });
}

function updateWraiths(dt) {
  state.wraiths.forEach((wraith) => {
    const dx = state.player.x - wraith.x;
    const dy = state.player.y - wraith.y;
    const dist = Math.hypot(dx, dy) || 1;
    const driftX = Math.cos(state.time + wraith.drift) * 12;
    const driftY = Math.sin(state.time + wraith.drift) * 12;
    wraith.x += (dx / dist) * wraith.speed * dt + driftX * dt;
    wraith.y += (dy / dist) * wraith.speed * dt + driftY * dt;
  });
}

function handleCollisions() {
  for (let i = state.sparks.length - 1; i >= 0; i--) {
    const spark = state.sparks[i];
    const dist = Math.hypot(state.player.x - spark.x, state.player.y - spark.y);
    if (dist < state.player.r + spark.r + 4) {
      state.sparks.splice(i, 1);
      state.collected += 1;
      state.score += 120;
      state.energy = clamp(state.energy + 15, 0, state.maxEnergy);
      state.sparks.push(createSpark());
    }
  }

  if (state.invuln <= 0) {
    for (const wraith of state.wraiths) {
      const dist = Math.hypot(state.player.x - wraith.x, state.player.y - wraith.y);
      if (dist < state.player.r + wraith.r - 2) {
        state.shields -= 1;
        state.invuln = 1.3;
        const pushX = (state.player.x - wraith.x) / (dist || 1);
        const pushY = (state.player.y - wraith.y) / (dist || 1);
        state.player.vx += pushX * 140;
        state.player.vy += pushY * 140;
        break;
      }
    }
  }
}

function update(dt) {
  if (state.mode !== "playing") return;

  state.time += dt;
  state.energy = clamp(state.energy - dt * 3.2, 0, state.maxEnergy);
  state.blinkCooldown = Math.max(0, state.blinkCooldown - dt);
  state.blinkFlash = Math.max(0, state.blinkFlash - dt);
  state.invuln = Math.max(0, state.invuln - dt);

  updatePlayer(dt);
  updateSparks(dt);
  updateWraiths(dt);
  handleCollisions();

  state.spawnTimer += dt;
  if (state.spawnTimer > 6) {
    state.spawnTimer = 0;
    state.sparks.push(createSpark());
  }

  state.wraithTimer += dt;
  if (state.wraithTimer > 8 && state.wraiths.length < 6) {
    state.wraithTimer = 0;
    state.wraiths.push(createWraith());
  }

  if (state.energy <= 0 || state.shields <= 0) {
    state.mode = "lost";
  }

  if (state.collected >= state.goal) {
    state.mode = "won";
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, BASE_HEIGHT);
  gradient.addColorStop(0, "#0c1021");
  gradient.addColorStop(1, "#06070d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = "#1c2442";
  ctx.beginPath();
  ctx.arc(130, 110, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = "#1a1f34";
  ctx.beginPath();
  ctx.arc(760, 160, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  stars.forEach((star) => {
    const pulse = Math.sin(state.time * 1.5 + star.tw) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(245, 217, 170, ${0.3 + pulse * 0.5})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r + pulse * 0.8, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawSparks() {
  state.sparks.forEach((spark) => {
    const glow = Math.sin(spark.glow) * 0.5 + 0.5;
    ctx.save();
    ctx.fillStyle = `rgba(255, 210, 120, ${0.5 + glow * 0.4})`;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, spark.r + glow * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe4a0";
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, spark.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawWraiths() {
  state.wraiths.forEach((wraith) => {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(40, 50, 70, 0.8)";
    ctx.beginPath();
    ctx.arc(wraith.x, wraith.y, wraith.r + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(10, 12, 20, 0.9)";
    ctx.beginPath();
    ctx.arc(wraith.x, wraith.y, wraith.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawPlayer() {
  ctx.save();
  ctx.translate(state.player.x, state.player.y);

  if (state.blinkFlash > 0) {
    ctx.globalAlpha = state.blinkFlash * 1.5;
    ctx.strokeStyle = "rgba(255, 240, 190, 0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, state.player.r + 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  const glow = state.invuln > 0 ? 0.9 : 0.6;
  ctx.fillStyle = `rgba(255, 209, 114, ${glow})`;
  ctx.beginPath();
  ctx.arc(0, 0, state.player.r + 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fef1c6";
  ctx.beginPath();
  ctx.arc(0, 0, state.player.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8a6a2c";
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawTarget() {
  if (!state.target.active || state.mode !== "playing") return;
  ctx.save();
  ctx.strokeStyle = "rgba(248, 219, 160, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(state.target.x, state.target.y, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawHud() {
  ctx.save();
  ctx.fillStyle = "rgba(8, 10, 18, 0.6)";
  ctx.fillRect(20, 18, 220, 70);
  ctx.strokeStyle = "rgba(255, 220, 160, 0.4)";
  ctx.strokeRect(20, 18, 220, 70);

  ctx.fillStyle = "#f6e7c6";
  ctx.font = "16px Trebuchet MS";
  ctx.fillText(`Sparks: ${state.collected}/${state.goal}`, 32, 42);
  ctx.fillText(`Score: ${state.score}`, 32, 62);
  ctx.fillText(`Shields: ${state.shields}`, 32, 82);

  const barWidth = 160;
  const barHeight = 8;
  const energyRatio = state.energy / state.maxEnergy;
  ctx.fillStyle = "rgba(255, 230, 190, 0.3)";
  ctx.fillRect(270, 28, barWidth, barHeight);
  ctx.fillStyle = "#f4c661";
  ctx.fillRect(270, 28, barWidth * energyRatio, barHeight);
  ctx.fillStyle = "#f6e7c6";
  ctx.font = "13px Trebuchet MS";
  ctx.fillText("Glow", 270, 46);

  ctx.restore();
}

function drawOverlay(title, subtitle) {
  ctx.save();
  ctx.fillStyle = "rgba(7, 9, 15, 0.78)";
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  ctx.fillStyle = "#f7e6c3";
  ctx.textAlign = "center";
  ctx.font = "42px Trebuchet MS";
  ctx.fillText(title, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 40);

  ctx.font = "18px Trebuchet MS";
  ctx.fillStyle = "#f4c661";
  ctx.fillText(subtitle, BASE_WIDTH / 2, BASE_HEIGHT / 2);

  ctx.font = "16px Trebuchet MS";
  ctx.fillStyle = "#f0d9a8";
  ctx.fillText("Move the pointer to steer. Click or tap to blink.", BASE_WIDTH / 2, BASE_HEIGHT / 2 + 34);
  ctx.fillText("Collect sparks, avoid wraiths. Press F for fullscreen.", BASE_WIDTH / 2, BASE_HEIGHT / 2 + 58);
  ctx.restore();
}

function render() {
  drawBackground();
  drawTarget();
  drawSparks();
  drawWraiths();
  drawPlayer();
  drawHud();

  if (state.mode === "title") {
    drawOverlay("Lantern Glide", "Guide the glow through the dusk.");
  } else if (state.mode === "paused") {
    drawOverlay("Paused", "Click to resume or press P.");
  } else if (state.mode === "won") {
    drawOverlay("Light Restored", "Click to glide again.");
  } else if (state.mode === "lost") {
    drawOverlay("Glow Faded", "Click to try again.");
  }
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
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

canvas.addEventListener("pointermove", (event) => {
  const pos = toCanvasCoords(event);
  pointer.x = pos.x;
  pointer.y = pos.y;
  pointer.active = true;
  state.target.x = pos.x;
  state.target.y = pos.y;
  state.target.active = true;
});

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  const pos = toCanvasCoords(event);
  pointer.x = pos.x;
  pointer.y = pos.y;
  state.target.x = pos.x;
  state.target.y = pos.y;
  state.target.active = true;

  if (state.mode === "title" || state.mode === "won" || state.mode === "lost") {
    startGame();
    return;
  }

  if (state.mode === "paused") {
    togglePause();
    return;
  }

  attemptBlink(pos);
});

canvas.addEventListener("pointerleave", () => {
  pointer.active = false;
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyF") {
    if (!document.fullscreenElement) {
      canvas.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }
  if (event.code === "KeyP") {
    togglePause();
  }
  if (event.code === "KeyR") {
    resetGame();
  }
});

window.addEventListener("resize", () => {
  // Keep canvas resolution stable while CSS scales it.
  canvas.width = BASE_WIDTH;
  canvas.height = BASE_HEIGHT;
});

function renderGameToText() {
  const payload = {
    mode: state.mode,
    coord: "origin top-left, x right, y down",
    player: {
      x: Number(state.player.x.toFixed(1)),
      y: Number(state.player.y.toFixed(1)),
      r: state.player.r,
      vx: Number(state.player.vx.toFixed(1)),
      vy: Number(state.player.vy.toFixed(1)),
    },
    target: {
      x: Number(state.target.x.toFixed(1)),
      y: Number(state.target.y.toFixed(1)),
      active: state.target.active,
    },
    energy: Number(state.energy.toFixed(1)),
    shields: state.shields,
    blinkCooldown: Number(state.blinkCooldown.toFixed(2)),
    collected: state.collected,
    goal: state.goal,
    score: state.score,
    sparks: state.sparks.map((spark) => ({
      x: Number(spark.x.toFixed(1)),
      y: Number(spark.y.toFixed(1)),
      r: spark.r,
    })),
    wraiths: state.wraiths.map((wraith) => ({
      x: Number(wraith.x.toFixed(1)),
      y: Number(wraith.y.toFixed(1)),
      r: wraith.r,
    })),
  };
  return JSON.stringify(payload);
}

window.render_game_to_text = renderGameToText;

window.advanceTime = (ms) => {
  const stepMs = 1000 / 60;
  const steps = Math.max(1, Math.round(ms / stepMs));
  for (let i = 0; i < steps; i++) {
    step(1 / 60);
  }
};

resetGame();
requestAnimationFrame(loop);
