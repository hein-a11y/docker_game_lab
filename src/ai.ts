import { ENEMY_SPECS } from './stages';
import { BombState, COLS, EnemyState, FlameState, PlayerState, ROWS, TILE, TileKind } from './types';

interface Dir {
  dc: number;
  dr: number;
}

const CARDINAL_DIRS: Dir[] = [
  { dc: 1, dr: 0 },
  { dc: -1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: 0, dr: -1 },
];

export function computeDangerMap(
  grid: TileKind[][],
  bombs: BombState[],
  flames: FlameState[]
): number[][] {
  const danger = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(Infinity));

  for (const f of flames) {
    danger[f.row][f.col] = 0;
  }

  const virtual = bombs.map((b) => ({
    col: b.col,
    row: b.row,
    range: b.range,
    timer: b.timer,
  }));

  let changed = true;
  while (changed) {
    changed = false;
    for (const b of virtual) {
      const rays: [number, number][] = [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      for (const [dc, dr] of rays) {
        const start = dc === 0 && dr === 0 ? 0 : 1;
        const max = dc === 0 && dr === 0 ? 0 : b.range;
        for (let step = start; step <= max; step++) {
          const nc = b.col + dc * step;
          const nr = b.row + dr * step;
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) break;
          if (grid[nr][nc] === TileKind.Wall) break;

          if (b.timer < danger[nr][nc]) {
            danger[nr][nc] = b.timer;
            changed = true;
          }
          if (grid[nr][nc] === TileKind.Crate) break;

          for (const other of virtual) {
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

export function isWalkableForEnemy(
  col: number,
  row: number,
  enemy: EnemyState,
  grid: TileKind[][],
  bombs: BombState[]
): boolean {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  const cell = grid[row][col];
  if (cell === TileKind.Wall) return false;
  if (cell === TileKind.Crate && !ENEMY_SPECS[enemy.type].phasesCrates) return false;
  if (bombs.some((b) => b.col === col && b.row === row)) return false;
  return true;
}

function bfsFirstDir(
  startCol: number,
  startRow: number,
  enemy: EnemyState,
  grid: TileKind[][],
  bombs: BombState[],
  goalFn: (c: number, r: number) => boolean,
  danger: number[][] | null
): Dir | null {
  const queue: { col: number; row: number; first: Dir | null; dist: number }[] = [
    { col: startCol, row: startRow, first: null, dist: 0 },
  ];
  const visited = new Set<string>([`${startCol},${startRow}`]);
  const secPerTile = TILE / ENEMY_SPECS[enemy.type].speed;

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.dist > 0 && goalFn(cur.col, cur.row)) {
      return cur.first;
    }

    for (const d of CARDINAL_DIRS) {
      const nc = cur.col + d.dc;
      const nr = cur.row + d.dr;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      if (!isWalkableForEnemy(nc, nr, enemy, grid, bombs)) continue;

      if (danger) {
        const arrival = (cur.dist + 1) * secPerTile;
        const tileDanger = danger[nr][nc];
        if (tileDanger < Infinity && tileDanger <= arrival + 0.3) {
          continue;
        }
      }

      visited.add(key);
      queue.push({
        col: nc,
        row: nr,
        first: cur.first ?? d,
        dist: cur.dist + 1,
      });
    }
  }
  return null;
}

function chooseDirectionAtCenter(
  col: number,
  row: number,
  enemy: EnemyState,
  player: PlayerState,
  grid: TileKind[][],
  bombs: BombState[],
  danger: number[][]
): Dir {
  const spec = ENEMY_SPECS[enemy.type];
  const validDirs = CARDINAL_DIRS.filter((d) =>
    isWalkableForEnemy(col + d.dc, row + d.dr, enemy, grid, bombs)
  );
  if (validDirs.length === 0) return { dc: 0, dr: 0 };

  const playerCol = Math.floor(player.x / TILE);
  const playerRow = Math.floor(player.y / TILE);
  const distToPlayer = Math.abs(playerCol - col) + Math.abs(playerRow - row);

  // Coin dodges bombs first if standing in or adjacent to blast paths
  if (spec.dodgesBombs) {
    if (danger[row][col] < Infinity) {
      const escape = bfsFirstDir(
        col,
        row,
        enemy,
        grid,
        bombs,
        (c, r) => danger[r][c] === Infinity,
        danger
      );
      if (escape) return escape;
    }
  }

  // Chase player if within this bot's chase range
  if (spec.chaseRange > 0 && distToPlayer <= spec.chaseRange) {
    const safeChase = bfsFirstDir(
      col,
      row,
      enemy,
      grid,
      bombs,
      (c, r) => c === playerCol && r === playerRow,
      spec.dodgesBombs ? danger : null
    );
    if (safeChase) return safeChase;
  }

  // Filter out dangerous tiles for Coin even while patrolling
  const safeDirs = spec.dodgesBombs
    ? validDirs.filter((d) => danger[row + d.dr][col + d.dc] === Infinity)
    : validDirs;
  const pool = safeDirs.length > 0 ? safeDirs : validDirs;

  // Prefer not reversing immediately unless at a dead-end
  const nonReverse = pool.filter((d) => !(d.dc === -enemy.dirX && d.dr === -enemy.dirY));
  const choices = nonReverse.length > 0 ? nonReverse : pool;

  const forward = choices.find((d) => d.dc === enemy.dirX && d.dr === enemy.dirY);
  if (forward && (choices.length === 1 || Math.random() < 0.7)) {
    return forward;
  }
  return choices[Math.floor(Math.random() * choices.length)];
}

export function updateEnemy(
  enemy: EnemyState,
  dt: number,
  player: PlayerState,
  grid: TileKind[][],
  bombs: BombState[],
  danger: number[][]
): void {
  if (!enemy.alive) return;

  enemy.anim += dt;
  const speed = ENEMY_SPECS[enemy.type].speed;
  const curCol = Math.floor(enemy.x / TILE);
  const curRow = Math.floor(enemy.y / TILE);
  const cx = curCol * TILE + TILE / 2;
  const cy = curRow * TILE + TILE / 2;

  // If stationary (e.g. spawn or was boxed in), try picking a valid direction
  if (enemy.dirX === 0 && enemy.dirY === 0) {
    enemy.x = cx;
    enemy.y = cy;
    const next = chooseDirectionAtCenter(curCol, curRow, enemy, player, grid, bombs, danger);
    enemy.dirX = next.dc;
    enemy.dirY = next.dr;
    return;
  }

  // Reverse immediately if a newly placed bomb blocked the tile ahead before reaching its center
  const aheadCol = curCol + enemy.dirX;
  const aheadRow = curRow + enemy.dirY;
  const movingTowardCenter =
    (enemy.dirX > 0 && enemy.x < cx) ||
    (enemy.dirX < 0 && enemy.x > cx) ||
    (enemy.dirY > 0 && enemy.y < cy) ||
    (enemy.dirY < 0 && enemy.y > cy);

  if (!movingTowardCenter && !isWalkableForEnemy(aheadCol, aheadRow, enemy, grid, bombs)) {
    if (isWalkableForEnemy(curCol - enemy.dirX, curRow - enemy.dirY, enemy, grid, bombs)) {
      enemy.dirX = -enemy.dirX;
      enemy.dirY = -enemy.dirY;
    } else {
      enemy.x = cx;
      enemy.y = cy;
      enemy.dirX = 0;
      enemy.dirY = 0;
      return;
    }
  }

  let step = speed * dt;
  const prevX = enemy.x;
  const prevY = enemy.y;
  const nextX = prevX + enemy.dirX * step;
  const nextY = prevY + enemy.dirY * step;

  const crossedCenterX =
    (enemy.dirX > 0 && prevX < cx && nextX >= cx) ||
    (enemy.dirX < 0 && prevX > cx && nextX <= cx);
  const crossedCenterY =
    (enemy.dirY > 0 && prevY < cy && nextY >= cy) ||
    (enemy.dirY < 0 && prevY > cy && nextY <= cy);

  if (crossedCenterX || crossedCenterY) {
    const used = Math.abs(cx - prevX) + Math.abs(cy - prevY);
    const rem = Math.max(0, step - used);
    enemy.x = cx;
    enemy.y = cy;

    const next = chooseDirectionAtCenter(curCol, curRow, enemy, player, grid, bombs, danger);
    enemy.dirX = next.dc;
    enemy.dirY = next.dr;
    enemy.x += enemy.dirX * rem;
    enemy.y += enemy.dirY * rem;
  } else {
    enemy.x = nextX;
    enemy.y = nextY;
  }
}
