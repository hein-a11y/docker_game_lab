import { computeDangerMap, updateEnemy } from './ai';
import { renderArena, renderEndingScene } from './renderer';
import { sound } from './sound';
import { ENEMY_SPECS, STAGES } from './stages';
import { loadSaveData, saveSaveData } from './storage';
import {
  BombState,
  COLS,
  DoorState,
  EnemyState,
  EnemyType,
  FlameState,
  GamePhase,
  ParticleState,
  PlayerState,
  PowerUpState,
  PowerUpType,
  ROWS,
  SaveData,
  TILE,
  TileKind,
} from './types';

const BOMB_FUSE = 2.3;
const FLAME_DURATION = 0.45;
const BASE_SPEED = 148;
const SPEED_STEP = 20;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const stageNumEl = document.getElementById('stage-num')!;
const stageNameEl = document.getElementById('stage-name')!;
const livesEl = document.getElementById('lives-val')!;
const scoreEl = document.getElementById('score-val')!;
const bestScoreEl = document.getElementById('best-val')!;
const timerEl = document.getElementById('timer-val')!;
const enemiesLeftEl = document.getElementById('enemies-left')!;
const doorStatusEl = document.getElementById('door-status')!;
const statBombsEl = document.getElementById('stat-bombs')!;
const statFireEl = document.getElementById('stat-fire')!;
const statSpeedEl = document.getElementById('stat-speed')!;
const statShieldEl = document.getElementById('stat-shield')!;
const stageSelectEl = document.getElementById('stage-select') as HTMLSelectElement;
const btnSoundEl = document.getElementById('btn-sound') as HTMLButtonElement;
const btnPauseEl = document.getElementById('btn-pause') as HTMLButtonElement;
const btnStartSelectEl = document.getElementById('btn-start-select') as HTMLButtonElement;
const overlayEl = document.getElementById('overlay')!;
const overlayTitleEl = document.getElementById('overlay-title')!;
const overlayDescEl = document.getElementById('overlay-desc')!;
const btnPrimaryActionEl = document.getElementById('btn-primary-action') as HTMLButtonElement;
const btnSecondaryActionEl = document.getElementById('btn-secondary-action') as HTMLButtonElement;

const keysDown = new Set<string>();

interface CampaignState {
  phase: GamePhase;
  stageIndex: number; // 0..9
  lives: number;
  score: number;
  campaignElapsedSec: number;
  timeLeft: number;
  timeoutAmbushSpawned: boolean;
  grid: TileKind[][];
  door: DoorState;
  powerups: PowerUpState[];
  bombs: BombState[];
  flames: FlameState[];
  enemies: EnemyState[];
  particles: ParticleState[];
  player: PlayerState;
  save: SaveData;
  lastFrame: number;
  hudAcc: number;
}

function createBasePlayer(): PlayerState {
  return {
    x: 1 * TILE + TILE / 2,
    y: 1 * TILE + TILE / 2,
    dirX: 0,
    dirY: 1,
    walkAnim: 0,
    maxBombs: 1,
    activeBombs: 0,
    range: 2,
    speedTier: 0,
    shield: false,
    invulnTimer: 0,
  };
}

const state: CampaignState = {
  phase: 'title',
  stageIndex: 0,
  lives: 3,
  score: 0,
  campaignElapsedSec: 0,
  timeLeft: STAGES[0].timeLimit,
  timeoutAmbushSpawned: false,
  grid: [],
  door: { col: 1, row: 1, revealed: false },
  powerups: [],
  bombs: [],
  flames: [],
  enemies: [],
  particles: [],
  player: createBasePlayer(),
  save: loadSaveData(),
  lastFrame: performance.now(),
  hudAcc: 0,
};

