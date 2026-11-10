import type { DailyChallengeDefinition } from './dailyChallenges';

export interface TaskToolChoice {
  id: string;
  name: string;
  picture: 'cable' | 'wrench' | 'brush' | 'patch' | 'tester' | 'watering' | 'checklist' | 'screwdriver' | 'clamp' | 'scissors' | 'gloves' | 'cloth';
}

export type RepairPartKey = 'waterSeal' | 'oxygenFilter' | 'solarPatch';

export interface RepairStrategy {
  id: string;
  name: string;
  description: string;
  toolId: string;
  partsCost?: Partial<Record<RepairPartKey, number>>;
  steps: string[];
  verificationQuestion: string;
  verificationOptions: { id: string; label: string }[];
  correctVerificationId: string;
  resourceEffects: Partial<Record<'water' | 'oxygen' | 'power', number>>;
  conditionRecovery: number;
}

export interface RepairActivity {
  diagnosisToolId: string;
  diagnosisPrompt: string;
  strategies: RepairStrategy[];
}

export interface DailyTaskExperience {
  scenario: string;
  picture: string;
  parts: [string, string, string];
  brokenPart: string;
  hint: string;
  tools: [TaskToolChoice, TaskToolChoice, TaskToolChoice];
  correctTool: string;
  action: string;
  fact: string;
  repair?: RepairActivity;
}

export type TaskRepairGesture = 'rotate' | 'adjust' | 'drag' | 'hold' | 'connect' | 'calibrate' | 'scrub';

export interface FirstFiveTaskPlan {
  toolId: string;
  action: string;
  gesture: TaskRepairGesture;
  gestureInstruction: string;
  testPrompt: string;
  passingReading: string;
  failingReading: string;
}

const tool = (id: string, name: string, picture: TaskToolChoice['picture']): TaskToolChoice => ({ id, name, picture });

