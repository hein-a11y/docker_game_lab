(() => {
  'use strict';

  const COLS = 15;
  const ROWS = 13;
  const TILE = 44;
  const TARGET_WINS = 3;
  const ROUND_SECONDS = 150;
  const BOMB_FUSE = 2.3;
  const FLAME_DURATION = 0.45;
  const BASE_SPEED = 148;
  const SPEED_STEP = 22;

  const TILE_EMPTY = 0;
  const TILE_WALL = 1;
  const TILE_CRATE = 2;

  const SPAWN_CORNERS = [
    { col: 1, row: 1, name: 'Player 1', color: '#38bdf8', visor: '#082f49' },
    { col: 13, row: 11, name: 'Player 2', color: '#f43f5e', visor: '#4c0519' },
    { col: 13, row: 1, name: 'Bot Amber', color: '#f59e0b', visor: '#451a03' },
    { col: 1, row: 11, name: 'Bot Emerald', color: '#22c55e', visor: '#052e16' },
  ];

  // Spiral order for Sudden Death walls
  const SUDDEN_DEATH_CELLS = buildSpiralOrder();

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const modeSelect = document.getElementById('mode-select');
  const aiSelect = document.getElementById('ai-select');
  const btnNewMatch = document.getElementById('btn-new-match');
  const btnPause = document.getElementById('btn-pause');
  const btnSound = document.getElementById('btn-sound');
  const roundNumEl = document.getElementById('round-num');
  const targetWinsEl = document.getElementById('target-wins');
  const roundTimerEl = document.getElementById('round-timer');
  const playersHudEl = document.getElementById('players-hud');
  const p2ControlsRow = document.getElementById('p2-controls-row');
  const tipEl = document.querySelector('.tip');
  const overlayEl = document.getElementById('overlay');
  const overlayTitleEl = document.getElementById('overlay-title');
  const overlayDescEl = document.getElementById('overlay-desc');
  const btnOverlayAction = document.getElementById('btn-overlay-action');

  targetWinsEl.textContent = String(TARGET_WINS);

  // Lightweight Web Audio synthesizer (no external audio assets required)
  const Sound = (() => {
    let audioCtx = null;
    let enabled = true;

    function ensureCtx() {
      if (!enabled) return null;
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audioCtx = new Ctx();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      return audioCtx;
    }

    function tone(freq, duration, type = 'square', gainVal = 0.06, slideTo = null) {
      const ac = ensureCtx();
      if (!ac) return;
      const now = ac.currentTime;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
      }
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(now);
      osc.stop(now + duration);
    }

    return {
      isEnabled: () => enabled,
      toggle() {
        enabled = !enabled;
        return enabled;
      },
      placeBomb: () => tone(220, 0.09, 'triangle', 0.08, 120),
      explode: () => tone(135, 0.28, 'sawtooth', 0.11, 34),
      powerup: () => {
        tone(520, 0.08, 'sine', 0.07, 780);
        setTimeout(() => tone(780, 0.11, 'sine', 0.07, 1040), 55);
      },
      shieldHit: () => tone(420, 0.18, 'triangle', 0.09, 190),
      die: () => tone(300, 0.35, 'sawtooth', 0.09, 70),
      win: () => {
        [523, 659, 784, 1046].forEach((f, i) => {
          setTimeout(() => tone(f, 0.14, 'triangle', 0.07), i * 80);
        });
      },
    };
  })();

  const keysDown = new Set();

  const state = {
    mode: '1p-bots',
    aiDifficulty: 'normal',
    round: 1,
    scores: [],
    grid: [],
    players: [],
    bombs: [],
    flames: [],
    powerups: [],
    particles: [],
    roundTimeLeft: ROUND_SECONDS,
    suddenDeathIndex: 0,
    suddenDeathTimer: 0,
    paused: false,
    roundEnded: false,
    matchEnded: false,
    lastFrame: performance.now(),
    hudSyncAcc: 0,
  };

  function buildSpiralOrder() {
    const cells = [];
    let top = 1, bottom = ROWS - 2, left = 1, right = COLS - 2;
    while (top <= bottom && left <= right) {
      for (let c = left; c <= right; c++) cells.push({ col: c, row: top });
      top++;
      for (let r = top; r <= bottom; r++) cells.push({ col: right, row: r });
      right--;
      if (top <= bottom) {
        for (let c = right; c >= left; c--) cells.push({ col: c, row: bottom });
        bottom--;
      }
      if (left <= right) {
        for (let r = bottom; r >= top; r--) cells.push({ col: left, row: r });
        left++;
      }
    }
    return cells;
  }

  function tileCenter(col, row) {
    return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
  }

  function posToTile(x, y) {
    return {
      col: Math.max(0, Math.min(COLS - 1, Math.floor(x / TILE))),
      row: Math.max(0, Math.min(ROWS - 1, Math.floor(y / TILE))),
    };
  }

  function isCornerClearZone(col, row) {
    for (const s of SPAWN_CORNERS) {
      const dist = Math.abs(col - s.col) + Math.abs(row - s.row);
      if (dist <= 1) return true;
    }
    return false;
  }

  function createGrid() {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(TILE_EMPTY));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
          grid[r][c] = TILE_WALL;
        } else if (r % 2 === 0 && c % 2 === 0) {
          grid[r][c] = TILE_WALL;
        } else if (!isCornerClearZone(c, r) && Math.random() < 0.68) {
          grid[r][c] = TILE_CRATE;
        }
      }
    }
    return grid;
  }

  function getRosterConfig(mode) {
    if (mode === '1p-bots') {
      return [
        { id: 0, isHuman: true, controlSet: 'p1-single', label: 'Player 1' },
        { id: 1, isHuman: false, controlSet: 'ai', label: 'Bot Crimson' },
        { id: 2, isHuman: false, controlSet: 'ai', label: 'Bot Amber' },
        { id: 3, isHuman: false, controlSet: 'ai', label: 'Bot Emerald' },
      ];
    }
    if (mode === '2p-bots') {
      return [
        { id: 0, isHuman: true, controlSet: 'p1', label: 'Player 1' },
        { id: 1, isHuman: true, controlSet: 'p2', label: 'Player 2' },
        { id: 2, isHuman: false, controlSet: 'ai', label: 'Bot Amber' },
        { id: 3, isHuman: false, controlSet: 'ai', label: 'Bot Emerald' },
      ];
    }
    return [
      { id: 0, isHuman: true, controlSet: 'p1', label: 'Player 1' },
      { id: 1, isHuman: true, controlSet: 'p2', label: 'Player 2' },
    ];
  }

  function createPlayers(roster) {
    return roster.map((entry) => {
      const spawn = SPAWN_CORNERS[entry.id];
      const pos = tileCenter(spawn.col, spawn.row);
      return {
        id: entry.id,
        name: entry.label,
        isHuman: entry.isHuman,
        controlSet: entry.controlSet,
        color: spawn.color,
        visor: spawn.visor,
        x: pos.x,
        y: pos.y,
        dirX: 0,
        dirY: 1,
        alive: true,
        maxBombs: 1,
        activeBombs: 0,
        range: 2,
        speedTier: 0,
        shield: false,
        invulnTimer: 0,
        aiBombCooldown: 0,
      };
    });
  }

  function startNewMatch() {
    state.mode = modeSelect.value;
    state.aiDifficulty = aiSelect.value;
    state.round = 1;
    const roster = getRosterConfig(state.mode);
    state.scores = roster.map(() => 0);
    p2ControlsRow.style.display = state.mode === '1p-bots' ? 'none' : 'flex';
    tipEl.classList.toggle('hidden', state.mode !== '1p-bots');
    startRound();
  }

  function startRound() {
    const roster = getRosterConfig(state.mode);
    state.grid = createGrid();
    state.players = createPlayers(roster);
    state.bombs = [];
    state.flames = [];
    state.powerups = [];
    state.particles = [];
    state.roundTimeLeft = ROUND_SECONDS;
    state.suddenDeathIndex = 0;
    state.suddenDeathTimer = 0;
    state.paused = false;
    state.roundEnded = false;
    state.matchEnded = false;
    btnPause.textContent = 'Pause';
    roundNumEl.textContent = String(state.round);
    hideOverlay();
    syncHud();
  }

  function showOverlay(title, desc, actionLabel) {
    overlayTitleEl.textContent = title;
    overlayDescEl.textContent = desc;
    btnOverlayAction.textContent = actionLabel;
    overlayEl.classList.remove('hidden');
  }

  function hideOverlay() {
    overlayEl.classList.add('hidden');
  }

  function togglePause() {
    if (state.roundEnded || state.matchEnded) return;
    state.paused = !state.paused;
    btnPause.textContent = state.paused ? 'Resume' : 'Pause';
    if (state.paused) {
      showOverlay('Paused', 'Game paused. Press P or click Resume to continue.', 'Resume');
    } else {
      hideOverlay();
    }
  }

  function bombAt(col, row) {
    return state.bombs.find((b) => b.col === col && b.row === row);
  }

  function isTileWalkableForPlayer(col, row, player) {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
    if (state.grid[row][col] !== TILE_EMPTY) return false;
    const bomb = bombAt(col, row);
    if (bomb && !bomb.passableFor.has(player.id)) return false;
    return true;
  }

  function movePlayer(player, dx, dy, dt) {
    if (dx === 0 && dy === 0) return;

    // Normalize diagonal input so keyboard 2-key hold still picks dominant axis cleanly
    if (dx !== 0 && dy !== 0) {
      const tile = posToTile(player.x, player.y);
      const canX = isTileWalkableForPlayer(tile.col + Math.sign(dx), tile.row, player);
      const canY = isTileWalkableForPlayer(tile.col, tile.row + Math.sign(dy), player);
      if (canX && !canY) dy = 0;
      else if (canY && !canX) dx = 0;
      else dy = 0;
    }

    player.dirX = Math.sign(dx);
    player.dirY = Math.sign(dy);

    const speed = BASE_SPEED + player.speedTier * SPEED_STEP;
    const step = speed * dt;
    const half = TILE * 0.42;

    if (dx !== 0) {
      const dir = Math.sign(dx);
      const curRow = Math.floor(player.y / TILE);
      const curCol = Math.floor(player.x / TILE);

      let targetRow = curRow;
      if (!isTileWalkableForPlayer(curCol + dir, curRow, player)) {
        // Corner rounding: check adjacent open row if within forgiveness window
        const upOpen = isTileWalkableForPlayer(curCol + dir, curRow - 1, player);
        const downOpen = isTileWalkableForPlayer(curCol + dir, curRow + 1, player);
        const upCenter = (curRow - 1) * TILE + TILE / 2;
        const downCenter = (curRow + 1) * TILE + TILE / 2;
        if (upOpen && Math.abs(player.y - upCenter) <= TILE * 0.85) {
          targetRow = curRow - 1;
        } else if (downOpen && Math.abs(player.y - downCenter) <= TILE * 0.85) {
          targetRow = curRow + 1;
        }
      }

      const desiredY = targetRow * TILE + TILE / 2;
      const diffY = desiredY - player.y;
      if (Math.abs(diffY) > 0.5) {
        const align = Math.sign(diffY) * Math.min(Math.abs(diffY), step * 1.1);
        player.y += align;
      } else {
        player.y = desiredY;
      }

      const alignedRow = Math.floor(player.y / TILE);
      const alignedCenter = alignedRow * TILE + TILE / 2;
      const aligned = Math.abs(player.y - alignedCenter) <= TILE * 0.25;
      const nextCol = Math.floor((player.x + dir * (half + step)) / TILE);
      const curTileCol = Math.floor(player.x / TILE);

      if (nextCol === curTileCol || (aligned && isTileWalkableForPlayer(nextCol, alignedRow, player))) {
        player.x += dir * step;
      } else {
        const edgeX = curTileCol * TILE + (dir > 0 ? TILE - half : half);
        player.x = dir > 0 ? Math.min(player.x + step, edgeX) : Math.max(player.x - step, edgeX);
      }
    } else if (dy !== 0) {
      const dir = Math.sign(dy);
      const curCol = Math.floor(player.x / TILE);
      const curRow = Math.floor(player.y / TILE);

      let targetCol = curCol;
      if (!isTileWalkableForPlayer(curCol, curRow + dir, player)) {
        const leftOpen = isTileWalkableForPlayer(curCol - 1, curRow + dir, player);
        const rightOpen = isTileWalkableForPlayer(curCol + 1, curRow + dir, player);
        const leftCenter = (curCol - 1) * TILE + TILE / 2;
        const rightCenter = (curCol + 1) * TILE + TILE / 2;
        if (leftOpen && Math.abs(player.x - leftCenter) <= TILE * 0.85) {
          targetCol = curCol - 1;
        } else if (rightOpen && Math.abs(player.x - rightCenter) <= TILE * 0.85) {
          targetCol = curCol + 1;
        }
      }

      const desiredX = targetCol * TILE + TILE / 2;
      const diffX = desiredX - player.x;
      if (Math.abs(diffX) > 0.5) {
        const align = Math.sign(diffX) * Math.min(Math.abs(diffX), step * 1.1);
        player.x += align;
      } else {
        player.x = desiredX;
      }

      const alignedCol = Math.floor(player.x / TILE);
      const alignedCenter = alignedCol * TILE + TILE / 2;
      const aligned = Math.abs(player.x - alignedCenter) <= TILE * 0.25;
      const nextRow = Math.floor((player.y + dir * (half + step)) / TILE);
      const curTileRow = Math.floor(player.y / TILE);

      if (nextRow === curTileRow || (aligned && isTileWalkableForPlayer(alignedCol, nextRow, player))) {
        player.y += dir * step;
      } else {
        const edgeY = curTileRow * TILE + (dir > 0 ? TILE - half : half);
        player.y = dir > 0 ? Math.min(player.y + step, edgeY) : Math.max(player.y - step, edgeY);
      }
    }

    // Revoke bomb pass-through once player exits that tile
    for (const bomb of state.bombs) {
      if (!bomb.passableFor.has(player.id)) continue;
      const bCenter = tileCenter(bomb.col, bomb.row);
      if (
        Math.abs(player.x - bCenter.x) > TILE * 0.78 ||
        Math.abs(player.y - bCenter.y) > TILE * 0.78
      ) {
        bomb.passableFor.delete(player.id);
      }
    }
  }

  function placeBomb(player) {
    if (!player.alive || state.paused || state.roundEnded) return false;
    if (player.activeBombs >= player.maxBombs) return false;

    const { col, row } = posToTile(player.x, player.y);
    if (state.grid[row][col] !== TILE_EMPTY || bombAt(col, row)) return false;

    const passableFor = new Set();
    const bCenter = tileCenter(col, row);
    for (const p of state.players) {
      if (!p.alive) continue;
      if (Math.abs(p.x - bCenter.x) < TILE * 0.8 && Math.abs(p.y - bCenter.y) < TILE * 0.8) {
        passableFor.add(p.id);
      }
    }

    state.bombs.push({
      col,
      row,
      ownerId: player.id,
      range: player.range,
      timer: BOMB_FUSE,
      passableFor,
    });
    player.activeBombs++;
    Sound.placeBomb();
    return true;
  }

  function spawnParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 140;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        color,
        size: 3 + Math.random() * 4,
      });
    }
  }

  function maybeDropPowerup(col, row) {
    if (Math.random() > 0.36) return;
    const roll = Math.random();
    let type = 'bomb';
    if (roll < 0.34) type = 'bomb';
    else if (roll < 0.68) type = 'fire';
    else if (roll < 0.88) type = 'speed';
    else type = 'shield';

    state.powerups.push({
      col,
      row,
      type,
      grace: FLAME_DURATION + 0.15,
    });
  }

  function detonateBomb(initialBomb) {
    const queue = [initialBomb];
    const flameMap = new Map();

    while (queue.length > 0) {
      const bomb = queue.shift();
      const idx = state.bombs.indexOf(bomb);
      if (idx !== -1) state.bombs.splice(idx, 1);

      const owner = state.players.find((p) => p.id === bomb.ownerId);
      if (owner && owner.activeBombs > 0) owner.activeBombs--;

      const addFlame = (col, row, kind) => {
        flameMap.set(`${col},${row}`, { col, row, kind });
      };

      addFlame(bomb.col, bomb.row, 'center');

      const dirs = [
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
          if (cell === TILE_WALL) break;

          if (cell === TILE_CRATE) {
            state.grid[nr][nc] = TILE_EMPTY;
            addFlame(nc, nr, kind);
            const center = tileCenter(nc, nr);
            spawnParticles(center.x, center.y, '#d97706', 12);
            maybeDropPowerup(nc, nr);
            break;
          }

          addFlame(nc, nr, kind);

          // Destroy exposed power-ups without grace
          for (let i = state.powerups.length - 1; i >= 0; i--) {
            const pu = state.powerups[i];
            if (pu.col === nc && pu.row === nr && pu.grace <= 0) {
              state.powerups.splice(i, 1);
            }
          }

          // Chain-detonate other bombs in the blast path
          const other = bombAt(nc, nr);
          if (other && !queue.includes(other)) {
            queue.push(other);
          }
        }
      }
    }

    for (const f of flameMap.values()) {
      state.flames.push({
        col: f.col,
        row: f.row,
        kind: f.kind,
        timer: FLAME_DURATION,
      });
    }
    Sound.explode();
  }

  function eliminatePlayer(player) {
    if (!player.alive) return;
    player.alive = false;
    spawnParticles(player.x, player.y, player.color, 20);
    Sound.die();
  }

  function hitPlayerWithBlast(player) {
    if (!player.alive || player.invulnTimer > 0) return;
    if (player.shield) {
      player.shield = false;
      player.invulnTimer = 1.6;
      spawnParticles(player.x, player.y, '#c084fc', 14);
      Sound.shieldHit();
      return;
    }
    eliminatePlayer(player);
  }

  function checkPowerupPickups(player) {
    const { col, row } = posToTile(player.x, player.y);
    for (let i = state.powerups.length - 1; i >= 0; i--) {
      const pu = state.powerups[i];
      if (pu.col === col && pu.row === row) {
        if (pu.type === 'bomb') player.maxBombs = Math.min(6, player.maxBombs + 1);
        else if (pu.type === 'fire') player.range = Math.min(6, player.range + 1);
        else if (pu.type === 'speed') player.speedTier = Math.min(4, player.speedTier + 1);
        else if (pu.type === 'shield') player.shield = true;

        const center = tileCenter(col, row);
        spawnParticles(center.x, center.y, '#38bdf8', 8);
        Sound.powerup();
        state.powerups.splice(i, 1);
        syncHud();
      }
    }
  }

  // Build danger timer grid (Infinity = safe, 0 = active flame, >0 = seconds until bomb blast)
  function computeDangerMap(extraBomb = null) {
    const danger = Array.from({ length: ROWS }, () => Array(COLS).fill(Infinity));

    for (const f of state.flames) {
      danger[f.row][f.col] = 0;
    }

    const virtualBombs = state.bombs.map((b) => ({
      col: b.col,
      row: b.row,
      range: b.range,
      timer: b.timer,
    }));
    if (extraBomb) virtualBombs.push(extraBomb);

    // Propagate earliest detonation time across chain reactions
    let changed = true;
    while (changed) {
      changed = false;
      for (const b of virtualBombs) {
        const rays = [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
        for (const [dc, dr] of rays) {
          const maxStep = dc === 0 && dr === 0 ? 0 : b.range;
          for (let step = dc === 0 && dr === 0 ? 0 : 1; step <= maxStep; step++) {
            const nc = b.col + dc * step;
            const nr = b.row + dr * step;
            if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) break;
            if (state.grid[nr][nc] === TILE_WALL) break;

            if (b.timer < danger[nr][nc]) {
              danger[nr][nc] = b.timer;
              changed = true;
            }
            if (state.grid[nr][nc] === TILE_CRATE) break;

            for (const other of virtualBombs) {
              if (other !== b && other.col === nc && other.row === nr && b.timer < other.timer) {
                other.timer = b.timer;
                changed = true;
              }
            }
          }
        }
      }
    }

    return danger;
  }

  function findBfsStep(startCol, startRow, player, danger, goalFn, avoidDangerThreshold = 0.55) {
    const queue = [{ col: startCol, row: startRow, firstDir: null, dist: 0 }];
    const visited = new Set([`${startCol},${startRow}`]);
    const speed = BASE_SPEED + player.speedTier * SPEED_STEP;
    const secPerTile = TILE / speed;

    const baseDirs = [
      { dc: 1, dr: 0 },
      { dc: -1, dr: 0 },
      { dc: 0, dr: 1 },
      { dc: 0, dr: -1 },
    ];
    // Deterministic per-player direction rotation avoids per-frame oscillation on ties
    const rot = player.id % 4;
    const dirs = baseDirs.slice(rot).concat(baseDirs.slice(0, rot));

    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur.dist > 0 && goalFn(cur.col, cur.row, cur.dist)) {
        return { dir: cur.firstDir, col: cur.col, row: cur.row, dist: cur.dist };
      }

      for (const d of dirs) {
        const nc = cur.col + d.dc;
        const nr = cur.row + d.dr;
        const key = `${nc},${nr}`;
        if (visited.has(key)) continue;
        if (!isTileWalkableForPlayer(nc, nr, player)) continue;

        const arrivalTime = (cur.dist + 1) * secPerTile;
        const tileDanger = danger[nr][nc];
        if (tileDanger < Infinity && tileDanger <= arrivalTime + avoidDangerThreshold) {
          continue;
        }

        visited.add(key);
        queue.push({
          col: nc,
          row: nr,
          firstDir: cur.firstDir || { dx: d.dc, dy: d.dr },
          dist: cur.dist + 1,
        });
      }
    }
    return null;
  }

  function hasAdjacentCrate(col, row) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    return dirs.some(([dc, dr]) => {
      const nc = col + dc;
      const nr = row + dr;
      return nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && state.grid[nr][nc] === TILE_CRATE;
    });
  }

  function enemyInBlastLine(col, row, range, selfId) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const p of state.players) {
      if (!p.alive || p.id === selfId) continue;
      const pt = posToTile(p.x, p.y);
      if (pt.col === col && pt.row === row) return true;
      for (const [dc, dr] of dirs) {
        for (let s = 1; s <= range; s++) {
          const nc = col + dc * s;
          const nr = row + dr * s;
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) break;
          if (state.grid[nr][nc] !== TILE_EMPTY) break;
          if (pt.col === nc && pt.row === nr) return true;
        }
      }
    }
    return false;
  }

  function updateAi(player, dt) {
    player.aiBombCooldown = Math.max(0, player.aiBombCooldown - dt);
    const { col, row } = posToTile(player.x, player.y);
    const center = tileCenter(col, row);
    const danger = computeDangerMap();
    const isHard = state.aiDifficulty === 'hard';

    // 1. Escape danger immediately
    if (danger[row][col] < Infinity) {
      const safeTarget = findBfsStep(
        col,
        row,
        player,
        danger,
        (c, r) => danger[r][c] === Infinity,
        0.2
      );
      if (safeTarget && safeTarget.dir) {
        movePlayer(player, safeTarget.dir.dx, safeTarget.dir.dy, dt);
        return;
      }
      // Fallback: move toward tile with longest time before detonation
      const dirs = [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
      ];
      let bestDir = null;
      let bestScore = danger[row][col];
      for (const d of dirs) {
        const nc = col + d.dx;
        const nr = row + d.dy;
        if (isTileWalkableForPlayer(nc, nr, player) && danger[nr][nc] > bestScore) {
          bestScore = danger[nr][nc];
          bestDir = d;
        }
      }
      if (bestDir) movePlayer(player, bestDir.dx, bestDir.dy, dt);
      return;
    }

    // 2. Check if placing a bomb right here hits a crate or enemy AND leaves an escape route
    const aligned = Math.abs(player.x - center.x) < 12 && Math.abs(player.y - center.y) < 12;
    const goodTarget =
      enemyInBlastLine(col, row, player.range, player.id) || hasAdjacentCrate(col, row);

    if (
      goodTarget &&
      player.aiBombCooldown <= 0 &&
      player.activeBombs < player.maxBombs &&
      !bombAt(col, row)
    ) {
      const simDanger = computeDangerMap({
        col,
        row,
        range: player.range,
        timer: BOMB_FUSE,
      });
      const escape = findBfsStep(
        col,
        row,
        player,
        simDanger,
        (c, r) => simDanger[r][c] === Infinity,
        0.35
      );
      if (escape && escape.dir) {
        if (!aligned) {
          const dx = Math.abs(center.x - player.x) > 3 ? Math.sign(center.x - player.x) : 0;
          const dy = Math.abs(center.y - player.y) > 3 ? Math.sign(center.y - player.y) : 0;
          movePlayer(player, dx, dy, dt);
          return;
        }
        placeBomb(player);
        player.aiBombCooldown = isHard ? 0.55 : 1.05;
        movePlayer(player, escape.dir.dx, escape.dir.dy, dt);
        return;
      }
    }

    // 3. Seek nearby safe power-up
    const puStep = findBfsStep(
      col,
      row,
      player,
      danger,
      (c, r, dist) => dist <= (isHard ? 8 : 5) && state.powerups.some((pu) => pu.col === c && pu.row === r && danger[r][c] === Infinity),
      0.5
    );
    if (puStep && puStep.dir) {
      movePlayer(player, puStep.dir.dx, puStep.dir.dy, dt);
      return;
    }

    // 4. Seek nearest enemy or crate to open up the map
    const huntStep = findBfsStep(
      col,
      row,
      player,
      danger,
      (c, r) =>
        danger[r][c] === Infinity &&
        (hasAdjacentCrate(c, r) || enemyInBlastLine(c, r, player.range, player.id)),
      0.55
    );
    if (huntStep && huntStep.dir) {
      movePlayer(player, huntStep.dir.dx, huntStep.dir.dy, dt);
    }
  }

  function getHumanInput(controlSet) {
    let dx = 0;
    let dy = 0;
    const isP1 = controlSet === 'p1' || controlSet === 'p1-single';
    const allowArrowsForP1 = controlSet === 'p1-single';

    if (isP1) {
      if (keysDown.has('KeyW') || (allowArrowsForP1 && keysDown.has('ArrowUp'))) dy -= 1;
      if (keysDown.has('KeyS') || (allowArrowsForP1 && keysDown.has('ArrowDown'))) dy += 1;
      if (keysDown.has('KeyA') || (allowArrowsForP1 && keysDown.has('ArrowLeft'))) dx -= 1;
      if (keysDown.has('KeyD') || (allowArrowsForP1 && keysDown.has('ArrowRight'))) dx += 1;
    } else if (controlSet === 'p2') {
      if (keysDown.has('ArrowUp')) dy -= 1;
      if (keysDown.has('ArrowDown')) dy += 1;
      if (keysDown.has('ArrowLeft')) dx -= 1;
      if (keysDown.has('ArrowRight')) dx += 1;
    }
    return { dx, dy };
  }

  function updateSuddenDeath(dt) {
    if (state.roundTimeLeft > 0) return;
    state.suddenDeathTimer += dt;
    if (state.suddenDeathTimer < 0.36) return;
    state.suddenDeathTimer = 0;

    while (state.suddenDeathIndex < SUDDEN_DEATH_CELLS.length) {
      const cell = SUDDEN_DEATH_CELLS[state.suddenDeathIndex++];
      if (state.grid[cell.row][cell.col] === TILE_WALL) continue;

      state.grid[cell.row][cell.col] = TILE_WALL;
      const bomb = bombAt(cell.col, cell.row);
      if (bomb) {
        const idx = state.bombs.indexOf(bomb);
        if (idx !== -1) state.bombs.splice(idx, 1);
      }
      for (let i = state.powerups.length - 1; i >= 0; i--) {
        if (state.powerups[i].col === cell.col && state.powerups[i].row === cell.row) {
          state.powerups.splice(i, 1);
        }
      }
      for (const p of state.players) {
        if (!p.alive) continue;
        const pt = posToTile(p.x, p.y);
        if (pt.col === cell.col && pt.row === cell.row) {
          eliminatePlayer(p);
        }
      }
      break;
    }
  }

  function checkRoundResolution() {
    if (state.roundEnded) return;
    const alivePlayers = state.players.filter((p) => p.alive);
    if (alivePlayers.length > 1) return;

    // Wait briefly if flames are still active so simultaneous KOs settle fairly
    if (state.flames.length > 0 && alivePlayers.length === 1) return;

    state.roundEnded = true;
    if (alivePlayers.length === 1) {
      const winner = alivePlayers[0];
      state.scores[winner.id] = (state.scores[winner.id] || 0) + 1;
      syncHud();
      Sound.win();

      if (state.scores[winner.id] >= TARGET_WINS) {
        state.matchEnded = true;
        showOverlay(
          `${winner.name} Wins the Match!`,
          `Champion after ${state.round} rounds (${state.scores[winner.id]} wins).`,
          'Play New Match'
        );
      } else {
        showOverlay(
          `Round ${state.round} Winner`,
          `${winner.name} takes the round! (${state.scores[winner.id]}/${TARGET_WINS} wins)`,
          'Next Round'
        );
      }
    } else {
      syncHud();
      showOverlay(
        `Round ${state.round} Draw`,
        'Everyone was caught in the blast! No points awarded.',
        'Next Round'
      );
    }
  }

  function update(dt) {
    if (state.paused || state.roundEnded) return;

    state.roundTimeLeft = Math.max(0, state.roundTimeLeft - dt);
    updateSuddenDeath(dt);

    // Update players
    for (const p of state.players) {
      if (!p.alive) continue;
      if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);

      if (p.isHuman) {
        const { dx, dy } = getHumanInput(p.controlSet);
        movePlayer(p, dx, dy, dt);
      } else {
        updateAi(p, dt);
      }
      checkPowerupPickups(p);
    }

    // Update power-up grace timers
    for (const pu of state.powerups) {
      if (pu.grace > 0) pu.grace = Math.max(0, pu.grace - dt);
    }

    // Update bomb fuses and detonate expired bombs safely
    for (const b of state.bombs) {
      b.timer -= dt;
    }
    const expiredBombs = state.bombs.filter((b) => b.timer <= 0);
    for (const b of expiredBombs) {
      if (state.bombs.includes(b)) {
        detonateBomb(b);
      }
    }

    // Update flames & check player hits
    for (let i = state.flames.length - 1; i >= 0; i--) {
      const f = state.flames[i];
      f.timer -= dt;

      for (const p of state.players) {
        if (!p.alive) continue;
        const pt = posToTile(p.x, p.y);
        if (pt.col === f.col && pt.row === f.row) {
          hitPlayerWithBlast(p);
        }
      }

      if (f.timer <= 0) {
        state.flames.splice(i, 1);
      }
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

    state.hudSyncAcc += dt;
    if (state.hudSyncAcc >= 0.25) {
      state.hudSyncAcc = 0;
      updateTimerDisplay();
    }

    checkRoundResolution();
  }

  function updateTimerDisplay() {
    if (state.roundTimeLeft <= 0) {
      roundTimerEl.textContent = 'SUDDEN DEATH';
      roundTimerEl.style.color = '#f43f5e';
      return;
    }
    const secs = Math.ceil(state.roundTimeLeft);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    roundTimerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    roundTimerEl.style.color = secs <= 20 ? '#f59e0b' : '#f8fafc';
  }

  function syncHud() {
    updateTimerDisplay();
    playersHudEl.innerHTML = state.players
      .map((p, idx) => {
        const wins = state.scores[idx] || 0;
        const status = p.alive ? (p.shield ? '🛡️ Shield' : 'Alive') : 'KO';
        return `
          <div class="player-row ${p.alive ? '' : 'eliminated'}">
            <div class="player-head">
              <span class="player-name">
                <span class="swatch" style="background:${p.color}"></span>
                ${p.name}
              </span>
              <span>${wins} / ${TARGET_WINS} ★</span>
            </div>
            <div class="player-stats">
              <span>💣 ${p.maxBombs}</span>
              <span>🔥 ${p.range}</span>
              <span>⚡ ${p.speedTier + 1}</span>
              <span>${status}</span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Arena floor checkerboard
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * TILE;
        const y = r * TILE;
        ctx.fillStyle = (r + c) % 2 === 0 ? '#18243b' : '#1b2942';
        ctx.fillRect(x, y, TILE, TILE);

        const cell = state.grid[r][c];
        if (cell === TILE_WALL) {
          drawSteelWall(x, y);
        } else if (cell === TILE_CRATE) {
          drawCrate(x, y);
        }
      }
    }

    // Power-ups
    for (const pu of state.powerups) {
      drawPowerup(pu);
    }

    // Bombs
    const now = performance.now() / 1000;
    for (const b of state.bombs) {
      drawBomb(b, now);
    }

    // Flames
    for (const f of state.flames) {
      drawFlame(f);
    }

    // Players
    for (const p of state.players) {
      if (!p.alive) continue;
      if (p.invulnTimer > 0 && Math.floor(p.invulnTimer * 14) % 2 === 0) continue;
      drawPlayer(p);
    }

    // Particles
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawSteelWall(x, y) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
    ctx.fillStyle = '#475569';
    ctx.fillRect(x + 3, y + 3, TILE - 6, 6);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + 3, y + TILE - 8, TILE - 6, 5);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
  }

  function drawCrate(x, y) {
    ctx.fillStyle = '#b45309';
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(x + 5, y + 5, TILE - 10, TILE - 10);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 5, y + TILE / 2);
    ctx.lineTo(x + TILE - 5, y + TILE / 2);
    ctx.moveTo(x + TILE / 2, y + 5);
    ctx.lineTo(x + TILE / 2, y + TILE / 2);
    ctx.stroke();
  }

  function drawPowerup(pu) {
    const cx = pu.col * TILE + TILE / 2;
    const cy = pu.row * TILE + TILE / 2;
    const colors = {
      bomb: '#0284c7',
      fire: '#ea580c',
      speed: '#16a34a',
      shield: '#9333ea',
    };
    const labels = { bomb: 'B+', fire: 'F+', speed: 'S+', shield: 'SH' };

    ctx.fillStyle = colors[pu.type];
    ctx.beginPath();
    ctx.roundRect(cx - 14, cy - 14, 28, 28, 6);
    ctx.fill();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[pu.type], cx, cy + 1);
  }

  function drawBomb(b, now) {
    const cx = b.col * TILE + TILE / 2;
    const cy = b.row * TILE + TILE / 2;
    const pulse = 1 + Math.sin(now * (b.timer < 0.8 ? 22 : 9)) * 0.1;
    const r = 14 * pulse;

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 13, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = b.timer < 0.7 ? '#991b1b' : '#0f172a';
    ctx.beginPath();
    ctx.arc(cx, cy + 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fuse spark
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy - r + 4);
    ctx.lineTo(cx + 9, cy - r - 3);
    ctx.stroke();

    ctx.fillStyle = Math.floor(now * 16) % 2 === 0 ? '#facc15' : '#f97316';
    ctx.beginPath();
    ctx.arc(cx + 10, cy - r - 4, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFlame(f) {
    const x = f.col * TILE;
    const y = f.row * TILE;
    const alpha = Math.min(1, f.timer / FLAME_DURATION + 0.25);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#f97316';
    if (f.kind === 'center') {
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    } else if (f.kind === 'h') {
      ctx.fillRect(x, y + 7, TILE, TILE - 14);
    } else {
      ctx.fillRect(x + 7, y, TILE - 14, TILE);
    }

    ctx.fillStyle = '#fef08a';
    if (f.kind === 'center') {
      ctx.fillRect(x + 9, y + 9, TILE - 18, TILE - 18);
    } else if (f.kind === 'h') {
      ctx.fillRect(x, y + 14, TILE, TILE - 28);
    } else {
      ctx.fillRect(x + 14, y, TILE - 28, TILE);
    }
    ctx.restore();
  }

  function drawPlayer(p) {
    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 15, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shield aura
    if (p.shield) {
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 19, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Body / Helmet
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Visor facing direction
    const vx = p.x + p.dirX * 4;
    const vy = p.y + p.dirY * 4;
    ctx.fillStyle = p.visor;
    ctx.beginPath();
    ctx.roundRect(vx - 8, vy - 5, 16, 10, 4);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(vx - 5, vy - 2, 3, 4);
    ctx.fillRect(vx + 2, vy - 2, 3, 4);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - state.lastFrame) / 1000);
    state.lastFrame = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // Input listeners
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
    if (e.code === 'KeyR') {
      startRound();
      return;
    }

    // Bomb triggers
    const p1 = state.players[0];
    const p2 = state.players[1];
    if (p1 && p1.isHuman) {
      const p1BombKey = e.code === 'Space' || (state.mode === '1p-bots' && e.code === 'Enter');
      if (p1BombKey) placeBomb(p1);
    }
    if (p2 && p2.isHuman && e.code === 'Enter') {
      placeBomb(p2);
    }
  });

  document.addEventListener('keyup', (e) => {
    keysDown.delete(e.code);
  });

  btnNewMatch.addEventListener('click', startNewMatch);
  modeSelect.addEventListener('change', startNewMatch);
  aiSelect.addEventListener('change', () => {
    state.aiDifficulty = aiSelect.value;
  });
  btnPause.addEventListener('click', togglePause);
  btnSound.addEventListener('click', () => {
    const on = Sound.toggle();
    btnSound.textContent = on ? 'Sound: On' : 'Sound: Off';
    btnSound.setAttribute('aria-pressed', String(on));
  });

  btnOverlayAction.addEventListener('click', () => {
    if (state.paused) {
      togglePause();
    } else if (state.matchEnded) {
      startNewMatch();
    } else if (state.roundEnded) {
      state.round++;
      startRound();
    }
  });

  startNewMatch();
  requestAnimationFrame(frame);
})();
