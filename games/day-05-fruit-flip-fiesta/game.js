const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const BASE_WIDTH = 960;
const BASE_HEIGHT = 540;

const GRID_COLS = 4;
const GRID_ROWS = 4;
const CARD_WIDTH = 128;
const CARD_HEIGHT = 90;
const CARD_GAP = 20;
const BOARD_WIDTH = GRID_COLS * CARD_WIDTH + (GRID_COLS - 1) * CARD_GAP;
const BOARD_HEIGHT = GRID_ROWS * CARD_HEIGHT + (GRID_ROWS - 1) * CARD_GAP;
const BOARD_X = (BASE_WIDTH - BOARD_WIDTH) / 2;
const BOARD_Y = 96;

const FRUITS = ["🍎", "🍌", "🍇", "🍓", "🍍", "🥝", "🍒", "🍑"];

const state = {
  mode: "menu",
  cards: [],
  selected: [],
  pendingHide: null,
  elapsed: 0,
  moves: 0,
  matches: 0,
  streak: 0,
  bestStreak: 0,
  sparkles: [],
  lastUpdate: performance.now(),
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shuffle(values) {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function roundRect(x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function spawnSparkles(x, y, count, color) {
  for (let i = 0; i < count; i += 1) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(45, 160);
    state.sparkles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.4, 0.95),
      maxLife: 0,
      size: rand(2.5, 5.5),
      color,
    });
    state.sparkles[state.sparkles.length - 1].maxLife = state.sparkles[state.sparkles.length - 1].life;
  }
}

function resetBoard() {
  const deck = shuffle([...FRUITS, ...FRUITS]);

  state.cards = deck.map((emoji, index) => {
    const row = Math.floor(index / GRID_COLS);
    const col = index % GRID_COLS;
    return {
      index,
      row,
      col,
      emoji,
      x: BOARD_X + col * (CARD_WIDTH + CARD_GAP),
      y: BOARD_Y + row * (CARD_HEIGHT + CARD_GAP),
      w: CARD_WIDTH,
      h: CARD_HEIGHT,
      revealed: false,
      matched: false,
      flip: 0,
      glow: 0,
      wiggle: rand(0, Math.PI * 2),
    };
  });

  state.selected = [];
  state.pendingHide = null;
  state.elapsed = 0;
  state.moves = 0;
  state.matches = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.sparkles = [];
}

function startGame() {
  resetBoard();
  state.mode = "playing";
  state.lastUpdate = performance.now();
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function getCardAt(x, y) {
  return state.cards.find((card) => {
    return x >= card.x && x <= card.x + card.w && y >= card.y && y <= card.y + card.h;
  });
}

function revealCard(card) {
  if (state.mode !== "playing" || state.pendingHide) return;
  if (!card || card.revealed || card.matched) return;

  card.revealed = true;
  card.glow = 0.22;
  state.selected.push(card.index);

  if (state.selected.length < 2) return;

  state.moves += 1;
  const [firstIndex, secondIndex] = state.selected;
  const firstCard = state.cards[firstIndex];
  const secondCard = state.cards[secondIndex];

  if (firstCard.emoji === secondCard.emoji) {
    firstCard.matched = true;
    secondCard.matched = true;
    firstCard.glow = 0.85;
    secondCard.glow = 0.85;
    spawnSparkles(firstCard.x + firstCard.w * 0.5, firstCard.y + firstCard.h * 0.5, 14, "#ff8a5c");
    spawnSparkles(secondCard.x + secondCard.w * 0.5, secondCard.y + secondCard.h * 0.5, 14, "#ffc857");
    state.selected = [];
    state.matches += 1;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);

    if (state.matches >= FRUITS.length) {
      state.mode = "won";
      spawnSparkles(BASE_WIDTH * 0.5, BASE_HEIGHT * 0.3, 40, "#6dd3ce");
      spawnSparkles(BASE_WIDTH * 0.5, BASE_HEIGHT * 0.3, 40, "#ff8a5c");
    }
  } else {
    state.streak = 0;
    state.pendingHide = { indices: [firstIndex, secondIndex], timer: 0.75 };
  }
}

