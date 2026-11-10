export const MISSION_SAVE_KEY = 'lunar-outpost:mission:v1';
const MISSION_SAVE_VERSION = 2;

export function clearMissionState(storage) {
  try {
    (storage ?? globalThis.localStorage).removeItem(MISSION_SAVE_KEY);
  } catch (error) {
    throw new Error('The previous mission save could not be cleared from this browser.', { cause: error });
  }
}

export function saveMissionState(state, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(
      MISSION_SAVE_KEY,
      JSON.stringify({ version: MISSION_SAVE_VERSION, state }),
    );
  } catch {
    // Persistence is best-effort; gameplay continues when storage is unavailable.
  }
}

function isResumableState(state) {
  return Boolean(state)
    && state.gameStatus === 'playing'
    && Number.isInteger(state.day)
    && state.day >= 1
    && Array.isArray(state.campaignSchedule)
    && state.campaignSchedule.length === state.maxDays
    && state.campaignSchedule.every((day) => (
      Array.isArray(day) && day.length === 3 && day.every((id) => typeof id === 'string')
    ))
    && state.day <= state.maxDays
    && Array.isArray(state.dailyChallenges)
    && Boolean(state.resources)
    && Boolean(state.repairInventory);
}

export function loadMissionState(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(MISSION_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== MISSION_SAVE_VERSION || !isResumableState(parsed.state)) return null;
    return { ...parsed.state, sceneReady: false };
  } catch {
    return null;
  }
}

export function hasResumableMission(storage) {
  return loadMissionState(storage) !== null;
}