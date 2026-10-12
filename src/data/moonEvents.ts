export type ResourceKey = 
  | "power" | "battery" | "oxygen" | "water" | "food" 
  | "habitat" | "equipment" | "health" | "radProtection" 
  | "comms" | "science" | "emergencyReserve" | "potentialWater";

export interface Decision {
  id: string;
  label: string;
  effects: Partial<Record<ResourceKey, number>>;
  benefit: string;
  cost: string;
  risk: string;
  setFlags?: string[];
  futureConsequence: string;
}

export interface GameEvent {
  id: string;
  name: string;
  day: number;
  severity: "low" | "medium" | "high" | "critical";
  situation: string;
  decisions: Decision[];
  lesson: string;
}

export const MOON_EVENTS: GameEvent[] = [
  {
    id: "fire_lab",
    name: "Fire in Habitat",
    day: 5,
    severity: "critical",
    situation: "Fire detected in the laboratory module. It could spread and consume oxygen.",
    decisions: [
      {
        id: "A",
        label: "Isolate Lab",
        effects: { habitat: 5, oxygen: -5, science: -10 },
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
    day: 10,
    severity: "high",
    situation: "Solar generation is far below expectation.",
    decisions: [
      {
        id: "A",
        label: "Low Power Mode",
        effects: { power: 10, science: -15, food: -5 },
        benefit: "Power +10",
        cost: "Science -15, Food -5",
        risk: "Systems under capacity",
        futureConsequence: "Slower recovery of Science"
      },
      {
        id: "B",
        label: "Use Battery Reserve",
        effects: { power: 20, battery: -25 },
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
    day: 15,
    severity: "high",
    situation: "A strong solar storm is approaching; EVA crews are exposed.",
    decisions: [
      {
        id: "A",
        label: "Radiation Shelter",
        effects: { health: 5, science: -15, power: -5 },
        benefit: "Health +5",
        cost: "Science -15, Power -5",
        risk: "Lost work time",
        futureConsequence: "Safe; none"
      },
      {
        id: "B",
        label: "Continue EVA",
        effects: { science: 20, radProtection: -30, health: -20 },
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
    day: 20,
    severity: "critical",
    situation: "The 14-day lunar night is beginning. Solar generation drops to zero. Battery reserve is vital.",
    decisions: [
      {
        id: "A",
        label: "Max Battery Preparation",
        effects: { power: 30, science: -10 },
        benefit: "Stored Power +30",
        cost: "Science -10",
        risk: "Less science before night",
        futureConsequence: "Strong survival margin"
      },
      {
        id: "B",
        label: "Normal Operations",
        effects: { science: 10, power: -20 },
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
    day: 25,
    severity: "high",
    situation: "A water pipe joint has ruptured inside the habitat infrastructure.",
    decisions: [
      {
        id: "A",
        label: "Reduce Consumption",
        effects: { water: 15, health: -3 },
        benefit: "Water +15",
        cost: "Health -3",
        risk: "Crew discomfort",
        futureConsequence: "Leak persists if unrepaired"
      },
      {
        id: "B",
        label: "Repair System",
        effects: { water: 25, equipment: -10, power: -8 },
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
    day: 28,
    severity: "medium",
    situation: "Orbital sensors detected high hydrogen signatures in a nearby crater rim.",
    decisions: [
      {
        id: "A",
        label: "Full Investigation",
        effects: { potentialWater: 40, power: -20, equipment: -10 },
        benefit: "Potential Water +40",
        cost: "Power -20, Equipment -10",
        risk: "Dust/power strain",
        futureConsequence: "Faster Confirmation"
      },
      {
        id: "B",
        label: "Limited Sampling",
        effects: { potentialWater: 20, power: -10 },
        benefit: "Potential Water +20",
        cost: "Power -10",
        risk: "Uncertain result",
        futureConsequence: "Slower chain"
      },
      {
        id: "C",
        label: "Ignore",
        effects: { power: 5, science: -5 },
        benefit: "Power +5",
        cost: "Science -5",
        risk: "Missed opportunity",
        futureConsequence: "Chain not started"
      }
    ],
    lesson: "Resources must be confirmed, extracted and processed before they help."
  }
];