function tileCenter(col: number, row: number): { x: number; y: number } {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

function posToTile(x: number, y: number): { col: number; row: number } {
  return {
    col: Math.max(0, Math.min(COLS - 1, Math.floor(x / TILE))),
    row: Math.max(0, Math.min(ROWS - 1, Math.floor(y / TILE))),
  };
}

function isPlayerSafeCorner(col: number, row: number): boolean {
  return Math.abs(col - 1) + Math.abs(row - 1) <= 1;
}

function populateStageSelect(): void {
  const prev = Number(stageSelectEl.value || '1');
  stageSelectEl.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `Stage ${i}: ${STAGES[i - 1].name}`;
    stageSelectEl.appendChild(opt);
  }
  stageSelectEl.value = String(Math.max(1, Math.min(10, prev)));
}

function showOverlay(
  title: string,
  desc: string,
  primaryLabel: string,
  secondaryLabel: string | null = null
): void {
  overlayTitleEl.textContent = title;
  overlayDescEl.textContent = desc;
  btnPrimaryActionEl.textContent = primaryLabel;
  if (secondaryLabel) {
    btnSecondaryActionEl.textContent = secondaryLabel;
    btnSecondaryActionEl.classList.remove('hidden');
  } else {
    btnSecondaryActionEl.classList.add('hidden');
  }
  overlayEl.classList.remove('hidden');
}

function hideOverlay(): void {
  overlayEl.classList.add('hidden');
}

function buildStageLayout(stageIndex: number): void {
  const cfg = STAGES[stageIndex];
  const grid: TileKind[][] = Array.from({ length: ROWS }, () =>
    Array<TileKind>(COLS).fill(TileKind.Empty)
  );
  const crateCells: { col: number; row: number }[] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        grid[r][c] = TileKind.Wall;
      } else if (r % 2 === 0 && c % 2 === 0) {
        grid[r][c] = TileKind.Wall;
      } else if (!isPlayerSafeCorner(c, r) && Math.random() < cfg.crateDensity) {
        grid[r][c] = TileKind.Crate;
        crateCells.push({ col: c, row: r });
      }
    }
  }

  // Ensure at least 2 crates exist to hold the exit door and stage power-up
  if (crateCells.length < 2) {
    for (const [c, r] of [
      [3, 1],
      [1, 3],
    ]) {
      if (grid[r][c] === TileKind.Empty) {
        grid[r][c] = TileKind.Crate;
        crateCells.push({ col: c, row: r });
      }
    }
  }

  // Shuffle crate candidates for hidden Door + Power-Up(s)
  for (let i = crateCells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [crateCells[i], crateCells[j]] = [crateCells[j], crateCells[i]];
  }

  const doorCell = crateCells[0];
  state.door = { col: doorCell.col, row: doorCell.row, revealed: false };

  const powerups: PowerUpState[] = [];
  if (crateCells[1]) {
    powerups.push({
      col: crateCells[1].col,
      row: crateCells[1].row,
      type: cfg.stagePowerUp,
      revealed: false,
      grace: 0,
    });
  }
  // Optional bonus power-up in larger stages
  if (crateCells[2] && Math.random() < 0.45) {
    const bonusPool: PowerUpType[] = ['bomb', 'fire', 'speed'];
    const bonusType = bonusPool[Math.floor(Math.random() * bonusPool.length)];
    powerups.push({
      col: crateCells[2].col,
      row: crateCells[2].row,
      type: bonusType,
      revealed: false,
      grace: 0,
    });
  }

  // Spawn enemies on open tiles far from (1, 1)
  const openSpawnCells: { col: number; row: number }[] = [];
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (grid[r][c] === TileKind.Empty && Math.abs(c - 1) + Math.abs(r - 1) >= 5) {
        openSpawnCells.push({ col: c, row: r });
      }
    }
  }
  for (let i = openSpawnCells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [openSpawnCells[i], openSpawnCells[j]] = [openSpawnCells[j], openSpawnCells[i]];
  }

  const enemies: EnemyState[] = [];
  let nextEnemyId = 1;
  const order: EnemyType[] = ['balloon', 'ice', 'ghost', 'coin'];

  for (const type of order) {
    const count = cfg.enemies[type];
    for (let i = 0; i < count; i++) {
      let cell = openSpawnCells.pop();
      if (!cell) {
        // Fallback: clear an eligible non-door, non-powerup crate far from spawn
        const fallback = crateCells.find(
          (fc) =>
            Math.abs(fc.col - 1) + Math.abs(fc.row - 1) >= 5 &&
            !(fc.col === state.door.col && fc.row === state.door.row) &&
            !powerups.some((pu) => pu.col === fc.col && pu.row === fc.row) &&
            grid[fc.row][fc.col] === TileKind.Crate
        );
        if (fallback) {
          grid[fallback.row][fallback.col] = TileKind.Empty;
          cell = fallback;
        } else {
          cell = { col: COLS - 2, row: ROWS - 2 };
        }
      }
      const pos = tileCenter(cell.col, cell.row);
      enemies.push({
        id: nextEnemyId++,
        type,
        x: pos.x,
        y: pos.y,
        dirX: 0,
        dirY: 0,
        anim: Math.random() * 6,
        alive: true,
      });
    }
  }

  state.grid = grid;
  state.powerups = powerups;
  state.bombs = [];
  state.flames = [];
  state.enemies = enemies;
  state.particles = [];
  state.timeLeft = cfg.timeLimit;
  state.timeoutAmbushSpawned = false;

  // Reset player position and active bombs while preserving power-ups
  state.player.x = 1 * TILE + TILE / 2;
  state.player.y = 1 * TILE + TILE / 2;
  state.player.dirX = 0;
  state.player.dirY = 1;
  state.player.activeBombs = 0;
  state.player.invulnTimer = 1.4;
}