const FIRST_FIVE_TASK_PLANS: Record<string, FirstFiveTaskPlan> = {
  'battery-readiness-check': {
    toolId: 'wrench', action: 'Tighten the battery charge-port coupler', gesture: 'rotate',
    gestureInstruction: 'Rotate the insulated wrench clockwise until the coupler indicator reaches the lock mark.',
    testPrompt: 'Run a short charge cycle. Which reading confirms the port is secure?',
    passingReading: 'The charge indicator holds steady under load',
    failingReading: 'The charge indicator flickers when the cable moves',
  },
  'workshop-equipment-maintenance': {
    toolId: 'wrench', action: 'Tighten the loose tool handle', gesture: 'rotate',
    gestureInstruction: 'Rotate the wrench clockwise until the handle no longer shifts.',
    testPrompt: 'Apply a light load to the tool. Which result confirms the handle is secure?',
    passingReading: 'The handle stays firmly aligned',
    failingReading: 'The handle moves in its socket',
  },
  'habitat-air-seal-check': {
    toolId: 'patch', action: 'Press the fresh seal strip into the doorway channel', gesture: 'hold',
    gestureInstruction: 'Press and hold the patch applicator on the worn section of the door seal.',
    testPrompt: 'Cycle the habitat door. Which result confirms the seal?',
    passingReading: 'Pressure remains stable after the door closes',
    failingReading: 'Pressure drops around the doorway',
  },
  'water-recycler-backflush': {
    toolId: 'brush', action: 'Clean the water-recycler filter', gesture: 'scrub',
    gestureInstruction: 'Sweep the cleaning brush across the clogged filter until the flow path is clear.',
    testPrompt: 'Run water through the recycler. Which reading confirms the filter is clear?',
    passingReading: 'Flow is steady and the outlet reading is clear',
    failingReading: 'Flow remains restricted',
  },
  'greenhouse-nutrient-balance': {
    toolId: 'wrench', action: 'Adjust the plant-feed valve', gesture: 'adjust',
    gestureInstruction: 'Move the feed control into the marked nutrient-flow band.',
    testPrompt: 'Run the feed cycle. Which result confirms the adjustment?',
    passingReading: 'Feed flow stays within the marked range',
    failingReading: 'Feed flow remains outside the marked range',
  },
  'food-storage-inventory': {
    toolId: 'gloves', action: 'Move the earliest-expiry meal pack to the front', gesture: 'drag',
    gestureInstruction: 'Drag the oldest meal pack into the front position on the shelf.',
    testPrompt: 'Check the shelf order. Which result confirms the inventory is organized?',
    passingReading: 'The earliest-expiry pack is at the front',
    failingReading: 'A newer pack is still in front of the oldest pack',
  },
  'solar-tracker-alignment': {
    toolId: 'wrench', action: 'Rotate the tracker hinge toward the Sun', gesture: 'rotate',
    gestureInstruction: 'Rotate the hinge until the alignment mark reaches the solar bearing.',
    testPrompt: 'Check panel alignment. Which reading confirms the tracker is aimed?',
    passingReading: 'The alignment indicator is centered on the solar bearing',
    failingReading: 'The alignment indicator remains outside the bearing',
  },
  'battery-terminal-inspection': {
    toolId: 'wrench', action: 'Tighten the battery terminal connection', gesture: 'rotate',
    gestureInstruction: 'Turn the insulated wrench clockwise until the terminal is secure.',
    testPrompt: 'Check the power connection under load. Which reading confirms the repair?',
    passingReading: 'The terminal voltage remains stable',
    failingReading: 'The terminal voltage fluctuates',
  },
  'nuclear-unit-coolant-check': {
    toolId: 'wrench', action: 'Open the coolant-loop valve to its service mark', gesture: 'rotate',
    gestureInstruction: 'Rotate the coolant valve until its pointer aligns with the service mark.',
    testPrompt: 'Run the coolant loop. Which reading confirms circulation?',
    passingReading: 'Coolant flow and temperature remain in the operating band',
    failingReading: 'Flow is low and temperature continues to rise',
  },
  'habitat-pressure-door-test': {
    toolId: 'wrench', action: 'Seat the airlock door against its pressure seal', gesture: 'rotate',
    gestureInstruction: 'Turn the door wheel until the seal indicator reaches its locked position.',
    testPrompt: 'Run a pressure hold. Which result confirms the door test?',
    passingReading: 'Cabin pressure holds steady',
    failingReading: 'Pressure falls during the hold',
  },
  'radiation-shelter-seal-check': {
    toolId: 'patch', action: 'Apply a seal patch to the shelter hatch seam', gesture: 'hold',
    gestureInstruction: 'Press and hold the patch over the highlighted hatch seam.',
    testPrompt: 'Close the hatch and run a seal check. Which reading passes?',
    passingReading: 'The hatch holds pressure with no leak indication',
    failingReading: 'The leak indicator remains active',
  },
  'communications-mast-diagnostic': {
    toolId: 'clamp', action: 'Secure the radio cable at the mast connector', gesture: 'connect',
    gestureInstruction: 'Connect the cable clamp to the loose antenna connector until it locks.',
    testPrompt: 'Run a signal check. Which result confirms the link?',
    passingReading: 'Signal strength is stable at the service threshold',
    failingReading: 'Signal strength remains below the service threshold',
  },
  'medical-kit-expiry-audit': {
    toolId: 'gloves', action: 'Move the earliest-expiry medical pack to the front', gesture: 'drag',
    gestureInstruction: 'Drag the earliest-expiry supply pack into the front tray position.',
    testPrompt: 'Check the tray order. Which result confirms the audit?',
    passingReading: 'The earliest-expiry pack is accessible at the front',
    failingReading: 'A later-expiry pack is still at the front',
  },
  'eva-suit-life-support-check': {
    toolId: 'clamp', action: 'Secure the suit air-hose coupling', gesture: 'connect',
    gestureInstruction: 'Connect the hose clamp around the highlighted coupling until it locks.',
    testPrompt: 'Run a suit pressure hold. Which result confirms the hose is secure?',
    passingReading: 'Suit pressure remains stable',
    failingReading: 'Pressure drops at the hose coupling',
  },
  'rover-wheel-and-brake-check': {
    toolId: 'wrench', action: 'Tighten the rover wheel and set the brake', gesture: 'rotate',
    gestureInstruction: 'Rotate the wheel wrench to the marked torque position.',
    testPrompt: 'Roll and stop the wheel. Which result confirms the check?',
    passingReading: 'The wheel turns freely and the brake holds on command',
    failingReading: 'The wheel binds or the brake slips',
  },
  'science-instrument-calibration': {
    toolId: 'tester', action: 'Calibrate the instrument against its reference', gesture: 'calibrate',
    gestureInstruction: 'Adjust the calibration control until the reference trace is centered.',
    testPrompt: 'Take a reference reading. Which result confirms calibration?',
    passingReading: 'The reading falls within the reference band',
    failingReading: 'The reading remains outside the reference band',
  },
  'thermal-radiator-cleaning': {
    toolId: 'brush', action: 'Brush dust from the radiator fins', gesture: 'scrub',
    gestureInstruction: 'Sweep the brush across the highlighted radiator fins until the dust clears.',
    testPrompt: 'Run the cooling cycle. Which reading confirms heat is dissipating?',
    passingReading: 'Radiator temperature returns to the operating band',
    failingReading: 'Radiator temperature remains elevated',
  },
  'emergency-reserve-seal-audit': {
    toolId: 'patch', action: 'Seal the backup container lid seam', gesture: 'hold',
    gestureInstruction: 'Press the patch onto the highlighted lid seam and hold until it bonds.',
    testPrompt: 'Close the container and run a seal check. Which result passes?',
    passingReading: 'The container seal indicator is clear',
    failingReading: 'The container seal indicator shows a leak',
  },
  'greenhouse-harvest-and-preservation': {
    toolId: 'gloves', action: 'Move the ripe greens into the preservation tray', gesture: 'drag',
    gestureInstruction: 'Drag the ripe leaves from the crop tray into the preservation slot.',
    testPrompt: 'Check the harvest tray. Which result confirms storage?',
    passingReading: 'Ripe greens are secured in the preservation tray',
    failingReading: 'The greens remain in the open crop tray',
  },
  'communications-backup-beacon-test': {
    toolId: 'tester', action: 'Tune and test the backup beacon signal', gesture: 'calibrate',
    gestureInstruction: 'Adjust the beacon signal until the test trace reaches the center mark.',
    testPrompt: 'Transmit a test ping. Which result confirms the backup radio?',
    passingReading: 'The beacon returns a stable acknowledgement',
    failingReading: 'The beacon receives no stable acknowledgement',
  },
  'regolith-plant-maintenance': {
    toolId: 'wrench', action: 'Open the regolith digester service valve', gesture: 'rotate',
    gestureInstruction: 'Rotate the service valve to the purge mark to clear the digester.',
    testPrompt: 'Run the extraction cycle. Which reading confirms service?',
    passingReading: 'Oxygen yield returns to the operating band',
    failingReading: 'Oxygen yield remains below the operating band',
  },
  'sensor-calibration': {
    toolId: 'tester', action: 'Calibrate the sensor against its reference', gesture: 'calibrate',
    gestureInstruction: 'Adjust the calibration control until the sensor trace is centered.',
    testPrompt: 'Take a reference reading. Which result confirms calibration?',
    passingReading: 'The sensor reading falls within the reference band',
    failingReading: 'The sensor reading remains outside the reference band',
  },
  'connection-integrity': {
    toolId: 'clamp', action: 'Secure the loose system connector', gesture: 'connect',
    gestureInstruction: 'Connect the clamp across the highlighted connector until it locks.',
    testPrompt: 'Run a connection check. Which result confirms the link?',
    passingReading: 'The connection reading is stable',
    failingReading: 'The connection reading continues to fluctuate',
  },
  'load-response': {
    toolId: 'tester', action: 'Run a controlled system load test', gesture: 'hold',
    gestureInstruction: 'Hold the diagnostic tester on the test panel for one full sample.',
    testPrompt: 'Review the load response. Which result passes?',
    passingReading: 'The system holds its output under load',
    failingReading: 'The system output drops under load',
  },
  'control-signal': {
    toolId: 'tester', action: 'Calibrate the warning signal threshold', gesture: 'calibrate',
    gestureInstruction: 'Adjust the signal control until the indicator reaches the threshold mark.',
    testPrompt: 'Trigger a warning test. Which result confirms the signal?',
    passingReading: 'The warning light responds at the marked threshold',
    failingReading: 'The warning light remains inactive at the threshold',
  },
  'thermal-stability': {
    toolId: 'tester', action: 'Calibrate the temperature sensor', gesture: 'calibrate',
    gestureInstruction: 'Adjust the sensor offset until it matches the reference temperature.',
    testPrompt: 'Take a reference reading. Which result confirms stability?',
    passingReading: 'The temperature reading is within the operating band',
    failingReading: 'The temperature reading remains outside the operating band',
  },
  'backup-readiness': {
    toolId: 'tester', action: 'Run a readiness test on the backup system', gesture: 'hold',
    gestureInstruction: 'Hold the tester on the backup test switch until the readiness cycle completes.',
    testPrompt: 'Review the readiness result. Which reading passes?',
    passingReading: 'The backup system reports ready',
    failingReading: 'The backup system reports unavailable',
  },
};

