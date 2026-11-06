import type { ResourceKey, SystemKey } from './moonEvents';

export type DailyChallengePriority = 'critical' | 'high' | 'normal';

export interface DailyChallengeDefinition {
  id: string;
  taskType: 'resource-protection' | 'event-prevention';
  title: string;
  description: string;
  objective: string;
  actionLabel: string;
  priority: DailyChallengePriority;
  targetComponentId: string;
  targetComponentName: string;
  readinessFlag: string;
  completionFeedback: string;
  deadlineDay: number;
  affectedSystem: SystemKey;
  conditionRecovery: number;
  completionResourceEffects?: Partial<Record<ResourceKey, number>>;
  missedResourceEffects?: Partial<Record<ResourceKey, number>>;
  overdueConditionLoss: number;
  responseDeadlineMs?: number;
  escalationDelayMs?: number;
  urgentConditionLoss?: number;
  urgentResourceEffects?: Partial<Record<ResourceKey, number>>;
  escalationConditionAtOrBelow?: number;
  escalationConditionLoss?: number;
  escalationResourceEffects?: Partial<Record<ResourceKey, number>>;
  emergency?: boolean;
  riskIfDelayed: string;
  postponement: {
    warning: string;
    immediateConditionLoss?: number;
    riskOnlyConsequence: string;
  };
}