function startCampaign(startStageNumber = 1, resetPowerUps = true): void {
  state.stageIndex = Math.max(0, Math.min(9, startStageNumber - 1));
  state.lives = 3;
  state.score = 0;
  state.campaignElapsedSec = 0;
  if (resetPowerUps) {
    state.player = createBasePlayer();
  }
  loadCurrentStage();
}

function loadCurrentStage(): void {
  buildStageLayout(state.stageIndex);
  state.phase = 'playing';
  stageSelectEl.value = String(state.stageIndex + 1);
  btnPauseEl.textContent = 'Pause';
  hideOverlay();
  syncHud();
}

function syncHud(): void {
  const cfg = STAGES[state.stageIndex];
  stageNumEl.textContent = `${cfg.stage} / 10`;
  stageNameEl.textContent = cfg.name;
  livesEl.textContent = String(state.lives);
  scoreEl.textContent = String(state.score);
  bestScoreEl.textContent = String(state.save.bestScore);

  const secs = Math.max(0, Math.ceil(state.timeLeft));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  timerEl.textContent =
    state.timeLeft <= 0
      ? 'AMBUSH!'
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  timerEl.style.color = state.timeLeft <= 20 ? '#f43f5e' : '#f8fafc';

  const aliveCount = state.enemies.filter((e) => e.alive).length;
  enemiesLeftEl.textContent = String(aliveCount);
  doorStatusEl.textContent = state.door.revealed ? 'Door Found!' : 'Hidden';
  doorStatusEl.className = state.door.revealed ? 'status-open' : 'status-hidden';

  statBombsEl.textContent = String(state.player.maxBombs);
  statFireEl.textContent = String(state.player.range);
  statSpeedEl.textContent = String(state.player.speedTier + 1);
  statShieldEl.textContent = state.player.shield ? 'Active' : 'None';
}

function updateHighScore(extraUnlockStage?: number): void {
  let dirty = false;
  if (state.score > state.save.bestScore) {
    state.save.bestScore = state.score;
    dirty = true;
  }
  if (extraUnlockStage && extraUnlockStage > state.save.maxUnlockedStage) {
    state.save.maxUnlockedStage = Math.min(10, extraUnlockStage);
    dirty = true;
  }
  if (dirty) {
    saveSaveData(state.save);
    populateStageSelect();
  }
}

