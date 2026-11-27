import { EnemyType, StageConfig } from './types';

export interface EnemySpec {
  label: string;
  speed: number;
  points: number;
  color: string;
  phasesCrates: boolean;
  chaseRange: number;
  dodgesBombs: boolean;
}

export const ENEMY_SPECS: Record<EnemyType, EnemySpec> = {
  balloon: {
    label: 'Balloon',
    speed: 68,
    points: 100,
    color: '#f97316',
    phasesCrates: false,
    chaseRange: 0,
    dodgesBombs: false,
  },
  ice: {
    label: 'Ice',
    speed: 92,
    points: 200,
    color: '#38bdf8',
    phasesCrates: false,
    chaseRange: 7,
    dodgesBombs: false,
  },
  ghost: {
    label: 'Ghost',
    speed: 62,
    points: 400,
    color: '#ef4444',
    phasesCrates: true,
    chaseRange: 0,
    dodgesBombs: false,
  },
  coin: {
    label: 'Coin',
    speed: 128,
    points: 800,
    color: '#eab308',
    phasesCrates: true,
    chaseRange: 99,
    dodgesBombs: true,
  },
};

export const STAGES: StageConfig[] = [
  {
    stage: 1,
    name: 'Emerald Meadow',
    crateDensity: 0.42,
    timeLimit: 180,
    enemies: { balloon: 4, ice: 0, ghost: 0, coin: 0 },
    stagePowerUp: 'fire',
  },
  {
    stage: 2,
    name: 'Frost Outpost',
    crateDensity: 0.46,
    timeLimit: 180,
    enemies: { balloon: 3, ice: 2, ghost: 0, coin: 0 },
    stagePowerUp: 'bomb',
  },
  {
    stage: 3,
    name: 'Frozen Courtyard',
    crateDensity: 0.5,
    timeLimit: 180,
    enemies: { balloon: 2, ice: 4, ghost: 0, coin: 0 },
    stagePowerUp: 'speed',
  },
  {
    stage: 4,
    name: 'Haunted Ruins',
    crateDensity: 0.52,
    timeLimit: 180,
    enemies: { balloon: 2, ice: 2, ghost: 2, coin: 0 },
    stagePowerUp: 'fire',
  },
  {
    stage: 5,
    name: 'Phantom Ramparts',
    crateDensity: 0.54,
    timeLimit: 180,
    enemies: { balloon: 1, ice: 3, ghost: 3, coin: 0 },
    stagePowerUp: 'bomb',
  },
  {
    stage: 6,
    name: 'Crimson Catacombs',
    crateDensity: 0.56,
    timeLimit: 175,
    enemies: { balloon: 0, ice: 3, ghost: 4, coin: 0 },
    stagePowerUp: 'shield',
  },
  {
    stage: 7,
    name: 'Golden Vault',
    crateDensity: 0.58,
    timeLimit: 175,
    enemies: { balloon: 0, ice: 2, ghost: 3, coin: 1 },
    stagePowerUp: 'speed',
  },
  {
    stage: 8,
    name: 'Treasure Labyrinth',
    crateDensity: 0.6,
    timeLimit: 170,
    enemies: { balloon: 0, ice: 1, ghost: 3, coin: 2 },
    stagePowerUp: 'fire',
  },
  {
    stage: 9,
    name: 'Royal Guardhouse',
    crateDensity: 0.62,
    timeLimit: 170,
    enemies: { balloon: 0, ice: 0, ghost: 3, coin: 4 },
    stagePowerUp: 'bomb',
  },
  {
    stage: 10,
    name: 'Princess Tower',
    crateDensity: 0.64,
    timeLimit: 180,
    enemies: { balloon: 0, ice: 0, ghost: 2, coin: 6 },
    stagePowerUp: 'shield',
  },
];