const TASK_EXPERIENCES: Record<string, DailyTaskExperience> = {
  'battery-readiness-check': {
    scenario: 'The outpost battery is running low. Help the crew save power for the long lunar night.',
    picture: 'Battery container',
    parts: ['Charge port', 'Power switch', 'Status light'],
    brokenPart: 'Charge port',
    hint: 'Look for the part that lets the battery take in power.',
    tools: [tool('wrench', 'Battery wrench', 'wrench'), tool('tester', 'Battery tester', 'tester'), tool('clamp', 'Cable clamp', 'clamp')],
    correctTool: 'wrench', action: 'Tighten the battery charge-port coupler',
    fact: 'The Moon has nights that last about 14 Earth days, so batteries help store energy for the dark hours!',
  },
  'workshop-equipment-maintenance': {
    scenario: 'A workshop tool is rattling and could cause trouble. Find the loose part and make the workbench safe.',
    picture: 'Workshop bench',
    parts: ['Loose tool handle', 'Work light', 'Storage drawer'],
    brokenPart: 'Loose tool handle',
    hint: 'Find the part that is wobbling on the workbench.',
    tools: [tool('wrench', 'Wrench', 'wrench'), tool('clamp', 'Handle clamp', 'clamp'), tool('tester', 'Tool tester', 'tester')],
    correctTool: 'wrench', action: 'Tighten the tool',
    fact: 'Tools are tied down in space because a floating tool can bump into things.',
  },
  'habitat-waterline-inspection': {
    scenario: 'A water pipe joint is dripping inside the habitat. Find the weak spot before more water escapes.',
    picture: 'Habitat water pipes',
    parts: ['Pipe joint', 'Water tap', 'Pipe hanger'],
    brokenPart: 'Pipe joint',
    hint: 'Look where two pieces of pipe join together.',
    tools: [tool('tester', 'Pipe tester', 'tester'), tool('clamp', 'Pipe clamp', 'clamp'), tool('patch', 'Pipe seal patch', 'patch')],
    correctTool: 'clamp', action: 'Seal the pipe joint',
    fact: 'A tight pipe joint helps keep every drop of drinking water inside.',
    repair: {
      diagnosisToolId: 'tester',
      diagnosisPrompt: 'Use the tester, then tap the part that is leaking.',
      strategies: [
        {
          id: 'replace-water-seal',
          name: 'Replace the seal',
          description: 'Use a new seal for a strong repair. It uses one water seal.',
          toolId: 'patch',
          partsCost: { waterSeal: 1 },
          steps: ['Turn off the water valve', 'Prepare the seal applicator', 'Fit the fresh water seal', 'Turn the valve back on'],
          verificationQuestion: 'How can we check the pipe is fixed?',
          verificationOptions: [
            { id: 'dry-joint', label: 'The joint stays dry when water flows' },
            { id: 'more-water', label: 'The pipe drips more' },
          ],
          correctVerificationId: 'dry-joint',
          resourceEffects: { water: 8 },
          conditionRecovery: 4,
        },
        {
          id: 'clamp-waterline',
          name: 'Clamp the pipe',
          description: 'A careful, no-parts fix. It restores less water.',
          toolId: 'clamp',
          steps: ['Place the clamp on the joint', 'Tighten it gently'],
          verificationQuestion: 'What shows the clamp is working?',
          verificationOptions: [
            { id: 'dry-joint', label: 'The joint stays dry when water flows' },
            { id: 'more-water', label: 'The pipe drips more' },
          ],
          correctVerificationId: 'dry-joint',
          resourceEffects: { water: 3 },
          conditionRecovery: 2,
        },
      ],
    },
  },
  'habitat-air-seal-check': {
    scenario: 'The seal around a habitat doorway looks worn. Check it so the crew can keep their air safely inside.',
    picture: 'Habitat air seal',
    parts: ['Door seal', 'Door handle', 'Wall light'],
    brokenPart: 'Door seal',
    hint: 'Look around the edge where the door meets the wall.',
    tools: [tool('patch', 'Fresh seal strip', 'patch'), tool('tester', 'Air seal tester', 'tester'), tool('clamp', 'Door clamp', 'clamp')],
    correctTool: 'patch', action: 'Replace the seal strip',
    fact: 'A good seal helps hold air inside a spacecraft, just like a lid keeps air inside a bottle.',
  },
  'solar-array-inspection': {
    scenario: 'A solar panel connection is sparking. Find the loose connection and help power the outpost again.',
    picture: 'Solar panel array',
    parts: ['Power connection', 'Panel frame', 'Solar cell'],
    brokenPart: 'Power connection',
    hint: 'Follow the cable to where it joins the solar panel.',
    tools: [tool('tester', 'Panel tester', 'tester'), tool('brush', 'Soft dust brush', 'brush'), tool('patch', 'Panel patch tool', 'patch')],
    correctTool: 'brush', action: 'Brush away the dust',
    fact: 'Solar panels turn sunlight into electricity for the outpost.',
    repair: {
      diagnosisToolId: 'tester',
      diagnosisPrompt: 'Use the tester, then tap the panel that is not making enough power.',
      strategies: [
        {
          id: 'patch-solar-panel',
          name: 'Patch the connection',
          description: 'Use a solar patch to secure the damaged connection. It uses one patch.',
          toolId: 'patch',
          partsCost: { solarPatch: 1 },
          steps: ['Loosen the cable connector', 'Prepare the solar patch', 'Fit the solar connection patch', 'Secure the connection'],
          verificationQuestion: 'What shows the solar panel is working?',
          verificationOptions: [
            { id: 'power-reading', label: 'The power reading rises in sunlight' },
            { id: 'zero-reading', label: 'The power reading stays at zero' },
          ],
          correctVerificationId: 'power-reading',
          resourceEffects: { power: 8 },
          conditionRecovery: 4,
        },
        {
          id: 'clean-solar-panel',
          name: 'Tighten the connection',
          description: 'A careful, no-parts fix. Tighten the loose connection.',
          toolId: 'wrench',
          steps: ['Tighten the loose connection'],
          verificationQuestion: 'What shows the solar panel is working?',
          verificationOptions: [
            { id: 'power-reading', label: 'The power reading rises in sunlight' },
            { id: 'zero-reading', label: 'The power reading stays at zero' },
          ],
          correctVerificationId: 'power-reading',
          resourceEffects: { power: 3 },
          conditionRecovery: 2,
        },
      ],
    },
  },
  'oxygen-loop-filter-service': {
    scenario: 'The air filter is full of dust, so clean air cannot move through the habitat as easily.',
    picture: 'Air filter unit',
    parts: ['Dusty filter', 'Air fan', 'Filter cover'],
    brokenPart: 'Dusty filter',
    hint: 'Find the part that catches dust as air passes through.',
    tools: [tool('tester', 'Airflow tester', 'tester'), tool('brush', 'Filter brush', 'brush'), tool('wrench', 'Filter wrench', 'wrench')],
    correctTool: 'brush', action: 'Clean the filter',
    fact: 'Filters catch tiny bits of dust so cleaner air can keep moving.',
    repair: {
      diagnosisToolId: 'tester',
      diagnosisPrompt: 'Use the tester, then tap the part that is blocking the air.',
      strategies: [
        {
          id: 'replace-oxygen-filter',
          name: 'Replace the filter',
          description: 'Fit a fresh filter for the best airflow. It uses one filter.',
          toolId: 'wrench',
          partsCost: { oxygenFilter: 1 },
          steps: ['Open the filter compartment', 'Slide in the fresh air filter', 'Close the compartment'],
          verificationQuestion: 'How do we know air can flow again?',
          verificationOptions: [
            { id: 'steady-air', label: 'The airflow reading is steady' },
            { id: 'blocked-air', label: 'The airflow reading is still blocked' },
          ],
          correctVerificationId: 'steady-air',
          resourceEffects: { oxygen: 8 },
          conditionRecovery: 4,
        },
        {
          id: 'clean-oxygen-filter',
          name: 'Clean and reuse the filter',
          description: 'A no-parts fix. It helps, but not as much as a fresh filter.',
          toolId: 'brush',
          steps: ['Open the filter compartment', 'Brush the filter clean', 'Put the filter back'],
          verificationQuestion: 'How do we know air can flow again?',
          verificationOptions: [
            { id: 'steady-air', label: 'The airflow reading is steady' },
            { id: 'blocked-air', label: 'The airflow reading is still blocked' },
          ],
          correctVerificationId: 'steady-air',
          resourceEffects: { oxygen: 3 },
          conditionRecovery: 2,
        },
      ],
    },
  },
  'water-recycler-backflush': {
    scenario: 'The water recycler is clogged. Find its blocked filter so it can help make clean water again.',
    picture: 'Water recycler',
    parts: ['Clogged filter', 'Water tube', 'Control button'],
    brokenPart: 'Clogged filter',
    hint: 'Look for the part that water passes through to get cleaned.',
    tools: [tool('brush', 'Cleaning brush', 'brush'), tool('wrench', 'Filter wrench', 'wrench'), tool('tester', 'Water tester', 'tester')],
    correctTool: 'brush', action: 'Clear the filter',
    fact: 'Space stations clean and reuse water, so very little goes to waste.',
  },
  'greenhouse-nutrient-balance': {
    scenario: 'A greenhouse plant is looking droopy. Check its plant food and water so it can grow strong.',
    picture: 'Greenhouse plant bed',
    parts: ['Plant feed tube', 'Grow light', 'Leaf tray'],
    brokenPart: 'Plant feed tube',
    hint: 'Find the tube that brings food and water to the plants.',
    tools: [tool('wrench', 'Feed-valve wrench', 'wrench'), tool('tester', 'Plant-feed tester', 'tester'), tool('gloves', 'Garden gloves', 'gloves')],
    correctTool: 'wrench', action: 'Adjust the plant-feed valve',
    fact: 'Plants use light, water, and nutrients to grow food for the crew.',
  },
  'food-storage-inventory': {
    scenario: 'Some meal packs are tucked behind newer ones. Find the food shelf that needs a quick tidy-up.',
    picture: 'Crew food shelf',
    parts: ['Meal pack shelf', 'Storage latch', 'Cooler light'],
    brokenPart: 'Meal pack shelf',
    hint: 'Look where the crew stores its meals.',
    tools: [tool('checklist', 'Food checklist', 'checklist'), tool('gloves', 'Food gloves', 'gloves'), tool('cloth', 'Shelf cloth', 'cloth')],
    correctTool: 'checklist', action: 'Sort the meal packs',
    fact: 'Putting older food at the front helps the crew use it before it expires.',
  },
  'solar-tracker-alignment': {
    scenario: 'The solar panels are looking away from the Sun. Help them turn in the right direction.',
    picture: 'Solar panel tracker',
    parts: ['Tracker control', 'Panel hinge', 'Power cable'],
    brokenPart: 'Tracker control',
    hint: 'Find the control that helps the panels turn toward the Sun.',
    tools: [tool('tester', 'Panel alignment tool', 'tester'), tool('wrench', 'Hinge wrench', 'wrench'), tool('cloth', 'Sensor cloth', 'cloth')],
    correctTool: 'tester', action: 'Aim the panels',
    fact: 'Solar trackers turn panels toward sunlight to collect more energy.',
  },
  'battery-terminal-inspection': {
    scenario: 'A battery wire is loose. Find the connection that needs a careful tightening.',
    picture: 'Battery power connections',
    parts: ['Loose terminal', 'Battery handle', 'Charge light'],
    brokenPart: 'Loose terminal',
    hint: 'Look where the power wire meets the battery.',
    tools: [tool('wrench', 'Insulated wrench', 'wrench'), tool('tester', 'Power tester', 'tester'), tool('clamp', 'Cable clamp', 'clamp')],
    correctTool: 'wrench', action: 'Secure the connection',
    fact: 'A firm connection helps electricity travel from a battery to the equipment.',
  },
  'nuclear-unit-coolant-check': {
    scenario: 'The power unit needs a cooling check. Find the part that carries cooling water around it.',
    picture: 'Power unit cooling loop',
    parts: ['Coolant pipe', 'Power switch', 'Status screen'],
    brokenPart: 'Coolant pipe',
    hint: 'Find the pipe that carries cooling water around the unit.',
    tools: [tool('tester', 'Temperature checker', 'tester'), tool('wrench', 'Pipe wrench', 'wrench'), tool('cloth', 'Cooling-loop cloth', 'cloth')],
    correctTool: 'tester', action: 'Check the cooling loop',
    fact: 'Machines can get hot while working, so cooling systems carry heat away.',
  },
  'habitat-pressure-door-test': {
    scenario: 'The airlock door may not close tightly. Find the seal that keeps air inside.',
    picture: 'Airlock pressure door',
    parts: ['Door seal', 'Door wheel', 'Entry light'],
    brokenPart: 'Door seal',
    hint: 'Look around the edge of the door for its soft sealing strip.',
    tools: [tool('tester', 'Seal tester', 'tester'), tool('patch', 'Seal patch', 'patch'), tool('wrench', 'Door wrench', 'wrench')],
    correctTool: 'tester', action: 'Test the airlock seal',
    fact: 'An airlock uses doors to help keep the habitat air from escaping when astronauts go outside.',
  },
  'radiation-shelter-seal-check': {
    scenario: 'A storm shelter seal looks worn. Find the spot that needs a patch before the crew needs shelter.',
    picture: 'Storm shelter hatch',
    parts: ['Hatch seal', 'Hatch handle', 'Safety light'],
    brokenPart: 'Hatch seal',
    hint: 'Check the edge where the shelter hatch closes.',
    tools: [tool('patch', 'Seal patch', 'patch'), tool('tester', 'Leak tester', 'tester'), tool('cloth', 'Hatch cloth', 'cloth')],
    correctTool: 'patch', action: 'Patch the shelter seal',
    fact: 'Lunar soil, called regolith, can be piled over shelters to help protect astronauts.',
  },
  'communications-mast-diagnostic': {
    scenario: 'The radio antenna signal is weak. Find the connection that might be loose.',
    picture: 'Radio antenna mast',
    parts: ['Antenna connector', 'Mast support', 'Signal light'],
    brokenPart: 'Antenna connector',
    hint: 'Look where the radio cable joins the antenna.',
    tools: [tool('tester', 'Signal tester', 'tester'), tool('clamp', 'Antenna clip', 'clamp'), tool('brush', 'Antenna brush', 'brush')],
    correctTool: 'tester', action: 'Test the radio signal',
    fact: 'Radio waves carry messages through space, even though we cannot see them.',
  },
  'medical-kit-expiry-audit': {
    scenario: 'The medical kits need a tidy-up. Find the supply box where older items should be moved to the front.',
    picture: 'Crew medical kit',
    parts: ['Supply tray', 'Kit latch', 'Cabinet light'],
    brokenPart: 'Supply tray',
    hint: 'Look where the medical supplies are sorted and stored.',
    tools: [tool('checklist', 'Supply checklist', 'checklist'), tool('gloves', 'Medical gloves', 'gloves'), tool('cloth', 'Kit cloth', 'cloth')],
    correctTool: 'checklist', action: 'Sort the medical supplies',
    fact: 'Keeping a medical kit organized helps people find the right item quickly.',
  },
  'eva-suit-life-support-check': {
    scenario: 'The space suit air hose needs a check before a crew member goes outside.',
    picture: 'Astronaut space suit',
    parts: ['Air hose', 'Helmet visor', 'Glove cuff'],
    brokenPart: 'Air hose',
    hint: 'Find the hose that carries air to the astronaut.',
    tools: [tool('tester', 'Suit air tester', 'tester'), tool('patch', 'Hose patch', 'patch'), tool('clamp', 'Hose clamp', 'clamp')],
    correctTool: 'tester', action: 'Test the suit air hose',
    fact: 'A space suit is like a tiny spacecraft that gives an astronaut air and protection.',
  },
  'rover-wheel-and-brake-check': {
    scenario: 'A rover wheel looks soft and its brake needs a check before the next trip.',
    picture: 'Moon rover wheel',
    parts: ['Wheel and brake', 'Seat belt', 'Headlight'],
    brokenPart: 'Wheel and brake',
    hint: 'Look at the part that helps the rover roll and stop.',
    tools: [tool('wrench', 'Wheel wrench', 'wrench'), tool('tester', 'Tire tester', 'tester'), tool('clamp', 'Brake clamp', 'clamp')],
    correctTool: 'wrench', action: 'Check the wheel and brake',
    fact: 'Rover wheels are made to roll over rough ground where ordinary cars cannot drive.',
  },
  'science-instrument-calibration': {
    scenario: 'The science telescope is giving fuzzy readings. Find the part that helps it see clearly.',
    picture: 'Science telescope',
    parts: ['Telescope lens', 'Tripod foot', 'Power button'],
    brokenPart: 'Telescope lens',
    hint: 'Look through the part that gathers light from faraway objects.',
    tools: [tool('tester', 'Calibration card', 'tester'), tool('cloth', 'Lens cloth', 'cloth'), tool('wrench', 'Tripod wrench', 'wrench')],
    correctTool: 'tester', action: 'Calibrate the telescope',
    fact: 'Telescopes gather light so scientists can study faraway places in space.',
  },
  'thermal-radiator-cleaning': {
    scenario: 'Dust is covering the outpost cooling panels. Find the panel that needs a gentle clean.',
    picture: 'Cooling radiator panels',
    parts: ['Dusty cooling panel', 'Coolant pipe', 'Support leg'],
    brokenPart: 'Dusty cooling panel',
    hint: 'Find the flat panel that lets extra heat escape.',
    tools: [tool('brush', 'Soft cleaning brush', 'brush'), tool('cloth', 'Radiator cloth', 'cloth'), tool('tester', 'Heat tester', 'tester')],
    correctTool: 'brush', action: 'Brush the cooling panel',
    fact: 'Radiator panels help spacecraft release extra heat into space.',
  },
  'emergency-reserve-seal-audit': {
    scenario: 'A backup supply container may not be shut tight. Find the lid seal that needs checking.',
    picture: 'Backup supply container',
    parts: ['Container seal', 'Carry handle', 'Supply label'],
    brokenPart: 'Container seal',
    hint: 'Look around the edge of the lid where it closes.',
    tools: [tool('tester', 'Seal checker', 'tester'), tool('patch', 'Container patch', 'patch'), tool('clamp', 'Lid clamp', 'clamp')],
    correctTool: 'tester', action: 'Check the container seal',
    fact: 'A tight lid helps protect stored supplies from dust and damage.',
  },
  'greenhouse-harvest-and-preservation': {
    scenario: 'Some greenhouse leaves are ready to eat. Find the ripe greens and gather them for the crew.',
    picture: 'Greenhouse crop tray',
    parts: ['Ready leaves', 'Grow light', 'Water tray'],
    brokenPart: 'Ready leaves',
    hint: 'Choose the leafy part that is ready to be picked.',
    tools: [tool('scissors', 'Plant scissors', 'scissors'), tool('gloves', 'Garden gloves', 'gloves'), tool('checklist', 'Harvest checklist', 'checklist')],
    correctTool: 'scissors', action: 'Pick and store the greens',
    fact: 'Fresh plants can add variety to meals during a long space mission.',
  },
  'communications-backup-beacon-test': {
    scenario: 'The crew wants to know if the backup radio will work. Find the beacon that sends the signal.',
    picture: 'Backup radio beacon',
    parts: ['Backup antenna', 'Control dial', 'Power light'],
    brokenPart: 'Backup antenna',
    hint: 'Look for the part that sends the radio signal.',
    tools: [tool('tester', 'Radio tester', 'tester'), tool('cable', 'Backup power cable', 'cable'), tool('brush', 'Antenna brush', 'brush')],
    correctTool: 'tester', action: 'Test the backup radio',
    fact: 'A backup radio gives a crew another way to send a message if the main radio stops.',
  },
};

