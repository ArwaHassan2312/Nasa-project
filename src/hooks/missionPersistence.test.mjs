import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearMissionState,
  hasResumableMission,
  loadMissionState,
  MISSION_SAVE_KEY,
  saveMissionState,
} from './missionPersistence.js';

function createStorage(initial = []) {
  const values = new Map(initial);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function playingState(overrides = {}) {
  return {
    gameStatus: 'playing',
    day: 2,
    maxDays: 5,
    campaignSchedule: [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
      ['j', 'k', 'l'],
      ['m', 'n', 'o'],
    ],
    dailyChallenges: [{ id: 'd' }, { id: 'e' }, { id: 'f' }],
    resources: { power: 80 },
    repairInventory: { tools: [], spareParts: {} },
    sceneReady: true,
    ...overrides,
  };
}

test('clearing a mission save leaves unrelated browser settings untouched', () => {
  const storage = createStorage([
    [MISSION_SAVE_KEY, 'old mission'],
    ['lunar-task-console:v1', 'console preferences'],
  ]);

  clearMissionState(storage);

  assert.equal(storage.getItem(MISSION_SAVE_KEY), null);
  assert.equal(storage.getItem('lunar-task-console:v1'), 'console preferences');
});

test('mission save clearing reports when browser storage cannot be cleared', () => {
  assert.throws(
    () => clearMissionState({ removeItem() { throw new Error('storage denied'); } }),
    /previous mission save could not be cleared/,
  );
});

test('a playing mission round-trips through storage and resumes without a ready scene', () => {
  const storage = createStorage();
  const state = playingState();
  saveMissionState(state, storage);
  const loaded = loadMissionState(storage);
  assert.equal(loaded.day, 2);
  assert.deepEqual(loaded.campaignSchedule, state.campaignSchedule);
  assert.equal(loaded.sceneReady, false);
  assert.equal(hasResumableMission(storage), true);
});

test('finished missions and malformed saves are not resumable', () => {
  const storage = createStorage();
  saveMissionState(playingState({ gameStatus: 'success' }), storage);
  assert.equal(loadMissionState(storage), null);
  assert.equal(hasResumableMission(storage), false);

  storage.setItem(MISSION_SAVE_KEY, 'not json');
  assert.equal(loadMissionState(storage), null);

  storage.setItem(MISSION_SAVE_KEY, JSON.stringify({ version: 1, state: playingState() }));
  assert.equal(loadMissionState(storage), null);

  saveMissionState(playingState({ campaignSchedule: [['a', 'b']] }), storage);
  assert.equal(loadMissionState(storage), null);
});

test('saving is best-effort when storage is unavailable', () => {
  assert.doesNotThrow(() => saveMissionState(playingState(), {
    setItem() { throw new Error('storage denied'); },
  }));
  assert.equal(loadMissionState({ getItem() { throw new Error('storage denied'); } }), null);
});