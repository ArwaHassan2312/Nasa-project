export type SurvivalResourceKey = 'power' | 'oxygen' | 'water' | 'food' | 'health';

export type ResourceKey = 
  | "power" | "battery" | "oxygen" | "water" | "food" 
  | "habitat" | "equipment" | "health" | "radProtection" 
  | "comms" | "science" | "emergencyReserve" | "potentialWater";

export type SystemKey = "power" | "lifeSupport" | "water" | "equipment";

export interface Decision {
  id: string;
  label: string;
  effects: Partial<Record<SurvivalResourceKey | 'science', number>>;
  conditionEffects?: Partial<Record<SystemKey, number>>;
  benefit: string;
  cost: string;
  risk: string;
  setFlags?: string[];
  futureConsequence: string;
}

export interface EmergencyTaskDefinition {
  title: string;
  description: string;
  objective: string;
  actionLabel: string;
  targetComponentId: string;
  targetComponentName: string;
  affectedSystem: SystemKey;
  readinessFlag: string;
  responseDeadlineMs: number;
  escalationDelayMs: number;
  urgentConditionLoss: number;
  urgentResourceEffects: Partial<Record<ResourceKey, number>>;
  escalationConditionAtOrBelow: number;
  escalationConditionLoss: number;
  escalationResourceEffects: Partial<Record<ResourceKey, number>>;
  riskIfDelayed: string;
  completionFeedback: string;
}

export interface GameEvent {
  id: string;
  /** Unique identity and cause for this occurrence, even when reusing an event definition. */
  occurrenceId?: string;
  /** Regular event definition whose readiness mechanics this task variant retains. */
  sourceEventId?: string;
  triggerSource?: 'independent' | 'task';
  /** Consequence-only event shown during day closing, without player interaction. */
  endOfDayConsequence?: boolean;
  missedTaskTitle?: string;
  name: string;
  day?: number;
  severity: "low" | "medium" | "high" | "critical";
  situation: string;
  decisions: Decision[];
  lesson: string;
  affectedSystems: SystemKey[];
  riskResources: ResourceKey[];
  /** Integer reserve loss applied once when the incident is generated. */
  initialResourceEffects?: Partial<Record<ResourceKey, number>>;
  /** Integer resource loss per interval while the event remains unresolved. */
  ongoingResourceEffects?: Partial<Record<ResourceKey, number>>;
  ongoingEffectIntervalMs?: number;
  failureEffects: Partial<Record<ResourceKey, number>>;
  failureConditionEffects?: Partial<Record<SystemKey, number>>;
  failureFeedback: string;
  baseWeight: number;
  minDay: number;
  cooldownDays: number;
  maxOccurrences: number;
  requiredFlags?: string[];
  /** Unresolved overdue work that can trigger this event. */
  riskTaskIds?: string[];
  /** Completed preventive work that makes this event ineligible. */
  preventedByFlags?: string[];
  preparationFlags: string[];
  emergencyTask?: EmergencyTaskDefinition;
}