function bombAt(col: number, row: number): BombState | undefined {
  return state.bombs.find((b) => b.col === col && b.row === row);
}

function isTileWalkableForPlayer(col: number, row: number): boolean {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  if (state.grid[row][col] !== TileKind.Empty) return false;
  const bomb = bombAt(col, row);
  if (bomb && !bomb.passableForPlayer) return false;
  return true;
}

function movePlayer(dx: number, dy: number, dt: number): void {
  const p = state.player;
  if (dx === 0 && dy === 0) return;

  if (dx !== 0 && dy !== 0) {
    const tile = posToTile(p.x, p.y);
    const canX = isTileWalkableForPlayer(tile.col + Math.sign(dx), tile.row);
    const canY = isTileWalkableForPlayer(tile.col, tile.row + Math.sign(dy));
    if (canX && !canY) dy = 0;
    else if (canY && !canX) dx = 0;
    else dy = 0;
  }

  p.dirX = Math.sign(dx);
  p.dirY = Math.sign(dy);
  p.walkAnim += dt;

  const speed = BASE_SPEED + p.speedTier * SPEED_STEP;
  const step = speed * dt;
  const half = TILE * 0.4;

  if (dx !== 0) {
    const dir = Math.sign(dx);
    const curRow = Math.floor(p.y / TILE);
    const curCol = Math.floor(p.x / TILE);

    let targetRow = curRow;
    if (!isTileWalkableForPlayer(curCol + dir, curRow)) {
      const upOpen = isTileWalkableForPlayer(curCol + dir, curRow - 1);
      const downOpen = isTileWalkableForPlayer(curCol + dir, curRow + 1);
      const upCenter = (curRow - 1) * TILE + TILE / 2;
      const downCenter = (curRow + 1) * TILE + TILE / 2;
      if (upOpen && Math.abs(p.y - upCenter) <= TILE * 0.85) targetRow = curRow - 1;
      else if (downOpen && Math.abs(p.y - downCenter) <= TILE * 0.85) targetRow = curRow + 1;
    }

    const desiredY = targetRow * TILE + TILE / 2;
    const diffY = desiredY - p.y;
    if (Math.abs(diffY) > 0.5) {
      p.y += Math.sign(diffY) * Math.min(Math.abs(diffY), step * 1.1);
    } else {
      p.y = desiredY;
    }

    const alignedRow = Math.floor(p.y / TILE);
    const alignedCenter = alignedRow * TILE + TILE / 2;
    const aligned = Math.abs(p.y - alignedCenter) <= TILE * 0.25;
    const nextCol = Math.floor((p.x + dir * (half + step)) / TILE);
    const curTileCol = Math.floor(p.x / TILE);

    if (nextCol === curTileCol || (aligned && isTileWalkableForPlayer(nextCol, alignedRow))) {
      p.x += dir * step;
    } else {
      const edgeX = curTileCol * TILE + (dir > 0 ? TILE - half : half);
      p.x = dir > 0 ? Math.min(p.x + step, edgeX) : Math.max(p.x - step, edgeX);
    }
  } else if (dy !== 0) {
    const dir = Math.sign(dy);
    const curCol = Math.floor(p.x / TILE);
    const curRow = Math.floor(p.y / TILE);

    let targetCol = curCol;
    if (!isTileWalkableForPlayer(curCol, curRow + dir)) {
      const leftOpen = isTileWalkableForPlayer(curCol - 1, curRow + dir);
      const rightOpen = isTileWalkableForPlayer(curCol + 1, curRow + dir);
      const leftCenter = (curCol - 1) * TILE + TILE / 2;
      const rightCenter = (curCol + 1) * TILE + TILE / 2;
      if (leftOpen && Math.abs(p.x - leftCenter) <= TILE * 0.85) targetCol = curCol - 1;
      else if (rightOpen && Math.abs(p.x - rightCenter) <= TILE * 0.85) targetCol = curCol + 1;
    }

    const desiredX = targetCol * TILE + TILE / 2;
    const diffX = desiredX - p.x;
    if (Math.abs(diffX) > 0.5) {
      p.x += Math.sign(diffX) * Math.min(Math.abs(diffX), step * 1.1);
    } else {
      p.x = desiredX;
    }

    const alignedCol = Math.floor(p.x / TILE);
    const alignedCenter = alignedCol * TILE + TILE / 2;
    const aligned = Math.abs(p.x - alignedCenter) <= TILE * 0.25;
    const nextRow = Math.floor((p.y + dir * (half + step)) / TILE);
    const curTileRow = Math.floor(p.y / TILE);

    if (nextRow === curTileRow || (aligned && isTileWalkableForPlayer(alignedCol, nextRow))) {
      p.y += dir * step;
    } else {
      const edgeY = curTileRow * TILE + (dir > 0 ? TILE - half : half);
      p.y = dir > 0 ? Math.min(p.y + step, edgeY) : Math.max(p.y - step, edgeY);
    }
  }

  for (const bomb of state.bombs) {
    if (!bomb.passableForPlayer) continue;
    const bCenter = tileCenter(bomb.col, bomb.row);
    if (Math.abs(p.x - bCenter.x) > TILE * 0.78 || Math.abs(p.y - bCenter.y) > TILE * 0.78) {
      bomb.passableForPlayer = false;
    }
  }
}

