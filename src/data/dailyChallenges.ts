export type DailyChallengePriority = 'high' | 'standard';

export interface DailyChallengeDefinition {
  id: string;
  title: string;
  description: string;
  objective: string;
  actionLabel: string;
  priority: DailyChallengePriority;
  targetComponentId: string;
  targetComponentName: string;
  readinessFlag: string;
  completionFeedback: string;
}

export const DAILY_CHALLENGES: DailyChallengeDefinition[] = [
  {
    id: 'battery-readiness-check',
    title: 'Battery Readiness Check',
    description: 'Verify the reserve battery system before it is needed.',
    objective: 'Reach the Battery Container and run its reserve readiness check.',
    actionLabel: 'Run battery readiness check',
    priority: 'high',
    targetComponentId: '015',
    targetComponentName: 'Battery Container',
    readinessFlag: 'batteryReadinessVerified',
    completionFeedback: 'Battery reserve readiness verified. A later power-failure response can use the reserve more efficiently.',
  },
  {
    id: 'workshop-equipment-maintenance',
    title: 'Workshop Equipment Maintenance',
    description: 'Calibrate workshop equipment while the outpost is operating normally.',
    objective: 'Reach the Workshop and complete the equipment calibration.',
    actionLabel: 'Calibrate workshop equipment',
    priority: 'high',
    targetComponentId: '010',
    targetComponentName: 'Workshop',
    readinessFlag: 'workshopMaintenanceComplete',
    completionFeedback: 'Workshop equipment calibrated. The crew is better prepared to contain a laboratory fire.',
  },
  {
    id: 'habitat-waterline-inspection',
    title: 'Habitat Waterline Inspection',
    description: 'Inspect habitat water-system connections and identify the repair points.',
    objective: 'Reach the Cylinder Habitat and complete the waterline inspection.',
    actionLabel: 'Inspect habitat waterlines',
    priority: 'standard',
    targetComponentId: '001',
    targetComponentName: 'Cylinder Habitat',
    readinessFlag: 'waterLineInspected',
    completionFeedback: 'Waterline inspection complete. The crew has identified the repair points before a leak occurs.',
  },
];