function update(dt) {
  state.cards.forEach((card) => {
    const target = card.revealed || card.matched ? 1 : 0;
    card.flip += (target - card.flip) * Math.min(1, dt * 14);
    card.glow = Math.max(0, card.glow - dt * 0.7);
    card.wiggle += dt * 2;
  });

  if (state.mode === "playing") {
    state.elapsed += dt;

    if (state.pendingHide) {
      state.pendingHide.timer -= dt;
      if (state.pendingHide.timer <= 0) {
        const [firstIndex, secondIndex] = state.pendingHide.indices;
        const firstCard = state.cards[firstIndex];
        const secondCard = state.cards[secondIndex];
        if (firstCard && !firstCard.matched) firstCard.revealed = false;
        if (secondCard && !secondCard.matched) secondCard.revealed = false;
        state.selected = [];
        state.pendingHide = null;
      }
    }
  }

  state.sparkles.forEach((particle) => {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 220 * dt;
    particle.vx *= 0.986;
  });
  state.sparkles = state.sparkles.filter((particle) => particle.life > 0);
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, BASE_HEIGHT);
  gradient.addColorStop(0, "#fff4d7");
  gradient.addColorStop(0.45, "#ffe6bb");
  gradient.addColorStop(1, "#ffd9a8");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  ctx.fillStyle = "rgba(255, 201, 111, 0.45)";
  ctx.beginPath();
  ctx.ellipse(180, 40, 280, 140, 0.12, 0, Math.PI * 2);
  ctx.ellipse(820, 100, 340, 150, -0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(129, 213, 184, 0.34)";
  ctx.beginPath();
  ctx.ellipse(300, 560, 420, 140, 0, 0, Math.PI * 2);
  ctx.ellipse(780, 590, 420, 150, 0.1, 0, Math.PI * 2);
  ctx.fill();

  const floating = ["🍍", "🍓", "🍒", "🍇", "🍎", "🍌"];
  ctx.font = "24px 'Baloo 2', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  floating.forEach((emoji, index) => {
    const x = 70 + index * 165;
    const y = 68 + Math.sin((Date.now() * 0.0014 + index) * 1.7) * 6;
    ctx.globalAlpha = 0.35;
    ctx.fillText(emoji, x, y);
  });
  ctx.globalAlpha = 1;
}

function drawHud() {
  roundRect(24, 20, 912, 62, 18);
  ctx.fillStyle = "rgba(255, 251, 240, 0.78)";
  ctx.fill();
  ctx.strokeStyle = "rgba(103, 72, 39, 0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#5a3a20";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "700 22px 'Baloo 2', sans-serif";
  ctx.fillText("Fruit Flip Fiesta", 44, 50);

  ctx.font = "700 18px 'Outfit', sans-serif";
  ctx.fillText(`Moves ${state.moves}`, 360, 50);
  ctx.fillText(`Pairs ${state.matches}/${FRUITS.length}`, 500, 50);
  ctx.fillText(`Time ${state.elapsed.toFixed(1)}s`, 670, 50);
  ctx.fillText(`Best Streak ${state.bestStreak}`, 790, 50);
}

function drawCardBack(card) {
  const shadow = Math.sin(card.wiggle * 1.8) * 0.08 + 0.12;
  roundRect(-card.w * 0.5, -card.h * 0.5, card.w, card.h, 16);
  ctx.fillStyle = `rgba(255, 141, 89, ${0.88 + shadow})`;
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 247, 220, 0.55)";
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 247, 220, 0.88)";
  ctx.font = "700 30px 'Baloo 2', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", 0, 3);
}

function drawCardFace(card) {
  const pop = card.matched ? 1 + Math.sin(card.wiggle * 7) * 0.03 : 1;

  roundRect(-card.w * 0.5, -card.h * 0.5, card.w, card.h, 16);
  const faceGradient = ctx.createLinearGradient(0, -card.h * 0.5, 0, card.h * 0.5);
  faceGradient.addColorStop(0, "rgba(255, 253, 244, 0.98)");
  faceGradient.addColorStop(1, "rgba(255, 245, 226, 0.98)");
  ctx.fillStyle = faceGradient;
  ctx.fill();

  ctx.strokeStyle = card.matched ? "rgba(115, 186, 149, 0.95)" : "rgba(129, 93, 52, 0.34)";
  ctx.lineWidth = card.matched ? 3 : 2;
  ctx.stroke();

  if (card.glow > 0) {
    ctx.fillStyle = `rgba(255, 199, 99, ${card.glow * 0.25})`;
    roundRect(-card.w * 0.5, -card.h * 0.5, card.w, card.h, 16);
    ctx.fill();
  }

  ctx.save();
  ctx.scale(pop, pop);
  ctx.fillStyle = "#412511";
  ctx.font = "700 46px 'Baloo 2', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(card.emoji, 0, 6);
  ctx.restore();

  if (card.matched) {
    ctx.fillStyle = "rgba(115, 186, 149, 0.92)";
    ctx.font = "700 16px 'Outfit', sans-serif";
    ctx.fillText("MATCH", 0, card.h * 0.32);
  }
}