export const MOON_EVENTS: GameEvent[] = [
  {
    id: "fire_lab",
    name: "Fire in the Lab",
    severity: "critical",
    situation: "Smoke fills the lab! The fire could spread and damage the air system.",
    affectedSystems: ["lifeSupport", "equipment"],
    riskResources: ["oxygen", "habitat", "equipment", "health"],
    initialResourceEffects: { oxygen: -3, habitat: -4, equipment: -2 },
    ongoingResourceEffects: { oxygen: -1, habitat: -1, equipment: -1 },
    ongoingEffectIntervalMs: 8_000,
    failureEffects: { habitat: -35, equipment: -25, health: -20, oxygen: -30 },
    failureConditionEffects: { lifeSupport: -12, equipment: -10 },
    failureFeedback: 'The fire spread before it could be stopped. Next time, you can act sooner.',
    baseWeight: 1.1,
    minDay: 2,
    cooldownDays: 5,
    maxOccurrences: 2,
    riskTaskIds: ['workshop-equipment-maintenance'],
    preventedByFlags: ['workshopMaintenanceComplete'],
    preparationFlags: ['workshopMaintenanceComplete', 'habitatSealVerified'],
    emergencyTask: {
      title: 'Stop the Air Leak',
      description: 'Find and close the damaged air seals after the fire.',
      objective: 'Go to the Cylinder Habitat and stop the air leak.',
      actionLabel: 'Stop the air leak',
      targetComponentId: '001',
      targetComponentName: 'Cylinder Habitat',
      affectedSystem: 'lifeSupport',
      readinessFlag: 'habitatPressureLossContained',
      responseDeadlineMs: 60_000,
      escalationDelayMs: 60_000,
      urgentConditionLoss: 7,
      urgentResourceEffects: { oxygen: -4 },
      escalationConditionAtOrBelow: 80,
      escalationConditionLoss: 8,
      escalationResourceEffects: { oxygen: -7 },
      riskIfDelayed: 'The air leak is getting worse. More air could escape.',
      completionFeedback: 'The air leak is stopped before more air escapes.',
    },
    decisions: [
      {
        id: "A",
        label: "Close Off the Lab",
        effects: { oxygen: 5, power: -3 },
        conditionEffects: { lifeSupport: 8, equipment: 3 },
        benefit: "Oxygen +5; more air stays in the base",
        cost: "Power -3",
        risk: "Small risk",
        setFlags: ["labDamaged"],
        futureConsequence: "The lab will need repairs later"
      },
      {
        id: "B",
        label: "Fight the fire yourself",
        effects: { food: 4, power: -5 },
        conditionEffects: { lifeSupport: -8, equipment: -7 },
        benefit: "Food +4; you act quickly",
        cost: "Power -5",
        risk: "You could get hurt (30%)",
        setFlags: ["commanderInjured"],
        futureConsequence: "If you are hurt, outdoor work may need to wait"
      },
      {
        id: "C",
        label: "Turn Off the Lab",
        effects: { health: 8, power: -5 },
        conditionEffects: { lifeSupport: 5, power: -3 },
        benefit: "Commander safety +8; the fire is contained",
        cost: "Power -5",
        risk: "Less time for other jobs",
        setFlags: ["experimentsReset"],
        futureConsequence: "Experiments will need to start again"
      }
    ],
    lesson: "A fire in a sealed Moon home must be stopped quickly. You cannot let the air out to put it out."
  },
  {
    id: "power_failure",
    name: "Power Trouble",
    severity: "high",
    situation: "Oh no! The solar panels are making much less power than expected. Can you save power?",
    affectedSystems: ["power", "equipment"],
    riskResources: ["power", "battery", "equipment"],
    initialResourceEffects: { power: -4, battery: -4, equipment: -1 },
    ongoingResourceEffects: { power: -1, battery: -1, equipment: -1 },
    ongoingEffectIntervalMs: 8_000,
    failureEffects: { power: -30, battery: -25, equipment: -20 },
    failureConditionEffects: { power: -14, equipment: -6 },
    failureFeedback: 'Power stayed low and the backup supply ran down. Next time, act sooner.',
    baseWeight: 1.1,
    minDay: 2,
    cooldownDays: 5,
    maxOccurrences: 2,
    riskTaskIds: ['solar-array-inspection'],
    preventedByFlags: ['solarArrayInspected'],
    preparationFlags: ['batteryReadinessVerified'],
    emergencyTask: {
      title: 'Fix the Power Connections',
      description: 'Check the power connections and get the backup power working again.',
      objective: 'Go to the Battery Container and fix the power connections.',
      actionLabel: 'Fix power connections',
      targetComponentId: '015',
      targetComponentName: 'Battery Container',
      affectedSystem: 'power',
      readinessFlag: 'batteryBusRestored',
      responseDeadlineMs: 60_000,
      escalationDelayMs: 60_000,
      urgentConditionLoss: 7,
      urgentResourceEffects: { power: -5, battery: -4 },
      escalationConditionAtOrBelow: 75,
      escalationConditionLoss: 8,
      escalationResourceEffects: { power: -9, battery: -8 },
      riskIfDelayed: 'The loose power connections are using up the backup power.',
      completionFeedback: 'The power connections are fixed before the backup runs low.',
    },
    decisions: [
      {
        id: "A",
        label: "Save Power",
        effects: { power: 10, food: -5 },
        conditionEffects: { power: 5 },
        benefit: "Power +10",
        cost: "Food -5",
        risk: "Some outpost systems may slow down",
        futureConsequence: "Outpost research will take longer"
      },
      {
        id: "B",
        label: "Use Stored Power",
        effects: { power: 12, food: -5 },
        conditionEffects: { power: 8 },
        benefit: "Power +12; stored energy helps",
        cost: "Food -5",
        risk: "Not much backup power left",
        setFlags: ["batteryDrained"],
        futureConsequence: "Another power problem is more likely"
      },
      {
        id: "C",
        label: "Keep Everything Running",
        effects: { food: 8, health: -8 },
        conditionEffects: { power: -15, equipment: -4 },
        benefit: "Food +8; the outpost keeps working",
        cost: "Commander safety -8",
        risk: "The power could run too low",
        setFlags: ["powerDebt"],
        futureConsequence: "The outpost will need to save more power"
      }
    ],
    lesson: "Power is limited. Using the backup helps now, but leaves less for later."
  },
  {
    id: "solar_storm",
    name: "☀ Solar Storm",
    severity: "high",
    situation: "A solar storm is passing the outpost! It could harm the outside panels and drain power.",
    affectedSystems: ["power", "equipment"],
    riskResources: ["power", "battery", "radProtection", "health"],
    initialResourceEffects: { power: -3, battery: -3, radProtection: -2, health: -1 },
    ongoingResourceEffects: { power: -1, battery: -1, radProtection: -1, health: -1 },
    ongoingEffectIntervalMs: 10_000,
    failureEffects: { power: -25, battery: -20, radProtection: -30, health: -20 },
    failureConditionEffects: { power: -10 },
    failureFeedback: 'The storm passed before the panels were protected. Next time, get ready sooner.',
    baseWeight: 1,
    minDay: 2,
    cooldownDays: 5,
    maxOccurrences: 2,
    preparationFlags: ['solarArrayInspected'],
    emergencyTask: {
      title: 'Secure the Solar Panels',
      description: 'Check the panels for storm damage and secure any loose ones.',
      objective: 'Go to the Solar Array and secure the loose panels.',
      actionLabel: 'Secure solar panels',
      targetComponentId: '011',
      targetComponentName: 'Solar Array',
      affectedSystem: 'power',
      readinessFlag: 'stormDamageSecured',
      responseDeadlineMs: 60_000,
      escalationDelayMs: 60_000,
      urgentConditionLoss: 6,
      urgentResourceEffects: { power: -4 },
      escalationConditionAtOrBelow: 80,
      escalationConditionLoss: 7,
      escalationResourceEffects: { power: -8, battery: -4 },
      riskIfDelayed: 'The damaged panels are making less power and using up the backup.',
      completionFeedback: 'The loose panels are secure before the power gets worse.',
    },
    decisions: [
      {
        id: "A",
        label: "Go to the Storm Shelter",
        effects: { health: 5, food: -5 },
        conditionEffects: { power: 3 },
        benefit: "Commander safety +5",
        cost: "Food -5",
        risk: "Less time for other jobs",
        futureConsequence: "You stay protected"
      },
      {
        id: "B",
        label: "Keep Working Outside",
        effects: { food: 10, water: -5 },
        conditionEffects: { power: -12, equipment: -10 },
        benefit: "Food +10; you finish the work",
        cost: "Water -5",
        risk: "Radiation may harm you",
        setFlags: ["radiationExposed"],
        futureConsequence: "You may feel unwell later"
      },
      {
        id: "C",
        label: "Head to Shelter",
        effects: { health: 10, food: -5 },
        conditionEffects: { power: 2 },
        benefit: "Commander safety +10; you stay sheltered",
        cost: "Food -5",
        risk: "Other jobs may have to wait",
        futureConsequence: "Outdoor jobs will have to wait"
      }
    ],
    lesson: "Radiation can build up over time. A shelter and good timing help keep you safe."
  },
  {
    id: "lunar_night",
    name: "Lunar Night",
    severity: "critical",
    situation: "The Sun is setting, so the panels are making less power. Saved power can help keep the base safe through the long night.",
    affectedSystems: ["power", "lifeSupport"],
    riskResources: ["power", "battery", "oxygen"],
    initialResourceEffects: { power: -4, battery: -4, oxygen: -1 },
    ongoingResourceEffects: { power: -1, battery: -1, oxygen: -1 },
    ongoingEffectIntervalMs: 8_000,
    failureEffects: { power: -35, battery: -30, oxygen: -20 },
    failureConditionEffects: { power: -10, lifeSupport: -5 },
    failureFeedback: 'Resources got low during the long Moon night. Next time, plan ahead.',
    baseWeight: 0.8,
    minDay: 4,
    cooldownDays: 6,
    maxOccurrences: 1,
    preparationFlags: ['batteryReadinessVerified', 'solarArrayInspected'],
    decisions: [
      {
        id: "A",
        label: "Save Power for Night",
        effects: { power: 30, food: -10 },
        conditionEffects: { power: 4 },
        benefit: "Power +30",
        cost: "Food -10",
        risk: "Research will have to wait until morning",
        futureConsequence: "The outpost has more power to stay safe"
      },
      {
        id: "B",
        label: "Keep Working as Usual",
        effects: { food: 10, health: -8 },
        conditionEffects: { power: -12, lifeSupport: -4 },
        benefit: "Food +10; regular work continues",
        cost: "Commander safety -8",
        risk: "Power could run low in the dark",
        setFlags: ["powerDebt"],
        futureConsequence: "Power may run low again"
      },
      {
        id: "C",
        label: "Save Resources",
        effects: { power: 20, food: -5 },
        conditionEffects: { power: 3, lifeSupport: 2 },
        benefit: "Power +20",
        cost: "Food -5",
        risk: "Fewer jobs may get done",
        futureConsequence: "You stay safer, but fewer jobs get done"
      }
    ],
    lesson: "Plan ahead for the long Moon night. Saved power helps keep the base safe."
  },
  {
    id: "water_leak",
    name: "Water Leak",
    severity: "high",
    situation: "A water pipe just burst inside the habitat! Water is leaking out.",
    affectedSystems: ["water", "lifeSupport"],
    riskResources: ["water", "emergencyReserve", "oxygen", "equipment"],
    initialResourceEffects: { water: -5, emergencyReserve: -2, oxygen: -1 },
    ongoingResourceEffects: { water: -1, emergencyReserve: -1, oxygen: -1 },
    ongoingEffectIntervalMs: 6_000,
    failureEffects: { water: -30, emergencyReserve: -25, oxygen: -20, equipment: -15 },
    failureConditionEffects: { water: -14, lifeSupport: -4 },
    failureFeedback: 'The pipe kept leaking, so some backup water was lost. Next time, you can help stop the leak sooner.',
    baseWeight: 1.1,
    minDay: 2,
    cooldownDays: 5,
    maxOccurrences: 2,
    riskTaskIds: ['habitat-waterline-inspection'],
    preventedByFlags: ['waterLineInspected'],
    preparationFlags: ['waterLineInspected'],
    emergencyTask: {
      title: 'Fix the Leaking Water Pipe',
      description: 'Close off and fix the broken pipe before more water leaks out.',
      objective: 'Go to the Cylinder Habitat and fix the leaking pipe.',
      actionLabel: 'Repair waterline',
      targetComponentId: '001',
      targetComponentName: 'Cylinder Habitat',
      affectedSystem: 'water',
      readinessFlag: 'waterlineLeakRepaired',
      responseDeadlineMs: 60_000,
      escalationDelayMs: 60_000,
      urgentConditionLoss: 7,
      urgentResourceEffects: { water: -5 },
      escalationConditionAtOrBelow: 80,
      escalationConditionLoss: 8,
      escalationResourceEffects: { water: -9, emergencyReserve: -5 },
      riskIfDelayed: 'The leak is using up stored water. You may need the backup.',
      completionFeedback: 'The leak is fixed before you need backup water.',
    },
    decisions: [
      {
        id: "A",
        label: "Use Less Water",
        effects: { water: 15, health: -3 },
        conditionEffects: { water: 2 },
        benefit: "Water +15",
        cost: "Health -3",
        risk: "You may feel uncomfortable",
        futureConsequence: "The leak will keep going until the pipe is fixed"
      },
      {
        id: "B",
        label: "Fix the Pipe",
        effects: { water: 25, power: -8 },
        conditionEffects: { water: 12, equipment: -3 },
        benefit: "Water +25",
        cost: "Power -8",
        risk: "Some repair supplies will be used",
        setFlags: ["sparesLow"],
        futureConsequence: "Fewer repair parts will be left for later"
      },
      {
        id: "C",
        label: "Use Backup Water",
        effects: { water: 20, food: -8 },
        conditionEffects: { water: -5 },
        benefit: "Water +20",
        cost: "Food -8",
        risk: "There will be less backup water for later",
        futureConsequence: "Another leak could be harder to fix"
      }
    ],
    lesson: "Recycling water and saving a backup supply both help. Using one leaves less for later."
  },
  {
    id: "water_ice_exploration",
    name: "❄ Signs of Water Ice",
    severity: "medium",
    situation: "You found signs of ice in a nearby crater! You can look for water, but exploring uses power and wears down tools.",
    affectedSystems: ["water", "equipment", "power"],
    riskResources: ["power", "equipment"],
    failureEffects: { power: -15, equipment: -18 },
    failureConditionEffects: { equipment: -4 },
    failureFeedback: 'You did not find a useful ice sample this time. You can explore again and learn from another try.',
    baseWeight: 0.75,
    minDay: 1,
    cooldownDays: 6,
    maxOccurrences: 1,
    preparationFlags: ['workshopMaintenanceComplete'],
    decisions: [
      {
        id: "A",
        label: "Explore the Crater",
        effects: { water: 25, food: -8, science: 8 },
        conditionEffects: { water: 4, power: -5, equipment: -5 },
        benefit: "Water +25; Science +8; ice is collected",
        cost: "Food -8",
        risk: "Dust may slow the work and use power",
        futureConsequence: "You will learn sooner if the ice can help"
      },
      {
        id: "B",
        label: "Take a Small Sample",
        effects: { water: 12, food: -5, science: 4 },
        conditionEffects: { water: 2, power: -2 },
        benefit: "Water +12; Science +4; a small sample is collected",
        cost: "Food -5",
        risk: "The sample may not tell us much",
        futureConsequence: "It may take longer to learn if the ice can help"
      },
      {
        id: "C",
        label: "Skip the Search",
        effects: { power: 5, water: -5, science: -2 },
        conditionEffects: { power: 1 },
        benefit: "Power +5; Science -2",
        cost: "Water -5",
        risk: "You may miss useful ice",
        futureConsequence: "The ice search will not continue"
      }
    ],
    lesson: "Ice needs to be found and cleaned before you can use it for water."
  }
];

