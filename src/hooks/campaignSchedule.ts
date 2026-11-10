import type { DailyChallengeDefinition } from '../data/dailyChallenges';

export const CAMPAIGN_DAYS = 5;
export const TASKS_PER_CAMPAIGN_DAY = 3;

export const CAMPAIGN_TASK_IDS = [
  'habitat-waterline-inspection',
  'oxygen-loop-filter-service',
  'solar-array-inspection',
  'battery-readiness-check',
  'solar-tracker-alignment',
  'nuclear-unit-coolant-check',
  'habitat-air-seal-check',
  'water-recycler-backflush',
  'greenhouse-nutrient-balance',
  'eva-suit-life-support-check',
  'rover-wheel-and-brake-check',
  'science-instrument-calibration',
  'communications-backup-beacon-test',
  'medical-kit-expiry-audit',
  'radiation-shelter-seal-check',
] as const;

export type CampaignInteractionKind =
  | 'install' | 'remove' | 'connect' | 'clean'
  | 'sort' | 'adjust' | 'repair' | 'calibrate';

// Primary drag-and-drop interaction pattern of each task's repair flow, used to
// keep any single day from repeating the same pattern three times.
export const CAMPAIGN_TASK_INTERACTIONS: Record<string, CampaignInteractionKind> = {
  'habitat-waterline-inspection': 'repair',
  'oxygen-loop-filter-service': 'install',
  'solar-array-inspection': 'repair',
  'battery-readiness-check': 'connect',
  'solar-tracker-alignment': 'adjust',
  'nuclear-unit-coolant-check': 'adjust',
  'habitat-air-seal-check': 'install',
  'water-recycler-backflush': 'clean',
  'greenhouse-nutrient-balance': 'adjust',
  'eva-suit-life-support-check': 'connect',
  'rover-wheel-and-brake-check': 'repair',
  'science-instrument-calibration': 'calibrate',
  'communications-backup-beacon-test': 'calibrate',
  'medical-kit-expiry-audit': 'sort',
  'radiation-shelter-seal-check': 'install',
};

function createRandomStream(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function fitsDay(day: DailyChallengeDefinition[], task: DailyChallengeDefinition): boolean {
  const sameSystem = day.filter((entry) => entry.affectedSystem === task.affectedSystem).length;
  const sameInteraction = day.filter((entry) => (
    CAMPAIGN_TASK_INTERACTIONS[entry.id] === CAMPAIGN_TASK_INTERACTIONS[task.id]
  )).length;
  return sameSystem < TASKS_PER_CAMPAIGN_DAY - 1 && sameInteraction < TASKS_PER_CAMPAIGN_DAY - 1;
}

function dealCampaign(
  tasks: DailyChallengeDefinition[],
  random: () => number,
): string[][] | null {
  const days: DailyChallengeDefinition[][] = Array.from({ length: CAMPAIGN_DAYS }, () => []);
  const criticals = shuffled(tasks.filter((task) => task.priority === 'critical'), random);
  const normals = shuffled(tasks.filter((task) => task.priority === 'normal'), random);
  const highs = shuffled(tasks.filter((task) => task.priority === 'high'), random);

  // Critical jobs never land on the beginner day and never share a day.
  const criticalDays = shuffled([1, 2, 3, 4], random).slice(0, criticals.length);
  for (let index = 0; index < criticals.length; index += 1) {
    days[criticalDays[index]].push(criticals[index]);
  }

  // Day 1 gets two gentle jobs; every later day keeps one normal job so no day
  // is made entirely of hard work.
  const normalSlots = [0, 0, 1, 2, 3, 4];
  for (const dayIndex of normalSlots) {
    const pickIndex = normals.findIndex((task) => fitsDay(days[dayIndex], task));
    if (pickIndex < 0) return null;
    days[dayIndex].push(normals.splice(pickIndex, 1)[0]);
  }

  const fillOrder = shuffled([0, 1, 2, 3, 4], random);
  for (const dayIndex of fillOrder) {
    while (days[dayIndex].length < TASKS_PER_CAMPAIGN_DAY) {
      const pickIndex = highs.findIndex((task) => fitsDay(days[dayIndex], task));
      if (pickIndex < 0) return null;
      days[dayIndex].push(highs.splice(pickIndex, 1)[0]);
    }
  }
  if (highs.length > 0 || normals.length > 0) return null;
  return days.map((day) => shuffled(day, random).map((task) => task.id));
}

// Known-valid arrangement used only if the constrained deal keeps failing; the
// seed still varies task order within each day.
const FALLBACK_DAY_TASK_IDS: string[][] = [
  ['medical-kit-expiry-audit', 'science-instrument-calibration', 'oxygen-loop-filter-service'],
  ['habitat-waterline-inspection', 'habitat-air-seal-check', 'battery-readiness-check'],
  ['solar-array-inspection', 'greenhouse-nutrient-balance', 'water-recycler-backflush'],
  ['rover-wheel-and-brake-check', 'solar-tracker-alignment', 'eva-suit-life-support-check'],
  ['communications-backup-beacon-test', 'nuclear-unit-coolant-check', 'radiation-shelter-seal-check'],
];

export function createCampaignSchedule(
  seed: number,
  definitions: readonly DailyChallengeDefinition[],
): string[][] {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const tasks = CAMPAIGN_TASK_IDS.map((id) => byId.get(id))
    .filter((task): task is DailyChallengeDefinition => Boolean(task));
  for (let attempt = 0; attempt < 512; attempt += 1) {
    const random = createRandomStream((seed + Math.imul(attempt, 0x9e3779b9)) >>> 0);
    const schedule = dealCampaign(tasks, random);
    if (schedule) return schedule;
  }
  const random = createRandomStream(seed);
  return FALLBACK_DAY_TASK_IDS.map((day) => shuffled(day, random));
}