function drawBoard() {
  roundRect(BOARD_X - 16, BOARD_Y - 16, BOARD_WIDTH + 32, BOARD_HEIGHT + 32, 22);
  ctx.fillStyle = "rgba(255, 252, 243, 0.42)";
  ctx.fill();

  state.cards.forEach((card) => {
    ctx.save();
    ctx.translate(card.x + card.w * 0.5, card.y + card.h * 0.5);

    const squeeze = Math.max(0.1, Math.abs(card.flip - 0.5) * 2);
    ctx.scale(squeeze, 1);

    if (card.flip < 0.5) {
      drawCardBack(card);
    } else {
      drawCardFace(card);
    }
    ctx.restore();
  });
}

function drawSparkles() {
  state.sparkles.forEach((particle) => {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawOverlay(title, lines) {
  roundRect(178, 140, 604, 252, 24);
  ctx.fillStyle = "rgba(59, 37, 13, 0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 204, 113, 0.65)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#fff8e5";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 44px 'Baloo 2', sans-serif";
  ctx.fillText(title, BASE_WIDTH / 2, 194);

  ctx.font = "600 19px 'Outfit', sans-serif";
  lines.forEach((line, index) => {
    ctx.fillText(line, BASE_WIDTH / 2, 238 + index * 32);
  });
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  drawBackground();
  drawHud();
  drawBoard();
  drawSparkles();

  if (state.mode === "menu") {
    drawOverlay("Fruit Flip Fiesta", [
      "Match all fruit emoji pairs as fast as you can.",
      "Tap/click cards to flip them.",
      "Press Enter to start, R to reset, F for fullscreen.",
      "Tap anywhere to begin.",
    ]);
  } else if (state.mode === "won") {
    drawOverlay("Perfect Harvest!", [
      `You solved it in ${state.moves} moves and ${state.elapsed.toFixed(1)} seconds.`,
      `Best streak: ${state.bestStreak}  |  Total pairs: ${FRUITS.length}`,
      "Press Enter, R, or tap to play again.",
      "",
    ]);
  } else if (state.pendingHide) {
    drawOverlay("Hold That Thought", [
      "Those cards don't match.",
      "Memorize their positions before they flip back.",
      "",
      "",
    ]);
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
    board: {
      x: BOARD_X,
      y: BOARD_Y,
      columns: GRID_COLS,
      rows: GRID_ROWS,
      cardWidth: CARD_WIDTH,
      cardHeight: CARD_HEIGHT,
      gap: CARD_GAP,
    },
    cards: state.cards.map((card) => ({
      index: card.index,
      row: card.row,
      col: card.col,
      x: card.x,
      y: card.y,
      w: card.w,
      h: card.h,
      revealed: card.revealed,
      matched: card.matched,
      emojiVisible: card.revealed || card.matched ? card.emoji : null,
    })),
    selected: [...state.selected],
    pendingHide: state.pendingHide
      ? { indices: [...state.pendingHide.indices], timer: Number(state.pendingHide.timer.toFixed(2)) }
      : null,
    moves: state.moves,
    pairsFound: state.matches,
    totalPairs: FRUITS.length,
    streak: state.streak,
    bestStreak: state.bestStreak,
    elapsed: Number(state.elapsed.toFixed(2)),
  };
  return JSON.stringify(payload);
};

function toCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: clamp((event.clientX - rect.left) * scaleX, 0, BASE_WIDTH),
    y: clamp((event.clientY - rect.top) * scaleY, 0, BASE_HEIGHT),
  };
}

canvas.addEventListener("pointerdown", (event) => {
  const point = toCanvasPoint(event);

  if (state.mode === "menu") {
    startGame();
    return;
  }

  if (state.mode === "won") {
    startGame();
    return;
  }

  if (state.mode !== "playing") return;

  const card = getCardAt(point.x, point.y);
  revealCard(card);
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === "Enter" && (state.mode === "menu" || state.mode === "won")) {
    startGame();
  }

  if (event.code === "KeyR") {
    startGame();
  }

  if (event.code === "KeyF") {
    toggleFullscreen();
  }

  if (event.code === "KeyM") {
    state.mode = "menu";
    resetBoard();
  }
});

resetBoard();
requestAnimationFrame(step);