const TASK_CONSEQUENCE_VARIANTS = [
  {
    sourceId: 'power_failure',
    id: 'task_solar_array_fault',
    taskId: 'solar-array-inspection',
    name: 'Solar Panel Trouble',
    situation: 'The solar panel check was missed. Storm dust is covering the panels, so they are making less power.',
    failureFeedback: 'Storm dust kept covering the panels, and backup power got low. Next time, you can help clear them sooner.',
    decisionLabels: ['Shed the Storm Load', 'Use Backup Power', 'Isolate the Damaged Array'],
  },
  {
    sourceId: 'fire_lab',
    id: 'task_workshop_arc',
    taskId: 'workshop-equipment-maintenance',
    name: 'Workshop Tool Spark',
    situation: 'A workshop tool was not checked and made a spark! It scorched part of the habitat.',
    failureFeedback: 'The spark spread before it could be stopped. Next time, act sooner.',
    decisionLabels: ['Close the Workshop', 'Fight the fire yourself', 'Turn Off the Tools'],
  },
  {
    sourceId: 'water_leak',
    id: 'task_waterline_joint_failure',
    taskId: 'habitat-waterline-inspection',
    name: 'Broken Water Pipe',
    situation: 'A water pipe was not checked and has burst! Water is leaking into the service room.',
    failureFeedback: 'The pipe kept leaking, leaving less water for later. Next time, you can help find the leak sooner.',
    decisionLabels: ['Save Water Now', 'Fix the Pipe', 'Use Backup Water'],
  },
] as const;

// Independent scheduling uses MOON_EVENTS. Task failures use these separate
// definitions, which retain their source event's mechanical effects while
// carrying a distinct cause, identity, scenario, and response wording.
export const TASK_CONSEQUENCE_EVENTS: GameEvent[] = TASK_CONSEQUENCE_VARIANTS.map((variant) => {
  const source = MOON_EVENTS.find((event) => event.id === variant.sourceId);
  if (!source) throw new Error(`Missing source event definition: ${variant.sourceId}`);
  return {
    ...source,
    id: variant.id,
    sourceEventId: variant.sourceId,
    name: variant.name,
    situation: variant.situation,
    failureFeedback: variant.failureFeedback,
    riskTaskIds: [variant.taskId],
    decisions: source.decisions.map((decision, index) => ({
      ...decision,
      label: variant.decisionLabels[index] ?? decision.label,
    })),
  };
});