const VARIANT_EXPERIENCES: Record<string, Pick<DailyTaskExperience, 'scenario' | 'parts' | 'brokenPart' | 'hint' | 'tools' | 'correctTool' | 'action' | 'fact'>> = {
  'sensor-calibration': {
    scenario: 'At {place}, one sensor is showing a jumpy reading. Find the sensor that needs a careful setup.',
    parts: ['Sensor lens', 'Status light', 'Mounting bracket'], brokenPart: 'Sensor lens', hint: 'Look for the part that takes the reading.',
    tools: [tool('tester', 'Calibration card', 'tester'), tool('cloth', 'Sensor cloth', 'cloth'), tool('wrench', 'Mounting wrench', 'wrench')], correctTool: 'tester', action: 'Set the sensor reading',
    fact: 'Sensors help a crew notice changes in their spacecraft and surroundings.',
  },
  'connection-integrity': {
    scenario: 'At {place}, a connector feels loose. Find the link that needs to be secured.',
    parts: ['Loose connector', 'Status screen', 'Support bracket'], brokenPart: 'Loose connector', hint: 'Look where two cables or parts join.',
    tools: [tool('clamp', 'Connector clip', 'clamp'), tool('tester', 'Connection tester', 'tester'), tool('wrench', 'Small wrench', 'wrench')], correctTool: 'clamp', action: 'Secure the connector',
    fact: 'Secure connections help electricity and information travel between equipment.',
  },
  'load-response': {
    scenario: 'At {place}, the system needs a quick test while it is running. Find the test panel.',
    parts: ['Test panel', 'Power cable', 'Cooling vent'], brokenPart: 'Test panel', hint: 'Look for the panel used to check how the system is working.',
    tools: [tool('tester', 'Test reader', 'tester'), tool('checklist', 'Test checklist', 'checklist'), tool('cable', 'Power cable', 'cable')], correctTool: 'tester', action: 'Run the system test',
    fact: 'A simple test can help a crew spot a problem before it grows.',
  },
  'control-signal': {
    scenario: 'At {place}, a warning signal is not showing clearly. Find the control that needs testing.',
    parts: ['Warning light', 'Control switch', 'Cable clip'], brokenPart: 'Warning light', hint: 'Look for the part that tells the crew when something needs attention.',
    tools: [tool('tester', 'Signal tester', 'tester'), tool('cable', 'Signal cable', 'cable'), tool('cloth', 'Panel cloth', 'cloth')], correctTool: 'tester', action: 'Test the warning signal',
    fact: 'Clear warning lights help astronauts know when a machine needs attention.',
  },
  'thermal-stability': {
    scenario: 'At {place}, the crew wants to check for too much heat. Find the part that reads the temperature.',
    parts: ['Temperature sensor', 'Cooling vent', 'Power switch'], brokenPart: 'Temperature sensor', hint: 'Choose the part that measures how warm the system is.',
    tools: [tool('tester', 'Temperature reader', 'tester'), tool('brush', 'Vent brush', 'brush'), tool('wrench', 'Sensor wrench', 'wrench')], correctTool: 'tester', action: 'Read the temperature',
    fact: 'Temperature checks help keep machines from getting too hot or too cold.',
  },
  'backup-readiness': {
    scenario: 'At {place}, the crew wants to make sure the backup is ready. Find its test switch.',
    parts: ['Backup switch', 'Main control', 'Status light'], brokenPart: 'Backup switch', hint: 'Look for the control that checks the spare system.',
    tools: [tool('tester', 'Backup tester', 'tester'), tool('cable', 'Backup power cable', 'cable'), tool('checklist', 'Backup checklist', 'checklist')], correctTool: 'tester', action: 'Test the backup system',
    fact: 'Backups give people another way to keep important equipment working.',
  },
};