function placeBomb(): void {
  if (state.phase !== 'playing') return;
  const p = state.player;
  if (p.activeBombs >= p.maxBombs) return;

  const { col, row } = posToTile(p.x, p.y);
  if (state.grid[row][col] !== TileKind.Empty || bombAt(col, row)) return;

  state.bombs.push({
    col,
    row,
    range: p.range,
    timer: BOMB_FUSE,
    passableForPlayer: true,
  });
  p.activeBombs++;
  sound.placeBomb();
}

function spawnParticles(x: number, y: number, color: string, count = 10): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 45 + Math.random() * 140;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.32 + Math.random() * 0.25,
      maxLife: 0.57,
      color,
      size: 3 + Math.random() * 4,
    });
  }
}

function detonateBomb(initial: BombState): void {
  const queue: BombState[] = [initial];
  const flameMap = new Map<string, FlameState>();

  while (queue.length > 0) {
    const bomb = queue.shift()!;
    const idx = state.bombs.indexOf(bomb);
    if (idx !== -1) state.bombs.splice(idx, 1);

    if (state.player.activeBombs > 0) state.player.activeBombs--;

    const addFlame = (col: number, row: number, kind: FlameState['kind']) => {
      flameMap.set(`${col},${row}`, { col, row, kind, timer: FLAME_DURATION });
    };

    addFlame(bomb.col, bomb.row, 'center');

    const dirs: { dc: number; dr: number; kind: FlameState['kind'] }[] = [
      { dc: 1, dr: 0, kind: 'h' },
      { dc: -1, dr: 0, kind: 'h' },
      { dc: 0, dr: 1, kind: 'v' },
      { dc: 0, dr: -1, kind: 'v' },
    ];

    for (const { dc, dr, kind } of dirs) {
      for (let step = 1; step <= bomb.range; step++) {
        const nc = bomb.col + dc * step;
        const nr = bomb.row + dr * step;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) break;

        const cell = state.grid[nr][nc];
        if (cell === TileKind.Wall) break;

        if (cell === TileKind.Crate) {
          state.grid[nr][nc] = TileKind.Empty;
          addFlame(nc, nr, kind);
          const center = tileCenter(nc, nr);
          spawnParticles(center.x, center.y, '#a1a1aa', 12);
          state.score += 10;

          if (state.door.col === nc && state.door.row === nr && !state.door.revealed) {
            state.door.revealed = true;
            sound.doorFound();
            spawnParticles(center.x, center.y, '#facc15', 16);
          }

          for (const pu of state.powerups) {
            if (pu.col === nc && pu.row === nr && !pu.revealed) {
              pu.revealed = true;
              pu.grace = FLAME_DURATION + 0.15;
            }
          }
          break;
        }

        addFlame(nc, nr, kind);

        // Burn revealed power-ups without grace
        for (let i = state.powerups.length - 1; i >= 0; i--) {
          const pu = state.powerups[i];
          if (pu.revealed && pu.col === nc && pu.row === nr && pu.grace <= 0) {
            state.powerups.splice(i, 1);
          }
        }

        const other = bombAt(nc, nr);
        if (other && !queue.includes(other)) {
          queue.push(other);
        }
      }
    }
  }

  for (const f of flameMap.values()) {
    state.flames.push(f);
  }
  sound.explode();
  syncHud();
}

