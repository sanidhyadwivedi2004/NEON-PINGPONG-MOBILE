// ── Elements ──
const canvas       = document.getElementById('gameBoard');
const ctx          = canvas.getContext('2d');
const scoreText    = document.getElementById('scoreText');
const streakBadge  = document.getElementById('streakBadge');
const streakCount  = document.getElementById('streakCount');
const comboPopup   = document.getElementById('comboPopup');
const diffLabel    = document.getElementById('difficultyLabel');

const startScreen  = document.getElementById('startScreen');
const victoryScreen= document.getElementById('victoryScreen');
const victoryMsg   = document.getElementById('victoryMessage');
const victoryEmoji = document.getElementById('victoryEmoji');
const finalScore   = document.getElementById('finalScore');
const finalStreak  = document.getElementById('finalStreak');
const finalRallies = document.getElementById('finalRallies');
const bestScoreDisplay = document.getElementById('bestScoreDisplay');

const touchLeft    = document.getElementById('touchZoneLeft');
const touchRight   = document.getElementById('touchZoneRight');

// ── Difficulty config ──
const DIFFICULTIES = {
  easy:   { botSpeed: 0.045, botReact: 0.7,  winScore: 7,  label: 'EASY'   },
  medium: { botSpeed: 0.065, botReact: 0.85, winScore: 7,  label: 'MEDIUM' },
  hard:   { botSpeed: 0.085, botReact: 0.95, winScore: 7,  label: 'HARD'   },
};
let selectedDiff = 'easy';

// ── Game state ──
let W, H;
let gameRunning = false;
let animFrame;
let playerScore = 0, botScore = 0;
let streak = 0, bestStreak = 0, rallies = 0;
let bestScore = parseInt(localStorage.getItem('pp_best') || '0');
bestScoreDisplay.textContent = bestScore;

// ── Ball ──
let ball = {};

// ── Paddles (stored as fractions of H for responsiveness) ──
let playerPaddle = { yFrac: 0.5 };
let botPaddle    = { yFrac: 0.5 };

// ── Particles ──
let particles = [];

// ── Touch tracking ──
let playerTouchY = null;
let lastPlayerY  = null;

// ── Resize ──
function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ── Computed paddle/ball sizes ──
function paddleW()  { return Math.max(10, W * 0.025); }
function paddleH()  { return Math.max(60, H * 0.15);  }
function ballR()    { return Math.max(8, Math.min(W, H) * 0.022); }

// ── Start / reset ──
function startGame() {
  playerScore = 0; botScore = 0;
  streak = 0; bestStreak = 0; rallies = 0;
  playerPaddle.yFrac = 0.5;
  botPaddle.yFrac    = 0.5;
  particles = [];
  updateScore();
  updateStreak();
  diffLabel.textContent = DIFFICULTIES[selectedDiff].label;
  spawnBall(1);
  gameRunning = true;
  if (animFrame) cancelAnimationFrame(animFrame);
  loop();
}

function spawnBall(dirX) {
  const speed = Math.min(W, H) * 0.007;
  const angle = (Math.random() * 0.6 - 0.3); // radians, slight angle
  ball = {
    x: W / 2,
    y: H / 2,
    vx: speed * dirX,
    vy: speed * Math.tan(angle),
    speed,
    trail: [],
  };
}

// ── Main loop ──
function loop() {
  if (!gameRunning) return;
  update();
  draw();
  animFrame = requestAnimationFrame(loop);
}

