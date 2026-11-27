export const COLS = 15;
export const ROWS = 13;
export const TILE = 44;

export const enum TileKind {
  Empty = 0,
  Wall = 1,
  Crate = 2,
}

export type EnemyType = 'balloon' | 'ice' | 'ghost' | 'coin';

export type PowerUpType = 'bomb' | 'fire' | 'speed' | 'shield';

export type GamePhase =
  | 'title'
  | 'stage-intro'
  | 'playing'
  | 'paused'
  | 'stage-clear'
  | 'life-lost'
  | 'game-over'
  | 'ending';

export interface PlayerState {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  walkAnim: number;
  maxBombs: number;
  activeBombs: number;
  range: number;
  speedTier: number;
  shield: boolean;
  invulnTimer: number;
}

export interface EnemyState {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  anim: number;
  alive: boolean;
}

export interface BombState {
  col: number;
  row: number;
  range: number;
  timer: number;
  passableForPlayer: boolean;
}

export interface FlameState {
  col: number;
  row: number;
  kind: 'center' | 'h' | 'v';
  timer: number;
}

export interface PowerUpState {
  col: number;
  row: number;
  type: PowerUpType;
  revealed: boolean;
  grace: number;
}

export interface DoorState {
  col: number;
  row: number;
  revealed: boolean;
}

export interface ParticleState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface StageConfig {
  stage: number;
  name: string;
  crateDensity: number;
  timeLimit: number;
  enemies: Record<EnemyType, number>;
  stagePowerUp: PowerUpType;
}

export interface SaveData {
  bestScore: number;
  maxUnlockedStage: number;
  clears: number;
  bestClearSeconds: number | null;
}
