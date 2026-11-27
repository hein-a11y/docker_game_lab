import { SaveData } from './types';

const STORAGE_KEY = 'bomb_man_campaign_v1';

const DEFAULT_SAVE: SaveData = {
  bestScore: 0,
  maxUnlockedStage: 1,
  clears: 0,
  bestClearSeconds: null,
};

export function loadSaveData(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SAVE };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      bestScore: typeof parsed.bestScore === 'number' ? parsed.bestScore : 0,
      maxUnlockedStage:
        typeof parsed.maxUnlockedStage === 'number'
          ? Math.max(1, Math.min(10, parsed.maxUnlockedStage))
          : 1,
      clears: typeof parsed.clears === 'number' ? parsed.clears : 0,
      bestClearSeconds:
        typeof parsed.bestClearSeconds === 'number' ? parsed.bestClearSeconds : null,
    };
  } catch {
    return { ...DEFAULT_SAVE };
  }
}

export function saveSaveData(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}
