import {
  BombState,
  COLS,
  DoorState,
  EnemyState,
  FlameState,
  ParticleState,
  PlayerState,
  PowerUpState,
  ROWS,
  TILE,
  TileKind,
} from './types';

const FLAME_DURATION = 0.45;

export function renderArena(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  grid: TileKind[][],
  door: DoorState,
  powerups: PowerUpState[],
  bombs: BombState[],
  flames: FlameState[],
  player: PlayerState,
  enemies: EnemyState[],
  particles: ParticleState[],
  nowSec: number
): void {
  ctx.clearRect(0, 0, width, height);

  // Classic NES green turf & walls
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE;
      const y = r * TILE;
      ctx.fillStyle = (r + c) % 2 === 0 ? '#1b8a1b' : '#177a17';
      ctx.fillRect(x, y, TILE, TILE);

      const cell = grid[r][c];
      if (cell === TileKind.Wall) {
        drawStoneWall(ctx, x, y);
      } else if (cell === TileKind.Crate) {
        drawBrickCrate(ctx, x, y);
      }
    }
  }

  // Revealed Exit Door
  if (door.revealed) {
    drawExitDoor(ctx, door.col, door.row, nowSec);
  }

  // Revealed Power-ups
  for (const pu of powerups) {
    if (pu.revealed) {
      drawPowerUp(ctx, pu, nowSec);
    }
  }

  // Bombs
  for (const b of bombs) {
    drawBomb(ctx, b, nowSec);
  }

  // Flames
  for (const f of flames) {
    drawFlame(ctx, f);
  }

  // Player (Bomberman)
  if (player.invulnTimer <= 0 || Math.floor(player.invulnTimer * 14) % 2 === 0) {
    drawBomberman(ctx, player);
  }

  // Enemies (Balloon, Ice, Ghost, Coin)
  for (const e of enemies) {
    if (!e.alive) continue;
    const tileCol = Math.floor(e.x / TILE);
    const tileRow = Math.floor(e.y / TILE);
    const insideCrate =
      tileRow >= 0 &&
      tileRow < ROWS &&
      tileCol >= 0 &&
      tileCol < COLS &&
      grid[tileRow][tileCol] === TileKind.Crate;
    drawEnemy(ctx, e, insideCrate, nowSec);
  }

  // Particles
  for (const pt of particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}

function drawStoneWall(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#9ca3af';
  ctx.fillRect(x, y, TILE, TILE);
  // Top & left bright bevel
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(x, y, TILE, 4);
  ctx.fillRect(x, y, 4, TILE);
  // Bottom & right dark bevel
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(x, y + TILE - 4, TILE, 4);
  ctx.fillRect(x + TILE - 4, y, 4, TILE);
  // Inner face
  ctx.fillStyle = '#b4bac4';
  ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
}

function drawBrickCrate(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#52525b';
  ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);

  ctx.fillStyle = '#a1a1aa';
  const rows = 3;
  const rowH = Math.floor((TILE - 6) / rows);
  for (let r = 0; r < rows; r++) {
    const by = y + 2 + r * (rowH + 1);
    if (r % 2 === 0) {
      ctx.fillRect(x + 2, by, TILE / 2 - 3, rowH - 1);
      ctx.fillRect(x + TILE / 2 + 1, by, TILE / 2 - 3, rowH - 1);
    } else {
      ctx.fillRect(x + 2, by, TILE / 4 - 2, rowH - 1);
      ctx.fillRect(x + TILE / 4 + 2, by, TILE / 2 - 2, rowH - 1);
      ctx.fillRect(x + (TILE * 3) / 4 + 2, by, TILE / 4 - 4, rowH - 1);
    }
  }
}

function drawExitDoor(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  nowSec: number
): void {
  const x = col * TILE;
  const y = row * TILE;
  const glow = 0.55 + Math.sin(nowSec * 5) * 0.25;

  ctx.fillStyle = `rgba(250, 204, 21, ${glow * 0.35})`;
  ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);

  // Stone frame + wooden arch door
  ctx.fillStyle = '#78350f';
  ctx.beginPath();
  ctx.roundRect(x + 7, y + 5, TILE - 14, TILE - 8, [12, 12, 2, 2]);
  ctx.fill();

  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.roundRect(x + 10, y + 8, TILE - 20, TILE - 13, [9, 9, 1, 1]);
  ctx.fill();

  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x + 7, y + 5, TILE - 14, TILE - 8, [12, 12, 2, 2]);
  ctx.stroke();

  // Doorknob
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(x + TILE - 14, y + TILE / 2 + 2, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawPowerUp(
  ctx: CanvasRenderingContext2D,
  pu: PowerUpState,
  nowSec: number
): void {
  const x = pu.col * TILE + 6;
  const y = pu.row * TILE + 6 + Math.sin(nowSec * 4) * 1.5;
  const size = TILE - 12;

  const colors: Record<PowerUpState['type'], string> = {
    bomb: '#0284c7',
    fire: '#ea580c',
    speed: '#16a34a',
    shield: '#9333ea',
  };
  const labels: Record<PowerUpState['type'], string> = {
    bomb: 'B+',
    fire: 'F+',
    speed: 'S+',
    shield: 'SH',
  };

  ctx.fillStyle = colors[pu.type];
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 6);
  ctx.fill();

  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(labels[pu.type], x + size / 2, y + size / 2 + 1);
}