function update() {
  const diff = DIFFICULTIES[selectedDiff];

  // Move ball
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Trail
  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > 10) ball.trail.shift();

  // Wall bounce (top/bottom)
  const r = ballR();
  if (ball.y - r <= 0) { ball.y = r; ball.vy = Math.abs(ball.vy); vibrate(20); }
  if (ball.y + r >= H) { ball.y = H - r; ball.vy = -Math.abs(ball.vy); vibrate(20); }

  // Bot AI — tracks ball with some lag
  const botY = botPaddle.yFrac * H;
  const botCenter = botY;
  const targetY = ball.y;
  const maxMove = H * diff.botSpeed;
  if (Math.abs(targetY - botCenter) > paddleH() * 0.1) {
    const move = Math.min(Math.abs(targetY - botCenter), maxMove) * diff.botReact;
    botPaddle.yFrac += (targetY > botCenter ? move : -move) / H;
    botPaddle.yFrac = clamp(botPaddle.yFrac, paddleH() / 2 / H, 1 - paddleH() / 2 / H);
  }

  // Paddle collision — player (left)
  const pw = paddleW(), ph = paddleH();
  const p1x = pw, p1y = playerPaddle.yFrac * H;
  if (
    ball.vx < 0 &&
    ball.x - r <= p1x + pw &&
    ball.x - r >= p1x - pw &&
    ball.y >= p1y - ph / 2 &&
    ball.y <= p1y + ph / 2
  ) {
    ball.vx = Math.abs(ball.vx) * 1.04;
    ball.vy += ((ball.y - p1y) / (ph / 2)) * ball.speed * 0.5;
    ball.speed = Math.min(ball.speed * 1.04, Math.min(W, H) * 0.022);
    ball.x = p1x + pw + r + 1;
    rallies++;
    streak++;
    if (streak > bestStreak) bestStreak = streak;
    updateStreak();
    showCombo();
    vibrate(30);
    spawnParticles(ball.x, ball.y, '#00adb5');
  }

  // Paddle collision — bot (right)
  const p2x = W - pw * 2, p2y = botPaddle.yFrac * H;
  if (
    ball.vx > 0 &&
    ball.x + r >= p2x &&
    ball.x + r <= p2x + pw * 2 &&
    ball.y >= p2y - ph / 2 &&
    ball.y <= p2y + ph / 2
  ) {
    ball.vx = -Math.abs(ball.vx) * 1.02;
    ball.vy += ((ball.y - p2y) / (ph / 2)) * ball.speed * 0.4;
    ball.speed = Math.min(ball.speed * 1.02, Math.min(W, H) * 0.022);
    ball.x = p2x - r - 1;
    vibrate(15);
    spawnParticles(ball.x, ball.y, '#ff2e63');
  }

  // Score
  if (ball.x - r < 0) {
    botScore++;
    streak = 0;
    updateStreak();
    updateScore();
    vibrate([50, 30, 50]);
    spawnParticles(0, ball.y, '#ff2e63', 20);
    checkWin();
    if (gameRunning) setTimeout(() => spawnBall(1), 600);
  }
  if (ball.x + r > W) {
    playerScore++;
    updateScore();
    vibrate([30, 20, 80]);
    spawnParticles(W, ball.y, '#00adb5', 20);
    checkWin();
    if (gameRunning) setTimeout(() => spawnBall(-1), 600);
  }

  // Particles
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.15;
    p.life -= 0.025;
  });
  particles = particles.filter(p => p.life > 0);
}

// ── Draw ──
function draw() {
  // Background
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, W, H);

  // Center line
  ctx.setLineDash([8, 12]);
  ctx.strokeStyle = '#ffffff15';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  // Particles
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Ball trail
  ball.trail.forEach((t, i) => {
    const alpha = (i / ball.trail.length) * 0.4;
    const r = ballR() * (i / ball.trail.length) * 0.8;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Ball
  const r = ballR();
  const grad = ctx.createRadialGradient(ball.x - r * 0.3, ball.y - r * 0.3, r * 0.1, ball.x, ball.y, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#e94560');
  ctx.fillStyle = grad;
  ctx.shadowColor = '#e94560';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Player paddle (left)
  drawPaddle(paddleW(), playerPaddle.yFrac * H, paddleW(), paddleH(), '#00adb5');

  // Bot paddle (right)
  drawPaddle(W - paddleW() * 2, botPaddle.yFrac * H, paddleW(), paddleH(), '#ff2e63');
}

function drawPaddle(x, cy, w, h, color) {
  const radius = w / 2;
  const top = cy - h / 2, bottom = cy + h / 2;

  ctx.shadowColor = color;
  ctx.shadowBlur = 16;

  const grad = ctx.createLinearGradient(x, top, x + w, bottom);
  grad.addColorStop(0, color);
  grad.addColorStop(1, color + '99');
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.moveTo(x + radius, top);
  ctx.lineTo(x + w - radius, top);
  ctx.quadraticCurveTo(x + w, top, x + w, top + radius);
  ctx.lineTo(x + w, bottom - radius);
  ctx.quadraticCurveTo(x + w, bottom, x + w - radius, bottom);
  ctx.lineTo(x + radius, bottom);
  ctx.quadraticCurveTo(x, bottom, x, bottom - radius);
  ctx.lineTo(x, top + radius);
  ctx.quadraticCurveTo(x, top, x + radius, top);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
}

// ── Particles ──
function spawnParticles(x, y, color, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 1;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      r: Math.random() * 4 + 2,
      color,
      life: 1,
    });
  }
}

