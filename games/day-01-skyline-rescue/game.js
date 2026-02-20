(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const WORLD = {
    width: canvas.width,
    height: canvas.height,
    maxWaves: 3,
    startingTime: 150,
  };

  const keys = new Set();
  const mouse = {
    x: WORLD.width * 0.5,
    y: WORLD.height * 0.5,
  };

  const state = {
    mode: "menu",
    wave: 1,
    score: 0,
    timeLeft: WORLD.startingTime,
    transitionTimer: 0,
    transitionText: "",
    cameraShake: 0,
    player: null,
    beacons: [],
    drones: [],
    pulses: [],
    stars: [],
    titlePulse: 0,
  };

  let fireQueued = false;
  let fullscreenQueued = false;
  let lastFrame = performance.now();

  function resetGame() {
    state.mode = "menu";
    state.wave = 1;
    state.score = 0;
    state.timeLeft = WORLD.startingTime;
    state.transitionTimer = 0;
    state.transitionText = "";
    state.cameraShake = 0;
    state.player = createPlayer();
    state.beacons = [];
    state.drones = [];
    state.pulses = [];
    state.stars = createStars(80);
    state.titlePulse = 0;
  }

  function startGame() {
    state.mode = "playing";
    state.wave = 1;
    state.score = 0;
    state.timeLeft = WORLD.startingTime;
    state.transitionTimer = 0;
    state.transitionText = "";
    state.cameraShake = 0;
    state.player = createPlayer();
    state.pulses = [];
    spawnWave(state.wave);
  }

  function createPlayer() {
    return {
      x: WORLD.width * 0.5,
      y: WORLD.height * 0.8,
      vx: 0,
      vy: 0,
      radius: 17,
      speed: 390,
      damping: 0.965,
      lives: 3,
      invulnerable: 0,
      dashActive: 0,
      dashCooldown: 0,
      shotCooldown: 0,
    };
  }

  function createStars(count) {
    const stars = [];
    for (let i = 0; i < count; i += 1) {
      stars.push({
        x: Math.random() * WORLD.width,
        y: Math.random() * WORLD.height,
        radius: 0.8 + Math.random() * 2.2,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
    return stars;
  }

  function spawnWave(waveNumber) {
    const beaconCount = 4 + waveNumber;
    const droneCount = 2 + waveNumber;

    state.beacons = [];
    for (let i = 0; i < beaconCount; i += 1) {
      state.beacons.push(spawnBeacon(i));
    }

    state.drones = [];
    for (let i = 0; i < droneCount; i += 1) {
      state.drones.push(spawnDrone(i, waveNumber));
    }

    state.transitionTimer = 2.4;
    state.transitionText = `Wave ${waveNumber}`;
  }

  function spawnBeacon(index) {
    const padding = 60;
    return {
      x: padding + Math.random() * (WORLD.width - padding * 2),
      y: 90 + Math.random() * (WORLD.height - 170),
      radius: 11,
      phase: index * 0.9,
    };
  }

  function spawnDrone(index, waveNumber) {
    const edge = index % 4;
    const margin = 40;
    let x = WORLD.width * 0.5;
    let y = WORLD.height * 0.25;

    if (edge === 0) {
      x = margin;
      y = Math.random() * WORLD.height;
    } else if (edge === 1) {
      x = WORLD.width - margin;
      y = Math.random() * WORLD.height;
    } else if (edge === 2) {
      x = Math.random() * WORLD.width;
      y = margin;
    } else {
      x = Math.random() * WORLD.width;
      y = WORLD.height - margin;
    }

    return {
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 15,
      speed: 92 + waveNumber * 14,
      stunned: 0,
      hue: 190 + Math.random() * 35,
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function normalize(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  function readMoveAxis() {
    let x = 0;
    let y = 0;
    if (keys.has("arrowleft") || keys.has("a")) x -= 1;
    if (keys.has("arrowright") || keys.has("d")) x += 1;
    if (keys.has("arrowup") || keys.has("w")) y -= 1;
    if (keys.has("arrowdown") || keys.has("s")) y += 1;
    return { x, y };
  }

  function updateMenu(dt) {
    state.titlePulse += dt;
    for (let i = 0; i < state.stars.length; i += 1) {
      state.stars[i].twinkle += dt * 1.4;
    }
  }

  function updatePlaying(dt) {
    const player = state.player;

    state.timeLeft = Math.max(0, state.timeLeft - dt);
    if (state.timeLeft <= 0) {
      state.mode = "gameover";
      state.transitionText = "Time up";
      return;
    }

    if (state.transitionTimer > 0) {
      state.transitionTimer = Math.max(0, state.transitionTimer - dt);
    }

    if (player.invulnerable > 0) {
      player.invulnerable = Math.max(0, player.invulnerable - dt);
    }

    if (player.shotCooldown > 0) {
      player.shotCooldown = Math.max(0, player.shotCooldown - dt);
    }

    if (player.dashCooldown > 0) {
      player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    }

    if (player.dashActive > 0) {
      player.dashActive = Math.max(0, player.dashActive - dt);
    }

    const movement = readMoveAxis();
    const inputX = movement.x;
    const inputY = movement.y;

    if (inputX !== 0 || inputY !== 0) {
      const axis = normalize(inputX, inputY);
      const dashBoost = player.dashActive > 0 ? 2.45 : 1;
      const accel = player.speed * dashBoost;
      player.vx += axis.x * accel * dt;
      player.vy += axis.y * accel * dt;
    }

    player.vx *= player.damping;
    player.vy *= player.damping;

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    player.x = clamp(player.x, player.radius, WORLD.width - player.radius);
    player.y = clamp(player.y, player.radius + 44, WORLD.height - player.radius - 14);

    if (fireQueued && player.shotCooldown <= 0) {
      fireQueued = false;
      player.shotCooldown = 0.25;
      createPulse(player.x, player.y, mouse.x, mouse.y);
    }

    updatePulses(dt);
    updateDrones(dt);
    updateBeacons(dt);

    if (state.cameraShake > 0) {
      state.cameraShake = Math.max(0, state.cameraShake - dt * 7);
    }

    if (state.beacons.length === 0 && state.mode === "playing") {
      if (state.wave < WORLD.maxWaves) {
        state.wave += 1;
        state.score += 240;
        spawnWave(state.wave);
      } else {
        state.score += Math.floor(state.timeLeft * 15);
        state.mode = "won";
        state.transitionText = "Skyline secured";
      }
    }
  }

  function updateBeacons(dt) {
    for (let i = 0; i < state.beacons.length; i += 1) {
      const beacon = state.beacons[i];
      beacon.phase += dt * 2.2;

      if (dist(beacon, state.player) <= beacon.radius + state.player.radius) {
        state.score += 120;
        state.beacons.splice(i, 1);
        i -= 1;
      }
    }
  }

  function updateDrones(dt) {
    const player = state.player;

    for (let i = 0; i < state.drones.length; i += 1) {
      const drone = state.drones[i];

      if (drone.stunned > 0) {
        drone.stunned = Math.max(0, drone.stunned - dt);
        drone.vx *= 0.9;
        drone.vy *= 0.9;
      } else {
        const toward = normalize(player.x - drone.x, player.y - drone.y);
        drone.vx += toward.x * drone.speed * dt;
        drone.vy += toward.y * drone.speed * dt;
      }

      drone.vx *= 0.93;
      drone.vy *= 0.93;
      drone.x += drone.vx * dt;
      drone.y += drone.vy * dt;

      drone.x = clamp(drone.x, drone.radius, WORLD.width - drone.radius);
      drone.y = clamp(drone.y, drone.radius + 45, WORLD.height - drone.radius - 14);

      if (dist(drone, player) <= drone.radius + player.radius) {
        if (player.invulnerable <= 0) {
          player.lives -= 1;
          player.invulnerable = 1.6;
          state.cameraShake = 1;
          state.score = Math.max(0, state.score - 80);
          const knock = normalize(player.x - drone.x, player.y - drone.y);
          player.vx += knock.x * 250;
          player.vy += knock.y * 250;
        }

        drone.stunned = 0.4;
      }
    }

    if (player.lives <= 0 && state.mode === "playing") {
      state.mode = "gameover";
      state.transitionText = "Rescue failed";
    }
  }

  function createPulse(originX, originY, targetX, targetY) {
    const dir = normalize(targetX - originX, targetY - originY);
    state.pulses.push({
      x: originX,
      y: originY,
      vx: dir.x * 460,
      vy: dir.y * 460,
      radius: 5,
      ttl: 1,
    });
  }

  function updatePulses(dt) {
    for (let i = 0; i < state.pulses.length; i += 1) {
      const pulse = state.pulses[i];
      pulse.x += pulse.vx * dt;
      pulse.y += pulse.vy * dt;
      pulse.ttl -= dt;

      if (
        pulse.ttl <= 0 ||
        pulse.x < -20 ||
        pulse.y < -20 ||
        pulse.x > WORLD.width + 20 ||
        pulse.y > WORLD.height + 20
      ) {
        state.pulses.splice(i, 1);
        i -= 1;
        continue;
      }

      for (let j = 0; j < state.drones.length; j += 1) {
        const drone = state.drones[j];
        if (dist(pulse, drone) <= pulse.radius + drone.radius) {
          drone.stunned = 1.8;
          state.score += 25;
          state.pulses.splice(i, 1);
          i -= 1;
          break;
        }
      }
    }
  }

  function update(dt) {
    if (state.mode === "menu") {
      updateMenu(dt);
      return;
    }

    if (state.mode === "paused") {
      for (let i = 0; i < state.stars.length; i += 1) {
        state.stars[i].twinkle += dt * 0.7;
      }
      return;
    }

    if (state.mode === "playing") {
      for (let i = 0; i < state.stars.length; i += 1) {
        state.stars[i].twinkle += dt * 1.1;
      }
      updatePlaying(dt);
      return;
    }

    if (state.mode === "won" || state.mode === "gameover") {
      state.titlePulse += dt;
      for (let i = 0; i < state.stars.length; i += 1) {
        state.stars[i].twinkle += dt * 1.2;
      }
    }
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, WORLD.height);
    gradient.addColorStop(0, "#0c2944");
    gradient.addColorStop(1, "#04152c");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    for (const star of state.stars) {
      const glow = 0.35 + Math.sin(star.twinkle) * 0.25;
      ctx.fillStyle = `rgba(235, 247, 255, ${glow})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    drawCityscape();
  }

  function drawCityscape() {
    ctx.fillStyle = "rgba(18, 56, 82, 0.8)";
    const blocks = [
      { x: 28, w: 66, h: 180 },
      { x: 120, w: 86, h: 215 },
      { x: 250, w: 76, h: 248 },
      { x: 370, w: 64, h: 198 },
      { x: 470, w: 84, h: 236 },
      { x: 605, w: 74, h: 212 },
      { x: 720, w: 70, h: 170 },
      { x: 825, w: 88, h: 228 },
    ];

    for (const block of blocks) {
      ctx.fillRect(block.x, WORLD.height - block.h, block.w, block.h);

      ctx.fillStyle = "rgba(255, 233, 189, 0.18)";
      const rows = Math.floor((block.h - 24) / 22);
      for (let row = 0; row < rows; row += 1) {
        const y = WORLD.height - block.h + 12 + row * 22;
        for (let col = 0; col < 3; col += 1) {
          const x = block.x + 10 + col * 18;
          ctx.fillRect(x, y, 8, 10);
        }
      }

      ctx.fillStyle = "rgba(18, 56, 82, 0.8)";
    }

    const haze = ctx.createLinearGradient(0, WORLD.height - 160, 0, WORLD.height);
    haze.addColorStop(0, "rgba(24, 78, 112, 0)");
    haze.addColorStop(1, "rgba(24, 78, 112, 0.52)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, WORLD.height - 160, WORLD.width, 160);
  }

  function drawHUD() {
    const panelHeight = 44;
    ctx.fillStyle = "rgba(6, 24, 44, 0.82)";
    ctx.fillRect(0, 0, WORLD.width, panelHeight);
    ctx.strokeStyle = "rgba(184, 225, 247, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, panelHeight + 0.5);
    ctx.lineTo(WORLD.width, panelHeight + 0.5);
    ctx.stroke();

    ctx.fillStyle = "#f0f8ff";
    ctx.font = "600 16px 'Chakra Petch', monospace";
    ctx.fillText(`Wave ${state.wave}/${WORLD.maxWaves}`, 16, 28);
    ctx.fillText(`Lives ${state.player.lives}`, 154, 28);
    ctx.fillText(`Score ${state.score}`, 258, 28);
    ctx.fillText(`Beacons ${state.beacons.length}`, 420, 28);

    const dashReady = state.player.dashCooldown <= 0 ? "Ready" : `${state.player.dashCooldown.toFixed(1)}s`;
    ctx.fillText(`Dash ${dashReady}`, 580, 28);
    ctx.fillText(`Time ${Math.ceil(state.timeLeft)}s`, 760, 28);
  }

  function drawBeacons() {
    for (const beacon of state.beacons) {
      const bob = Math.sin(beacon.phase) * 5;
      ctx.save();
      ctx.translate(beacon.x, beacon.y + bob);
      ctx.fillStyle = "rgba(118, 237, 215, 0.95)";
      ctx.beginPath();
      ctx.arc(0, 0, beacon.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(213, 255, 245, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, beacon.radius + 5 + Math.sin(beacon.phase * 2), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawDrones() {
    for (const drone of state.drones) {
      ctx.save();
      ctx.translate(drone.x, drone.y);
      const stunGlow = drone.stunned > 0 ? 0.75 : 0.15;
      ctx.fillStyle = `hsla(${drone.hue}, 76%, 58%, 0.92)`;
      ctx.beginPath();
      ctx.arc(0, 0, drone.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(198, 244, 255, ${stunGlow})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, drone.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(4, 20, 40, 0.85)";
      ctx.fillRect(-5, -2, 10, 4);
      ctx.restore();
    }
  }

  function drawPulses() {
    for (const pulse of state.pulses) {
      ctx.fillStyle = "rgba(255, 176, 131, 0.94)";
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer() {
    const player = state.player;
    const flicker = player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2 === 0;
    if (flicker) {
      return;
    }

    ctx.save();
    ctx.translate(player.x, player.y);
    const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    ctx.rotate(angle);

    const dashGlow = player.dashActive > 0 ? 0.92 : 0.38;
    ctx.fillStyle = "rgba(255, 155, 90, 0.95)";
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-14, -11);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-14, 11);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = `rgba(255, 220, 190, ${dashGlow})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius + 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  function drawOverlay(title, subtitle, detail) {
    ctx.fillStyle = "rgba(2, 12, 24, 0.66)";
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    ctx.fillStyle = "#f3fbff";
    ctx.textAlign = "center";
    ctx.font = "700 44px 'Chakra Petch', monospace";
    ctx.fillText(title, WORLD.width * 0.5, WORLD.height * 0.42);

    ctx.font = "600 20px 'Space Grotesk', sans-serif";
    ctx.fillStyle = "#cfe6f5";
    ctx.fillText(subtitle, WORLD.width * 0.5, WORLD.height * 0.48);

    ctx.font = "500 16px 'Space Grotesk', sans-serif";
    ctx.fillStyle = "#b3d3e8";
    ctx.fillText(detail, WORLD.width * 0.5, WORLD.height * 0.54);

    ctx.textAlign = "start";
  }

  function drawWaveBanner() {
    if (state.transitionTimer <= 0 || !state.transitionText) {
      return;
    }

    const alpha = Math.min(1, state.transitionTimer * 1.8);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(5, 32, 58, 0.74)";
    ctx.fillRect(WORLD.width * 0.34, 62, WORLD.width * 0.32, 42);
    ctx.strokeStyle = "rgba(195, 230, 247, 0.46)";
    ctx.lineWidth = 1;
    ctx.strokeRect(WORLD.width * 0.34, 62, WORLD.width * 0.32, 42);
    ctx.fillStyle = "#e5f5ff";
    ctx.font = "700 24px 'Chakra Petch', monospace";
    ctx.textAlign = "center";
    ctx.fillText(state.transitionText, WORLD.width * 0.5, 90);
    ctx.textAlign = "start";
    ctx.restore();
  }

  function render() {
    ctx.save();

    if (state.cameraShake > 0) {
      const intensity = state.cameraShake * 5;
      const shakeX = (Math.random() - 0.5) * intensity;
      const shakeY = (Math.random() - 0.5) * intensity;
      ctx.translate(shakeX, shakeY);
    }

    drawBackground();

    if (state.mode === "menu") {
      drawOverlay(
        "Skyline Rescue",
        "Recover every beacon and stun drones before the city collapses.",
        "Press Enter to start"
      );

      ctx.fillStyle = "#bfe2f5";
      ctx.font = "500 16px 'Space Grotesk', sans-serif";
      ctx.fillText("Move: WASD or Arrow keys", WORLD.width * 0.5 - 170, WORLD.height * 0.66);
      ctx.fillText("Dash: Space", WORLD.width * 0.5 - 170, WORLD.height * 0.695);
      ctx.fillText("Pulse shot: Left click", WORLD.width * 0.5 - 170, WORLD.height * 0.73);
      ctx.fillText("Pause: P | Fullscreen: F", WORLD.width * 0.5 - 170, WORLD.height * 0.765);
      ctx.restore();
      return;
    }

    drawBeacons();
    drawPulses();
    drawDrones();
    drawPlayer();
    drawHUD();
    drawWaveBanner();

    if (state.mode === "paused") {
      drawOverlay("Paused", "Take a breath. Skyline holds for now.", "Press P to resume");
    }

    if (state.mode === "won") {
      drawOverlay(
        "Mission Complete",
        `Final score: ${state.score}`,
        "Press R to restart"
      );
    }

    if (state.mode === "gameover") {
      drawOverlay(
        "Rescue Failed",
        `${state.transitionText}. Score: ${state.score}`,
        "Press R to try again"
      );
    }

    ctx.restore();
  }

  function togglePause() {
    if (state.mode === "playing") {
      state.mode = "paused";
    } else if (state.mode === "paused") {
      state.mode = "playing";
    }
  }

  function tryDash() {
    if (state.mode !== "playing") {
      return;
    }

    const player = state.player;
    if (player.dashCooldown <= 0) {
      const movement = readMoveAxis();
      const dashDir =
        movement.x !== 0 || movement.y !== 0
          ? normalize(movement.x, movement.y)
          : normalize(mouse.x - player.x, mouse.y - player.y);

      player.vx += dashDir.x * 420;
      player.vy += dashDir.y * 420;
      player.dashActive = 0.36;
      player.dashCooldown = 1.2;
      state.score = Math.max(0, state.score - 2);
    }
  }

  function getCanonicalKey(event) {
    const key = event.key.toLowerCase();
    if (event.code === "Space" || key === " " || key === "spacebar") {
      return "space";
    }
    return key;
  }

  function toCanvasCoordinates(event) {
    const rect = canvas.getBoundingClientRect();
    const sx = WORLD.width / rect.width;
    const sy = WORLD.height / rect.height;
    return {
      x: (event.clientX - rect.left) * sx,
      y: (event.clientY - rect.top) * sy,
    };
  }

  function handlePointerMove(event) {
    const point = toCanvasCoordinates(event);
    mouse.x = point.x;
    mouse.y = point.y;
  }

  function handlePointerDown(event) {
    handlePointerMove(event);
    if (state.mode === "playing") {
      fireQueued = true;
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      canvas.requestFullscreen();
    }
  }

  function handleKeyDown(event) {
    const key = getCanonicalKey(event);

    if (["space", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      event.preventDefault();
    }

    keys.add(key);

    if (key === "enter" && state.mode === "menu") {
      startGame();
    }

    if (key === "r" && (state.mode === "won" || state.mode === "gameover" || state.mode === "menu")) {
      startGame();
    }

    if (key === "p" && (state.mode === "playing" || state.mode === "paused")) {
      togglePause();
    }

    if (key === "space") {
      tryDash();
    }

    if (key === "f") {
      fullscreenQueued = true;
    }
  }

  function handleKeyUp(event) {
    keys.delete(getCanonicalKey(event));
  }

  function renderGameToText() {
    const player = state.player;

    const payload = {
      coordinateSystem: "origin=(0,0) top-left, +x right, +y down",
      mode: state.mode,
      wave: state.wave,
      score: state.score,
      timeLeftSeconds: Number(state.timeLeft.toFixed(2)),
      player: {
        x: Number(player.x.toFixed(2)),
        y: Number(player.y.toFixed(2)),
        vx: Number(player.vx.toFixed(2)),
        vy: Number(player.vy.toFixed(2)),
        lives: player.lives,
        invulnerableSeconds: Number(player.invulnerable.toFixed(2)),
        dashCooldownSeconds: Number(player.dashCooldown.toFixed(2)),
        dashActiveSeconds: Number(player.dashActive.toFixed(2)),
        shotCooldownSeconds: Number(player.shotCooldown.toFixed(2)),
      },
      beacons: state.beacons.map((beacon) => ({
        x: Number(beacon.x.toFixed(2)),
        y: Number(beacon.y.toFixed(2)),
        radius: beacon.radius,
      })),
      drones: state.drones.map((drone) => ({
        x: Number(drone.x.toFixed(2)),
        y: Number(drone.y.toFixed(2)),
        vx: Number(drone.vx.toFixed(2)),
        vy: Number(drone.vy.toFixed(2)),
        radius: drone.radius,
        stunnedSeconds: Number(drone.stunned.toFixed(2)),
      })),
      pulses: state.pulses.map((pulse) => ({
        x: Number(pulse.x.toFixed(2)),
        y: Number(pulse.y.toFixed(2)),
        ttl: Number(pulse.ttl.toFixed(2)),
      })),
    };

    return JSON.stringify(payload);
  }

  function advanceTime(ms) {
    const dt = 1 / 60;
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) {
      update(dt);
    }
    render();
  }

  function tick(now) {
    const delta = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    if (fullscreenQueued) {
      fullscreenQueued = false;
      toggleFullscreen();
    }

    update(delta);
    render();
    requestAnimationFrame(tick);
  }

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  canvas.addEventListener("mousemove", handlePointerMove);
  canvas.addEventListener("mousedown", handlePointerDown);

  window.render_game_to_text = renderGameToText;
  window.advanceTime = advanceTime;

  resetGame();
  render();
  requestAnimationFrame(tick);
})();