function damagePlayer(): void {
  const p = state.player;
  if (p.invulnTimer > 0 || state.phase !== 'playing') return;

  if (p.shield) {
    p.shield = false;
    p.invulnTimer = 1.8;
    spawnParticles(p.x, p.y, '#d8b4fe', 16);
    sound.shieldHit();
    syncHud();
    return;
  }

  state.lives--;
  sound.die();
  spawnParticles(p.x, p.y, '#38bdf8', 22);

  if (state.lives > 0) {
    state.phase = 'life-lost';
    syncHud();
    showOverlay(
      'Bomberman Hit!',
      `You have ${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left. Your power-ups are kept!`,
      `Retry Stage ${state.stageIndex + 1}`
    );
  } else {
    state.phase = 'game-over';
    updateHighScore();
    syncHud();
    showOverlay(
      'Game Over',
      `Stopped at Stage ${state.stageIndex + 1} (${STAGES[state.stageIndex].name}). Final Score: ${state.score}`,
      `Continue Stage ${state.stageIndex + 1}`,
      'Restart Stage 1'
    );
  }
}

function handleStageClear(): void {
  const cfg = STAGES[state.stageIndex];
  const remainingEnemies = state.enemies.filter((e) => e.alive).length;
  const timeBonus = Math.ceil(state.timeLeft) * 5;
  const wipeBonus = remainingEnemies === 0 ? 1000 : 0;
  state.score += 500 + timeBonus + wipeBonus;

  if (state.stageIndex === STAGES.length - 1) {
    // Stage 10 cleared -> Bomberman meets the Princess!
    state.phase = 'ending';
    state.save.clears++;
    if (
      state.save.bestClearSeconds === null ||
      state.campaignElapsedSec < state.save.bestClearSeconds
    ) {
      state.save.bestClearSeconds = Math.round(state.campaignElapsedSec);
    }
    updateHighScore(10);
    saveSaveData(state.save);
    syncHud();
    sound.victoryFanfare();
    showOverlay(
      'Princess Rescued!',
      `All 10 stages cleared! Bomberman reunited with the Princess. Score: ${state.score} | Time: ${Math.round(state.campaignElapsedSec)}s`,
      'Play Again from Stage 1'
    );
    return;
  }

  state.phase = 'stage-clear';
  updateHighScore(cfg.stage + 1);
  syncHud();
  sound.stageClear();

  const bonusNote =
    wipeBonus > 0
      ? `Full-clear bonus +${wipeBonus}! `
      : 'Speedrun exit! ';
  showOverlay(
    `Stage ${cfg.stage} Clear!`,
    `${bonusNote}Time bonus +${timeBonus}. Score: ${state.score}`,
    `Enter Stage ${cfg.stage + 1}`
  );
}

