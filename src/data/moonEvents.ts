export type ResourceKey = 
  | "power" | "battery" | "oxygen" | "water" | "food" 
  | "habitat" | "equipment" | "health" | "radProtection" 
  | "comms" | "science" | "emergencyReserve" | "potentialWater";

export type SystemKey = "power" | "lifeSupport" | "water" | "equipment";

export interface Decision {
  id: string;
  label: string;
  effects: Partial<Record<ResourceKey, number>>;
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
  name: string;
  day?: number;
  severity: "low" | "medium" | "high" | "critical";
  situation: string;
  decisions: Decision[];
  lesson: string;
  affectedSystems: SystemKey[];
  riskResources: ResourceKey[];
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
    name: "Fire in Habitat",
    severity: "critical",
    situation: "Fire detected in the laboratory module. It could spread and consume oxygen.",
    affectedSystems: ["lifeSupport", "equipment"],
    riskResources: ["oxygen", "habitat", "equipment"],
    failureEffects: { habitat: -18, equipment: -12, health: -8, oxygen: -8 },
    failureConditionEffects: { lifeSupport: -12, equipment: -10 },
    failureFeedback: 'The habitat fire spread before the crew could contain it.',
    baseWeight: 1.1,
    minDay: 2,
    cooldownDays: 5,
    maxOccurrences: 2,
    riskTaskIds: ['workshop-equipment-maintenance'],
    preventedByFlags: ['workshopMaintenanceComplete'],
    preparationFlags: ['workshopMaintenanceComplete', 'habitatSealVerified'],
    emergencyTask: {
      title: 'Contain Habitat Pressure Loss',
      description: 'Inspect and isolate the affected habitat seals after the fire response.',
      objective: 'Reach the Cylinder Habitat and isolate the pressure leak.',
      actionLabel: 'Isolate habitat pressure leak',
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
      riskIfDelayed: 'The habitat pressure leak is worsening; life support and oxygen are at risk.',
      completionFeedback: 'Habitat pressure loss isolated before the next stage of life-support damage.',
    },
    decisions: [
      {
        id: "A",
        label: "Isolate Lab",
        effects: { habitat: 5, oxygen: -5, science: -10 },
        conditionEffects: { lifeSupport: 8, equipment: 3 },
        benefit: "Habitat +5; spread chance reduced",
        cost: "Oxygen -5, Science -10",
        risk: "Low",
        setFlags: ["labDamaged"],
        futureConsequence: "Lab needs repair later"
      },
      {
        id: "B",
        label: "Send Astronaut",
        effects: { science: 5, health: -8, oxygen: -3, equipment: -5 },
        conditionEffects: { lifeSupport: -8, equipment: -7 },
        benefit: "Science +5; equipment saved",
        cost: "Health -8, Oxygen -3, Equipment -5",
        risk: "Astronaut injury (30%)",
        setFlags: ["crewInjured"],
        futureConsequence: "If injured: EVA capacity reduced"
      },
      {
        id: "C",
        label: "Emergency Shutdown",
        effects: { habitat: 10, power: -2, science: -20 },
        conditionEffects: { lifeSupport: 5, power: -3 },
        benefit: "Habitat +10; fire risk down",
        cost: "Power -2, Science -20",
        risk: "Lost progress",
        setFlags: ["experimentsReset"],
        futureConsequence: "Experiments restart"
      }
    ],
    lesson: "Fire in a sealed habitat needs containment before recovery; no venting option exists."
  },
  {
    id: "power_failure",
    name: "Power Failure",
    severity: "high",
    situation: "Solar generation is far below expectation.",
    affectedSystems: ["power", "equipment"],
    riskResources: ["power", "battery", "equipment"],
    failureEffects: { power: -18, battery: -12, equipment: -8 },
    failureConditionEffects: { power: -14, equipment: -6 },
    failureFeedback: 'The power system remained offline and reserve capacity was depleted.',
    baseWeight: 1.1,
    minDay: 2,
    cooldownDays: 5,
    maxOccurrences: 2,
    riskTaskIds: ['solar-array-inspection'],
    preventedByFlags: ['solarArrayInspected'],
    preparationFlags: ['batteryReadinessVerified'],
    emergencyTask: {
      title: 'Restore Battery Bus',
      description: 'Inspect the battery bus after the power failure and restore stable distribution.',
      objective: 'Reach the Battery Container and restore the battery bus.',
      actionLabel: 'Restore battery bus',
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
      riskIfDelayed: 'The unstable power bus is drawing down the battery reserve.',
      completionFeedback: 'Battery bus stabilized before the power shortfall escalated.',
    },
    decisions: [
      {
        id: "A",
        label: "Low Power Mode",
        effects: { power: 10, science: -15, food: -5 },
        conditionEffects: { power: 5 },
        benefit: "Power +10",
        cost: "Science -15, Food -5",
        risk: "Systems under capacity",
        futureConsequence: "Slower recovery of Science"
      },
      {
        id: "B",
        label: "Use Battery Reserve",
        effects: { power: 20, battery: -25 },
        conditionEffects: { power: 8 },
        benefit: "Power +20",
        cost: "Battery -25",
        risk: "Little reserve for emergencies",
        setFlags: ["batteryDrained"],
        futureConsequence: "Power emergency probability up"
      },
      {
        id: "C",
        label: "Full Operations",
        effects: { science: 10, power: -25 },
        conditionEffects: { power: -15, equipment: -4 },
        benefit: "Science +10",
        cost: "Power -25",
        risk: "Power crisis likely",
        setFlags: ["powerDebt"],
        futureConsequence: "Power debt and crisis risk"
      }
    ],
    lesson: "Energy is a budget; spending reserves buys time but borrows from the future."
  },
  {
    id: "solar_storm",
    name: "☀ Solar Storm",
    severity: "high",
    situation: "A solar storm has reached the outpost. External equipment and power systems are at risk.",
    affectedSystems: ["power", "equipment"],
    riskResources: ["power", "battery", "equipment"],
    failureEffects: { power: -12, battery: -10, radProtection: -8, health: -5 },
    failureConditionEffects: { power: -10 },
    failureFeedback: 'The solar storm passed without the array being secured.',
    baseWeight: 1,
    minDay: 2,
    cooldownDays: 5,
    maxOccurrences: 2,
    preparationFlags: ['solarArrayInspected'],
    emergencyTask: {
      title: 'Secure Storm-Damaged Solar Array',
      description: 'Inspect the solar array for storm damage and secure vulnerable panels.',
      objective: 'Reach the Solar Array and secure the damaged panels.',
      actionLabel: 'Secure solar array',
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
      riskIfDelayed: 'Storm damage is reducing solar output and can drain the battery reserve.',
      completionFeedback: 'Storm-damaged panels secured before power-system condition worsened.',
    },
    decisions: [
      {
        id: "A",
        label: "Radiation Shelter",
        effects: { health: 5, science: -15, power: -5 },
        conditionEffects: { power: 3 },
        benefit: "Health +5",
        cost: "Science -15, Power -5",
        risk: "Lost work time",
        futureConsequence: "Safe; none"
      },
      {
        id: "B",
        label: "Continue EVA",
        effects: { science: 20, radProtection: -30, health: -20 },
        conditionEffects: { power: -12, equipment: -10 },
        benefit: "Science +20",
        cost: "Radiation Prot. -30, Health -20",
        risk: "Radiation exposure",
        setFlags: ["radiationExposed"],
        futureConsequence: "Later Health loss"
      },
      {
        id: "C",
        label: "Cancel External Ops",
        effects: { radProtection: 5, health: 5, science: -10 },
        conditionEffects: { power: 2 },
        benefit: "Radiation Prot. +5, Health +5",
        cost: "Science -10",
        risk: "Backlog",
        futureConsequence: "EVA tasks delayed"
      }
    ],
    lesson: "Radiation risk is cumulative; shielding and timing matter more than tough choices in the moment."
  },
  {
    id: "lunar_night",
    name: "Lunar Night",
    severity: "critical",
    situation: "Low-light conditions are reducing solar generation. Battery reserves will determine how safely the outpost can operate.",
    affectedSystems: ["power", "lifeSupport"],
    riskResources: ["power", "battery", "oxygen"],
    failureEffects: { power: -15, battery: -10, oxygen: -6, food: -4 },
    failureConditionEffects: { power: -10, lifeSupport: -5 },
    failureFeedback: 'The crew failed to protect reserves through the lunar night.',
    baseWeight: 0.8,
    minDay: 4,
    cooldownDays: 6,
    maxOccurrences: 1,
    preparationFlags: ['batteryReadinessVerified', 'solarArrayInspected'],
    decisions: [
      {
        id: "A",
        label: "Max Battery Preparation",
        effects: { power: 30, science: -10 },
        conditionEffects: { power: 4 },
        benefit: "Stored Power +30",
        cost: "Science -10",
        risk: "Less science before night",
        futureConsequence: "Strong survival margin"
      },
      {
        id: "B",
        label: "Normal Operations",
        effects: { science: 10, power: -20 },
        conditionEffects: { power: -12, lifeSupport: -4 },
        benefit: "Science +10",
        cost: "Stored Power -20",
        risk: "Battery runs dry in darkness",
        setFlags: ["powerDebt"],
        futureConsequence: "Power shortage risk increases"
      },
      {
        id: "C",
        label: "Survival Mode",
        effects: { power: 20, science: -20, food: -5 },
        conditionEffects: { power: 3, lifeSupport: 2 },
        benefit: "Stored Power +20",
        cost: "Science -20, Food -5",
        risk: "Low productivity",
        futureConsequence: "Safe but slow operations"
      }
    ],
    lesson: "Energy planning ahead of an inevitable event is a core Moon skill."
  },
  {
    id: "water_leak",
    name: "💧 Water Leak",
    severity: "high",
    situation: "A water pipe joint has ruptured inside the habitat infrastructure.",
    affectedSystems: ["water", "lifeSupport"],
    riskResources: ["water", "emergencyReserve", "oxygen"],
    failureEffects: { water: -20, emergencyReserve: -12, oxygen: -5, equipment: -5 },
    failureConditionEffects: { water: -14, lifeSupport: -4 },
    failureFeedback: 'The water leak continued and contaminated reserve capacity.',
    baseWeight: 1.1,
    minDay: 2,
    cooldownDays: 5,
    maxOccurrences: 2,
    riskTaskIds: ['habitat-waterline-inspection'],
    preventedByFlags: ['waterLineInspected'],
    preparationFlags: ['waterLineInspected'],
    emergencyTask: {
      title: 'Repair Habitat Waterline',
      description: 'Isolate and repair the ruptured waterline before reserves fall further.',
      objective: 'Reach the Cylinder Habitat and repair the leaking waterline.',
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
      riskIfDelayed: 'The leak is consuming stored water and may force use of the emergency reserve.',
      completionFeedback: 'Waterline leak repaired before the emergency reserve was needed.',
    },
    decisions: [
      {
        id: "A",
        label: "Reduce Consumption",
        effects: { water: 15, health: -3 },
        conditionEffects: { water: 2 },
        benefit: "Water +15",
        cost: "Health -3",
        risk: "Crew discomfort",
        futureConsequence: "Leak persists if unrepaired"
      },
      {
        id: "B",
        label: "Repair System",
        effects: { water: 25, equipment: -10, power: -8 },
        conditionEffects: { water: 12, equipment: -3 },
        benefit: "Water +25",
        cost: "Equipment -10, Power -8",
        risk: "Spare parts use",
        setFlags: ["sparesLow"],
        futureConsequence: "Fewer spares for future"
      },
      {
        id: "C",
        label: "Emergency Reserve",
        effects: { water: 20, emergencyReserve: -20 },
        conditionEffects: { water: -5 },
        benefit: "Water +20",
        cost: "Emergency Reserve -20",
        risk: "Low reserve",
        futureConsequence: "Future water events more dangerous"
      }
    ],
    lesson: "Recycling and reserves are layered defenses; each layer used leaves less margin."
  },
  {
    id: "water_ice_exploration",
    name: "❄ Possible Water Ice",
    severity: "medium",
    situation: "Orbital sensors detected high hydrogen signatures in a nearby crater rim.",
    affectedSystems: ["water", "equipment", "power"],
    riskResources: ["water", "power", "equipment"],
    failureEffects: { power: -8, equipment: -5 },
    failureConditionEffects: { equipment: -4 },
    failureFeedback: 'The ice survey was abandoned before the crew could secure a useful result.',
    baseWeight: 0.75,
    minDay: 1,
    cooldownDays: 6,
    maxOccurrences: 1,
    preparationFlags: ['workshopMaintenanceComplete'],
    decisions: [
      {
        id: "A",
        label: "Full Investigation",
        effects: { potentialWater: 40, power: -20, equipment: -10 },
        conditionEffects: { water: 4, power: -5, equipment: -5 },
        benefit: "Potential Water +40",
        cost: "Power -20, Equipment -10",
        risk: "Dust/power strain",
        futureConsequence: "Faster Confirmation"
      },
      {
        id: "B",
        label: "Limited Sampling",
        effects: { potentialWater: 20, power: -10 },
        conditionEffects: { water: 2, power: -2 },
        benefit: "Potential Water +20",
        cost: "Power -10",
        risk: "Uncertain result",
        futureConsequence: "Slower chain"
      },
      {
        id: "C",
        label: "Ignore",
        effects: { power: 5, science: -5 },
        conditionEffects: { power: 1 },
        benefit: "Power +5",
        cost: "Science -5",
        risk: "Missed opportunity",
        futureConsequence: "Chain not started"
      }
    ],
    lesson: "Resources must be confirmed, extracted and processed before they help."
  },
  {
    id: "oxygen_plant_failure",
    name: "Regolith Plant Fault",
    severity: "high",
    situation: "The digester has jammed on a hard rock seam. Oxygen extraction from the regolith has stopped and the tanks are draining.",
    affectedSystems: ["lifeSupport"],
    riskResources: ["oxygen", "health", "power"],
    failureEffects: { oxygen: -12, health: -5, power: -4 },
    failureConditionEffects: { lifeSupport: -11 },
    failureFeedback: 'The digester stayed seized and the reserve oxygen kept draining while the crew worked around it.',
    baseWeight: 1.0,
    minDay: 3,
    cooldownDays: 5,
    maxOccurrences: 2,
    riskTaskIds: ['regolith-plant-maintenance'],
    preventedByFlags: ['regolithPlantMaintained'],
    preparationFlags: ['regolithPlantMaintained'],
    emergencyTask: {
      title: 'Clear the Digester Jam',
      description: 'Clear the rock jam and restart the regolith digester before the oxygen reserve runs down.',
      objective: 'Reach the Regolith Plant and run an emergency maintenance cycle.',
      actionLabel: 'Clear digester jam',
      targetComponentId: '025',
      targetComponentName: 'Regolith Plant',
      affectedSystem: 'lifeSupport',
      readinessFlag: 'regolithDigesterCleared',
      responseDeadlineMs: 60_000,
      escalationDelayMs: 60_000,
      urgentConditionLoss: 6,
      urgentResourceEffects: { oxygen: -5 },
      escalationConditionAtOrBelow: 75,
      escalationConditionLoss: 8,
      escalationResourceEffects: { oxygen: -8, health: -3 },
      riskIfDelayed: 'The jam is compacting further; every minute without a cycle drains more of the oxygen reserve.',
      completionFeedback: 'Digester cleared and restarted. Oxygen production is back online.',
    },
    decisions: [
      {
        id: "A",
        label: "Seal and Bypass",
        effects: { oxygen: -6, equipment: 4, power: 3 },
        conditionEffects: { lifeSupport: 5, equipment: 3 },
        benefit: "Life support protected; tanks stop draining",
        cost: "Oxygen -6, extraction offline for the day",
        risk: "Low",
        setFlags: ["digesterBypassed"],
        futureConsequence: "No regolith oxygen until the bypass is removed"
      },
      {
        id: "B",
        label: "Manual Jam Clear",
        effects: { oxygen: 4, health: -7, equipment: -5 },
        conditionEffects: { lifeSupport: -4, equipment: -5 },
        benefit: "Extraction restored immediately; Oxygen +4",
        cost: "Health -7, Equipment -5",
        risk: "Crew injury at the crusher (30%)",
        setFlags: ["digesterCleared"],
        futureConsequence: "Worn crusher teeth need servicing sooner"
      },
      {
        id: "C",
        label: "Vent and Wait",
        effects: { oxygen: -11, science: 6, health: -3 },
        conditionEffects: { lifeSupport: -8 },
        benefit: "No crew exposure; Science +6 from the seam sample",
        cost: "Oxygen -11, Life support -8",
        risk: "Medium — tanks keep draining",
        futureConsequence: "Reserve oxygen is lower for later incidents"
      }
    ],
    lesson: "Regolith processing is the outpost's oxygen lifeline — a jammed digester is a life-support emergency."
  }
];