function drawBomb(ctx: CanvasRenderingContext2D, b: BombState, nowSec: number): void {
  const cx = b.col * TILE + TILE / 2;
  const cy = b.row * TILE + TILE / 2;
  const pulse = 1 + Math.sin(nowSec * (b.timer < 0.8 ? 22 : 10)) * 0.1;
  const r = 14 * pulse;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 13, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = b.timer < 0.65 ? '#991b1b' : '#111827';
  ctx.beginPath();
  ctx.arc(cx, cy + 2, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Fuse & spark
  ctx.strokeStyle = '#e5e7eb';
  ctx.beginPath();
  ctx.moveTo(cx + 4, cy - r + 4);
  ctx.lineTo(cx + 9, cy - r - 3);
  ctx.stroke();

  ctx.fillStyle = Math.floor(nowSec * 18) % 2 === 0 ? '#fde047' : '#f97316';
  ctx.beginPath();
  ctx.arc(cx + 10, cy - r - 4, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlame(ctx: CanvasRenderingContext2D, f: FlameState): void {
  const x = f.col * TILE;
  const y = f.row * TILE;
  const alpha = Math.min(1, f.timer / FLAME_DURATION + 0.25);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fb923c';
  if (f.kind === 'center') {
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
  } else if (f.kind === 'h') {
    ctx.fillRect(x, y + 6, TILE, TILE - 12);
  } else {
    ctx.fillRect(x + 6, y, TILE - 12, TILE);
  }

  ctx.fillStyle = '#fef3c7';
  if (f.kind === 'center') {
    ctx.fillRect(x + 9, y + 9, TILE - 18, TILE - 18);
  } else if (f.kind === 'h') {
    ctx.fillRect(x, y + 14, TILE, TILE - 28);
  } else {
    ctx.fillRect(x + 14, y, TILE - 28, TILE);
  }
  ctx.restore();
}

function drawBomberman(ctx: CanvasRenderingContext2D, p: PlayerState): void {
  const stepSwing = Math.sin(p.walkAnim * 14) * 3;

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 16, 12, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shield aura
  if (p.shield) {
    ctx.strokeStyle = '#d8b4fe';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 19, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Feet
  ctx.fillStyle = '#ec4899';
  ctx.beginPath();
  ctx.ellipse(p.x - 5, p.y + 13 + stepSwing * 0.4, 4.5, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(p.x + 5, p.y + 13 - stepSwing * 0.4, 4.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Blue tunic
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.roundRect(p.x - 9, p.y + 1, 18, 12, 5);
  ctx.fill();

  // Belt
  ctx.fillStyle = '#111827';
  ctx.fillRect(p.x - 9, p.y + 7, 18, 2.5);

  // White head/helmet
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(p.x, p.y - 4, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Pink antenna pom
  ctx.fillStyle = '#ec4899';
  ctx.beginPath();
  ctx.arc(p.x, p.y - 16, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Face visor
  const vx = p.x + p.dirX * 3;
  const vy = p.y - 3 + p.dirY * 2;
  ctx.fillStyle = '#fed7aa';
  ctx.beginPath();
  ctx.roundRect(vx - 7, vy - 5, 14, 9, 3);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#111827';
  ctx.fillRect(vx - 4, vy - 3, 2.5, 4);
  ctx.fillRect(vx + 1.5, vy - 3, 2.5, 4);
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  e: EnemyState,
  insideCrate: boolean,
  nowSec: number
): void {
  const bob = Math.sin(e.anim * 8) * 2;
  ctx.save();
  if (insideCrate) ctx.globalAlpha = 0.65;

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 15, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (e.type === 'balloon') {
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(e.x, e.y + bob, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#431407';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eyes & grin
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(e.x - 6, e.y - 5 + bob, 4, 5);
    ctx.fillRect(e.x + 2, e.y - 5 + bob, 4, 5);
    ctx.fillStyle = '#111827';
    ctx.fillRect(e.x - 5, e.y - 3 + bob, 2, 3);
    ctx.fillRect(e.x + 3, e.y - 3 + bob, 2, 3);
    ctx.fillRect(e.x - 5, e.y + 4 + bob, 10, 3);
  } else if (e.type === 'ice') {
    // Blue teardrop / onion ice creature
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(e.x, e.y - 16 + bob);
    ctx.quadraticCurveTo(e.x + 15, e.y - 2 + bob, e.x + 13, e.y + 10 + bob);
    ctx.quadraticCurveTo(e.x, e.y + 16 + bob, e.x - 13, e.y + 10 + bob);
    ctx.quadraticCurveTo(e.x - 15, e.y - 2 + bob, e.x, e.y - 16 + bob);
    ctx.fill();
    ctx.strokeStyle = '#082f49';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cute icy eyes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(e.x - 6, e.y - 1 + bob, 4, 4);
    ctx.fillRect(e.x + 2, e.y - 1 + bob, 4, 4);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(e.x - 5, e.y + bob, 2, 3);
    ctx.fillRect(e.x + 3, e.y + bob, 2, 3);
  } else if (e.type === 'ghost') {
    // Red phantom
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(e.x, e.y - 2 + bob, 13, Math.PI, 0);
    ctx.lineTo(e.x + 13, e.y + 12 + bob);
    ctx.lineTo(e.x + 6, e.y + 8 + bob);
    ctx.lineTo(e.x, e.y + 13 + bob);
    ctx.lineTo(e.x - 6, e.y + 8 + bob);
    ctx.lineTo(e.x - 13, e.y + 12 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#450a0a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(e.x - 4.5, e.y - 3 + bob, 3.2, 0, Math.PI * 2);
    ctx.arc(e.x + 4.5, e.y - 3 + bob, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.fillRect(e.x - 5.5, e.y - 4 + bob, 2, 2);
    ctx.fillRect(e.x + 3.5, e.y - 4 + bob, 2, 2);
    // O-mouth
    ctx.beginPath();
    ctx.arc(e.x, e.y + 4 + bob, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Coin (Gold spinning emblem)
    const spinScale = 0.72 + Math.abs(Math.cos(nowSec * 5 + e.id)) * 0.28;
    ctx.translate(e.x, e.y + bob);
    ctx.scale(spinScale, 1);
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.stroke();

    // Fierce eyes
    ctx.fillStyle = '#713f12';
    ctx.fillRect(-5, -3, 3, 5);
    ctx.fillRect(2, -3, 3, 5);
  }

  ctx.restore();
}

export function renderEndingScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  nowSec: number
): void {
  // Royal castle courtyard background
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#1e1b4b');
  grad.addColorStop(0.65, '#312e81');
  grad.addColorStop(1, '#15803d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Twinkling stars
  for (let i = 0; i < 24; i++) {
    const sx = (i * 97 + 41) % width;
    const sy = (i * 53 + 23) % (height * 0.55);
    const alpha = 0.4 + Math.abs(Math.sin(nowSec * 2 + i)) * 0.6;
    ctx.fillStyle = `rgba(254, 240, 138, ${alpha})`;
    ctx.fillRect(sx, sy, 3, 3);
  }

  // Red royal carpet
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(width / 2 - 140, height * 0.68, 280, height * 0.32);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 3;
  ctx.strokeRect(width / 2 - 140, height * 0.68, 280, height * 0.32);

  // Bomberman walking toward Princess
  const bm: PlayerState = {
    x: width / 2 - 42,
    y: height * 0.64,
    dirX: 1,
    dirY: 0,
    walkAnim: nowSec * 0.5,
    maxBombs: 1,
    activeBombs: 0,
    range: 2,
    speedTier: 0,
    shield: false,
    invulnTimer: 0,
  };
  drawBomberman(ctx, bm);

  // Princess sprite
  const px = width / 2 + 44;
  const py = height * 0.64;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(px, py + 17, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pink gown
  ctx.fillStyle = '#ec4899';
  ctx.beginPath();
  ctx.moveTo(px, py - 2);
  ctx.lineTo(px + 15, py + 16);
  ctx.lineTo(px - 15, py + 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fbcfe8';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Golden hair & head
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(px, py - 8, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fed7aa';
  ctx.beginPath();
  ctx.arc(px - 1, py - 7, 8.5, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(px - 5, py - 9, 2, 3.5);
  ctx.fillRect(px - 1, py - 9, 2, 3.5);

  // Crown
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.moveTo(px - 7, py - 17);
  ctx.lineTo(px - 5, py - 24);
  ctx.lineTo(px, py - 19);
  ctx.lineTo(px + 5, py - 24);
  ctx.lineTo(px + 7, py - 17);
  ctx.closePath();
  ctx.fill();

  // Floating hearts
  for (let i = 0; i < 4; i++) {
    const t = (nowSec * 0.6 + i * 0.25) % 1;
    const hx = width / 2 + Math.sin(nowSec * 2 + i * 2) * 18;
    const hy = py - 26 - t * 65;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = '#fb7185';
    ctx.font = 'bold 20px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('♥', hx, hy);
  }
  ctx.globalAlpha = 1;
}