function spawnTimeoutAmbush(): void {
  if (state.timeoutAmbushSpawned) return;
  state.timeoutAmbushSpawned = true;
  const spots = [
    { col: COLS - 2, row: ROWS - 2 },
    { col: COLS - 2, row: 1 },
  ];
  let nextId = state.enemies.length + 100;
  for (const s of spots) {
    if (state.grid[s.row][s.col] === TileKind.Crate) {
      state.grid[s.row][s.col] = TileKind.Empty;
    }
    const pos = tileCenter(s.col, s.row);
    state.enemies.push({
      id: nextId++,
      type: 'coin',
      x: pos.x,
      y: pos.y,
      dirX: 0,
      dirY: 0,
      anim: 0,
      alive: true,
    });
  }
}

function getPlayerInput(): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  if (keysDown.has('KeyW') || keysDown.has('ArrowUp')) dy -= 1;
  if (keysDown.has('KeyS') || keysDown.has('ArrowDown')) dy += 1;
  if (keysDown.has('KeyA') || keysDown.has('ArrowLeft')) dx -= 1;
  if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) dx += 1;
  return { dx, dy };
}

function update(dt: number): void {
  if (state.phase !== 'playing') return;

  state.campaignElapsedSec += dt;
  state.timeLeft = Math.max(0, state.timeLeft - dt);
  if (state.timeLeft <= 0) {
    spawnTimeoutAmbush();
  }

  const p = state.player;
  if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);

  const { dx, dy } = getPlayerInput();
  movePlayer(dx, dy, dt);

  const pTile = posToTile(p.x, p.y);

  // Pick up revealed power-ups
  for (let i = state.powerups.length - 1; i >= 0; i--) {
    const pu = state.powerups[i];
    if (pu.grace > 0) pu.grace = Math.max(0, pu.grace - dt);
    if (pu.revealed && pu.col === pTile.col && pu.row === pTile.row) {
      if (pu.type === 'bomb') p.maxBombs = Math.min(6, p.maxBombs + 1);
      else if (pu.type === 'fire') p.range = Math.min(6, p.range + 1);
      else if (pu.type === 'speed') p.speedTier = Math.min(4, p.speedTier + 1);
      else if (pu.type === 'shield') p.shield = true;

      state.score += 150;
      const c = tileCenter(pu.col, pu.row);
      spawnParticles(c.x, c.y, '#facc15', 10);
      sound.powerup();
      state.powerups.splice(i, 1);
      syncHud();
    }
  }

  // Check exit door entry (Speedrun rule: enter anytime once revealed)
  if (state.door.revealed && pTile.col === state.door.col && pTile.row === state.door.row) {
    handleStageClear();
    return;
  }

  // Update bombs
  for (const b of state.bombs) b.timer -= dt;
  const expired = state.bombs.filter((b) => b.timer <= 0);
  for (const b of expired) {
    if (state.bombs.includes(b)) detonateBomb(b);
  }

  // Update enemies (bots never place bombs)
  const danger = computeDangerMap(state.grid, state.bombs, state.flames);
  for (const e of state.enemies) {
    if (!e.alive) continue;
    updateEnemy(e, dt, p, state.grid, state.bombs, danger);

    // Contact check with player
    const distSq = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
    if (distSq < (TILE * 0.56) * (TILE * 0.56)) {
      damagePlayer();
      if (state.phase !== 'playing') return;
    }
  }

  // Update flames & hits
  for (let i = state.flames.length - 1; i >= 0; i--) {
    const f = state.flames[i];
    f.timer -= dt;

    const pt = posToTile(p.x, p.y);
    if (pt.col === f.col && pt.row === f.row) {
      damagePlayer();
      if (state.phase !== 'playing') return;
    }

    for (const e of state.enemies) {
      if (!e.alive) continue;
      const et = posToTile(e.x, e.y);
      if (et.col === f.col && et.row === f.row) {
        e.alive = false;
        state.score += ENEMY_SPECS[e.type].points;
        spawnParticles(e.x, e.y, ENEMY_SPECS[e.type].color, 16);
        sound.enemyDefeat();
        syncHud();
      }
    }

    if (f.timer <= 0) state.flames.splice(i, 1);
  }

  // Update particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
    pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }

  state.hudAcc += dt;
  if (state.hudAcc >= 0.25) {
    state.hudAcc = 0;
    syncHud();
  }
}