// ── Combo popup ──
const COMBO_MSGS = ['Nice!', 'Great!', 'Awesome!', 'On Fire!', 'Unstoppable!', 'GODLIKE!'];
function showCombo() {
  if (streak < 3) return;
  const idx = Math.min(Math.floor((streak - 3) / 2), COMBO_MSGS.length - 1);
  comboPopup.textContent = COMBO_MSGS[idx];
  comboPopup.classList.remove('pop');
  void comboPopup.offsetWidth;
  comboPopup.classList.add('pop');
}

// ── Score / streak UI ──
function updateScore() {
  scoreText.textContent = `${playerScore} : ${botScore}`;
}

function updateStreak() {
  if (streak >= 3) {
    streakBadge.classList.remove('hidden');
    streakCount.textContent = streak;
  } else {
    streakBadge.classList.add('hidden');
  }
}

// ── Win check ──
function checkWin() {
  const win = DIFFICULTIES[selectedDiff].winScore;
  if (playerScore >= win || botScore >= win) {
    gameRunning = false;
    const playerWon = playerScore >= win;
    victoryMsg.textContent  = playerWon ? 'You Win! 🎉' : 'Bot Wins!';
    victoryEmoji.textContent = playerWon ? '🏆' : '🤖';
    finalScore.textContent   = playerScore;
    finalStreak.textContent  = bestStreak;
    finalRallies.textContent = rallies;

    if (playerScore > bestScore) {
      bestScore = playerScore;
      localStorage.setItem('pp_best', bestScore);
      bestScoreDisplay.textContent = bestScore;
    }

    setTimeout(() => victoryScreen.classList.add('show'), 400);
  }
}

// ── Touch controls ──
function handleTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  playerTouchY = touch.clientY;
  playerPaddle.yFrac = clamp(playerTouchY / H, paddleH() / 2 / H, 1 - paddleH() / 2 / H);
}

touchLeft.addEventListener('touchstart', handleTouchMove, { passive: false });
touchLeft.addEventListener('touchmove',  handleTouchMove, { passive: false });
touchRight.addEventListener('touchstart', handleTouchMove, { passive: false });
touchRight.addEventListener('touchmove',  handleTouchMove, { passive: false });

// Mouse fallback for desktop
canvas.addEventListener('mousemove', e => {
  if (!gameRunning) return;
  playerPaddle.yFrac = clamp(e.clientY / H, paddleH() / 2 / H, 1 - paddleH() / 2 / H);
});

// ── Keyboard fallback ──
window.addEventListener('keydown', e => {
  if (!gameRunning) return;
  const step = 0.05;
  if (e.key === 'ArrowUp'   || e.key === 'w') playerPaddle.yFrac = clamp(playerPaddle.yFrac - step, paddleH()/2/H, 1 - paddleH()/2/H);
  if (e.key === 'ArrowDown' || e.key === 's') playerPaddle.yFrac = clamp(playerPaddle.yFrac + step, paddleH()/2/H, 1 - paddleH()/2/H);
});

// ── Haptics ──
function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ── Utility ──
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ── UI events ──
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDiff = btn.dataset.diff;
  });
});

document.getElementById('startBtn').addEventListener('click', () => {
  startScreen.classList.remove('show');
  startGame();
});

document.getElementById('playAgainBtn').addEventListener('click', () => {
  victoryScreen.classList.remove('show');
  startGame();
});

document.getElementById('menuBtn').addEventListener('click', () => {
  victoryScreen.classList.remove('show');
  bestScoreDisplay.textContent = bestScore;
  startScreen.classList.add('show');
});