export const DAILY_CHALLENGES: DailyChallengeDefinition[] = [
  {
    id: 'battery-readiness-check',
    taskType: 'resource-protection',
    title: 'Battery Readiness Check',
    description: 'Verify the reserve battery system before it is needed.',
    objective: 'Reach the Battery Container and run its reserve readiness check.',
    actionLabel: 'Run battery readiness check',
    priority: 'high',
    targetComponentId: '015',
    targetComponentName: 'Battery Container',
    readinessFlag: 'batteryReadinessVerified',
    completionFeedback: 'Battery reserve readiness verified. A later power-failure response can use the reserve more efficiently.',
    deadlineDay: 3,
    affectedSystem: 'power',
    conditionRecovery: 8,
    completionResourceEffects: { battery: 2 },
    missedResourceEffects: { battery: -7 },
    overdueConditionLoss: 6,
    urgentConditionLoss: 4,
    urgentResourceEffects: { battery: -4 },
    escalationConditionAtOrBelow: 82,
    escalationConditionLoss: 5,
    escalationResourceEffects: { battery: -6, power: -3 },
    riskIfDelayed: 'Battery reliability can fall, leaving less reserve for a power emergency.',
    postponement: {
      warning: 'The reserve battery may not deliver reliable power during an outage.',
      immediateConditionLoss: 4,
      riskOnlyConsequence: 'Battery-failure risk remains elevated until this check is complete.',
    },
  },
  {
    id: 'workshop-equipment-maintenance',
    taskType: 'event-prevention',
    title: 'Workshop Equipment Maintenance',
    description: 'Calibrate workshop equipment while the outpost is operating normally.',
    objective: 'Reach the Workshop and complete the equipment calibration.',
    actionLabel: 'Calibrate workshop equipment',
    priority: 'normal',
    targetComponentId: '010',
    targetComponentName: 'Workshop',
    readinessFlag: 'workshopMaintenanceComplete',
    completionFeedback: 'Workshop equipment calibrated. A habitat fire caused by faulty workshop gear is prevented this mission.',
    deadlineDay: 4,
    affectedSystem: 'equipment',
    conditionRecovery: 7,
    overdueConditionLoss: 5,
    responseDeadlineMs: 60_000,
    riskIfDelayed: 'If this task becomes overdue, unmaintained workshop equipment can trigger a habitat fire.',
    postponement: {
      warning: 'Calibration can wait, but equipment readiness will remain lower.',
      riskOnlyConsequence: 'Equipment risk remains elevated until calibration is complete.',
    },
  },
  {
    id: 'habitat-waterline-inspection',
    taskType: 'event-prevention',
    title: 'Habitat Waterline Inspection',
    description: 'Inspect habitat water-system connections and identify the repair points.',
    objective: 'Reach the Cylinder Habitat and complete the waterline inspection.',
    actionLabel: 'Inspect habitat waterlines',
    priority: 'normal',
    targetComponentId: '001',
    targetComponentName: 'Cylinder Habitat',
    readinessFlag: 'waterLineInspected',
    completionFeedback: 'Waterline inspection complete. Weak joints are secured, preventing a habitat water leak this mission.',
    deadlineDay: 6,
    affectedSystem: 'water',
    conditionRecovery: 8,
    overdueConditionLoss: 6,
    responseDeadlineMs: 60_000,
    riskIfDelayed: 'If this task becomes overdue, an unchecked habitat joint can trigger a water leak.',
    postponement: {
      warning: 'Uninspected joints make a leak harder to contain.',
      riskOnlyConsequence: 'Water-system risk remains elevated until the inspection is complete.',
    },
  },
  {
    id: 'habitat-air-seal-check',
    taskType: 'resource-protection',
    title: 'Habitat Air-Seal Check',
    description: 'Inspect habitat seals and verify that the crew can isolate a damaged module safely.',
    objective: 'Reach the Cylinder Habitat and complete the air-seal check.',
    actionLabel: 'Check habitat air seals',
    priority: 'normal',
    targetComponentId: '001',
    targetComponentName: 'Cylinder Habitat',
    readinessFlag: 'habitatSealVerified',
    completionFeedback: 'Habitat air seals verified. The crew is better prepared to contain a habitat emergency.',
    deadlineDay: 5,
    affectedSystem: 'lifeSupport',
    conditionRecovery: 7,
    overdueConditionLoss: 5,
    riskIfDelayed: 'A later habitat fault may place more strain on life support.',
    postponement: {
      warning: 'Seal condition will remain uncertain, but this check can be safely deferred for now.',
      riskOnlyConsequence: 'Habitat air-seal risk remains elevated until the check is complete.',
    },
  },
  {
    id: 'solar-array-inspection',
    taskType: 'event-prevention',
    title: 'Solar Panel Inspection',
    description: 'Inspect the solar array and confirm that power-generation equipment is ready for a storm.',
    objective: 'Reach the Solar Array and complete the inspection.',
    actionLabel: 'Inspect solar array',
    priority: 'critical',
    targetComponentId: '011',
    targetComponentName: 'Solar Array',
    readinessFlag: 'solarArrayInspected',
    completionFeedback: 'Solar array inspection complete. A preventable solar-generation failure is avoided this mission.',
    deadlineDay: 1,
    affectedSystem: 'power',
    conditionRecovery: 10,
    completionResourceEffects: { power: 3 },
    overdueConditionLoss: 8,
    responseDeadlineMs: 60_000,
    escalationDelayMs: 60_000,
    urgentConditionLoss: 6,
    urgentResourceEffects: { power: -4 },
    escalationConditionAtOrBelow: 80,
    escalationConditionLoss: 7,
    escalationResourceEffects: { power: -8, battery: -4 },
    emergency: true,
    riskIfDelayed: 'If this task becomes overdue, an undetected solar-array fault can trigger a power failure.',
    postponement: {
      warning: 'The solar array may fail to shed storm debris or maintain output. Confirming postponement immediately degrades the power system.',
      immediateConditionLoss: 5,
      riskOnlyConsequence: 'Solar-storm risk remains elevated until the array is inspected.',
    },
  },
  {
    id: 'regolith-plant-maintenance',
    taskType: 'event-prevention',
    title: 'Regolith Plant Maintenance',
    description: 'Service the digester so it keeps baking breathable oxygen out of the lunar soil.',
    objective: 'Reach the Regolith Plant and run its maintenance cycle.',
    actionLabel: 'Run regolith maintenance',
    priority: 'critical',
    targetComponentId: '025',
    targetComponentName: 'Regolith Plant',
    readinessFlag: 'regolithPlantMaintained',
    completionFeedback: 'Digester serviced and purged. Oxygen extraction from the regolith is back at full yield.',
    deadlineDay: 2,
    affectedSystem: 'lifeSupport',
    conditionRecovery: 9,
    completionResourceEffects: { oxygen: 6 },
    missedResourceEffects: { oxygen: -9 },
    overdueConditionLoss: 7,
    responseDeadlineMs: 60_000,
    escalationDelayMs: 60_000,
    urgentConditionLoss: 5,
    urgentResourceEffects: { oxygen: -4 },
    escalationConditionAtOrBelow: 78,
    escalationConditionLoss: 6,
    escalationResourceEffects: { oxygen: -7, power: -3 },
    riskIfDelayed: 'If this task becomes overdue, a clogged digester can choke the only oxygen source on the surface.',
    postponement: {
      warning: 'The digester will keep running unserviced; oxygen yield and the life-support margin both fall.',
      immediateConditionLoss: 4,
      riskOnlyConsequence: 'Life-support risk stays elevated until the digester is serviced.',
    },
  },
];