function togglePause(): void {
  if (state.phase === 'playing') {
    state.phase = 'paused';
    btnPauseEl.textContent = 'Resume';
    showOverlay('Paused', 'Press P or Resume to continue.', 'Resume');
  } else if (state.phase === 'paused') {
    state.phase = 'playing';
    btnPauseEl.textContent = 'Pause';
    hideOverlay();
  }
}

function handlePrimaryOverlayAction(): void {
  if (state.phase === 'title' || state.phase === 'ending') {
    startCampaign(1, true);
  } else if (state.phase === 'paused') {
    togglePause();
  } else if (state.phase === 'life-lost') {
    loadCurrentStage();
  } else if (state.phase === 'stage-clear') {
    state.stageIndex++;
    loadCurrentStage();
  } else if (state.phase === 'game-over') {
    // Continue current stage: 3 fresh lives, score reset, keep power-ups
    state.lives = 3;
    state.score = 0;
    loadCurrentStage();
  }
}

function handleSecondaryOverlayAction(): void {
  if (state.phase === 'game-over') {
    startCampaign(1, true);
  }
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - state.lastFrame) / 1000);
  state.lastFrame = now;
  update(dt);

  const nowSec = now / 1000;
  if (state.phase === 'ending') {
    renderEndingScene(ctx, canvas.width, canvas.height, nowSec);
  } else {
    renderArena(
      ctx,
      canvas.width,
      canvas.height,
      state.grid,
      state.door,
      state.powerups,
      state.bombs,
      state.flames,
      state.player,
      state.enemies,
      state.particles,
      nowSec
    );
  }
  requestAnimationFrame(frame);
}

// Event bindings
document.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
  keysDown.add(e.code);
  if (e.repeat) return;

  if (e.code === 'KeyP' || e.code === 'Escape') {
    togglePause();
    return;
  }
  if (e.code === 'KeyR' && state.phase === 'playing') {
    loadCurrentStage();
    return;
  }

  if (e.code === 'Space' || e.code === 'Enter') {
    if (state.phase === 'playing') {
      placeBomb();
    } else if (!overlayEl.classList.contains('hidden')) {
      handlePrimaryOverlayAction();
    }
  }
});

document.addEventListener('keyup', (e) => {
  keysDown.delete(e.code);
});

btnPrimaryActionEl.addEventListener('click', handlePrimaryOverlayAction);
btnSecondaryActionEl.addEventListener('click', handleSecondaryOverlayAction);
btnPauseEl.addEventListener('click', togglePause);

btnSoundEl.addEventListener('click', () => {
  const on = sound.toggle();
  btnSoundEl.textContent = on ? 'Sound: On' : 'Sound: Off';
  btnSoundEl.setAttribute('aria-pressed', String(on));
});

stageSelectEl.addEventListener('change', () => {
  stageSelectEl.blur();
});

btnStartSelectEl.addEventListener('click', () => {
  const selected = Number(stageSelectEl.value || '1');
  btnStartSelectEl.blur();
  startCampaign(selected, true);
});

// Initialize title view with Stage 1 preview
populateStageSelect();
buildStageLayout(0);
syncHud();
showOverlay(
  'Bomb Man: 10-Stage Quest',
  'Blast bricks to uncover the hidden Exit Door and reach Stage 10 to rescue the Princess!',
  'Start Stage 1'
);
requestAnimationFrame(frame);