const TASK_CONSEQUENCE_VARIANTS = [
  {
    sourceId: 'power_failure',
    id: 'task_solar_array_fault',
    taskId: 'solar-array-inspection',
    name: 'Uninspected Solar Array Fault',
    situation: 'The missed solar-array inspection left storm debris lodged in the panel hinges. Output has fallen and the battery bus is under strain.',
    failureFeedback: 'The uninspected array fault persisted, cutting generation and draining reserve power.',
    decisionLabels: ['Shed the Storm Load', 'Reroute Through the Battery Bus', 'Isolate the Damaged Array'],
  },
  {
    sourceId: 'fire_lab',
    id: 'task_workshop_arc',
    taskId: 'workshop-equipment-maintenance',
    name: 'Workshop Calibration Arc',
    situation: 'The missed workshop calibration allowed a misaligned tool head to arc during operation, scorching nearby habitat equipment.',
    failureFeedback: 'The workshop arc spread into nearby habitat equipment before it could be isolated.',
    decisionLabels: ['Isolate the Workshop', 'Send a Crew Technician', 'Shut Down the Tool Bank'],
  },
  {
    sourceId: 'water_leak',
    id: 'task_waterline_joint_failure',
    taskId: 'habitat-waterline-inspection',
    name: 'Uninspected Waterline Joint Failure',
    situation: 'The unchecked habitat joint has failed under pressure. Water is escaping into the service compartment and threatening reserve capacity.',
    failureFeedback: 'The unchecked joint continued leaking and contaminated reserve capacity.',
    decisionLabels: ['Ration Water Immediately', 'Patch the Failed Joint', 'Switch to Emergency Reserve'],
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