const REGOLITH_PLANT_EXPERIENCE: DailyTaskExperience = {
  scenario: 'The regolith digester needs a service cycle so it can keep extracting oxygen.',
  picture: 'Regolith oxygen digester',
  parts: ['Service valve', 'Oxygen outlet', 'Status display'],
  brokenPart: 'Service valve',
  hint: 'Find the valve that controls the digester purge cycle.',
  tools: [tool('tester', 'Oxygen-flow tester', 'tester'), tool('wrench', 'Service wrench', 'wrench'), tool('brush', 'Intake brush', 'brush')],
  correctTool: 'wrench', action: 'Run the digester service cycle',
  fact: 'Lunar regolith contains oxygen chemically bound in minerals.',
};

export function getDailyTaskExperience(
  task: DailyChallengeDefinition & { scheduledDay?: number },
): DailyTaskExperience {
  if (task.id === 'regolith-plant-maintenance' && task.scheduledDay !== undefined && task.scheduledDay <= 5) {
    return REGOLITH_PLANT_EXPERIENCE;
  }
  const baseId = Object.keys(TASK_EXPERIENCES)
    .sort((first, second) => second.length - first.length)
    .find((id) => task.id === id || task.id.startsWith(`${id}-`));
  const base = baseId ? TASK_EXPERIENCES[baseId] : undefined;
  if (!base) {
    return TASK_EXPERIENCES['battery-readiness-check'];
  }
  if (task.id === baseId) return base;
  const variantId = task.id.slice(baseId.length + 1);
  const variant = VARIANT_EXPERIENCES[variantId];
  if (!variant) return { ...base, repair: undefined };
  return {
    ...base,
    ...variant,
    repair: undefined,
    scenario: variant.scenario.replaceAll('{place}', task.targetComponentName),
  };
}

export function getFirstFiveTaskPlan(task: DailyChallengeDefinition): FirstFiveTaskPlan {
  const variantId = Object.keys(VARIANT_EXPERIENCES)
    .find((id) => task.id.endsWith(`-${id}`));
  const baseId = Object.keys(FIRST_FIVE_TASK_PLANS)
    .sort((first, second) => second.length - first.length)
    .find((id) => task.id === id || task.id.startsWith(`${id}-`));
  const plan = (variantId ? FIRST_FIVE_TASK_PLANS[variantId] : undefined)
    ?? (baseId ? FIRST_FIVE_TASK_PLANS[baseId] : undefined);
  if (!plan) {
    throw new Error(`No first-five-day interaction plan is defined for task "${task.id}".`);
  }
  return plan;
}
