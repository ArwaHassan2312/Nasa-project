import type { DailyChallengeDefinition } from './dailyChallenges';

export interface TaskToolChoice {
  id: string;
  name: string;
  picture: 'cable' | 'wrench' | 'brush' | 'patch' | 'tester' | 'watering' | 'checklist' | 'screwdriver' | 'clamp' | 'scissors' | 'gloves' | 'cloth';
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
}

const tool = (id: string, name: string, picture: TaskToolChoice['picture']): TaskToolChoice => ({ id, name, picture });

const TASK_EXPERIENCES: Record<string, DailyTaskExperience> = {
  'battery-readiness-check': {
    scenario: 'The outpost battery is running low. Help the crew save power for the long lunar night.',
    picture: 'Battery container',
    parts: ['Charge port', 'Power switch', 'Status light'],
    brokenPart: 'Charge port',
    hint: 'Look for the part that lets the battery take in power.',
    tools: [tool('cable', 'Charging cable', 'cable'), tool('tester', 'Battery tester', 'tester'), tool('wrench', 'Battery wrench', 'wrench')],
    correctTool: 'cable', action: 'Recharge the battery',
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
    tools: [tool('clamp', 'Pipe clamp', 'clamp'), tool('patch', 'Pipe seal patch', 'patch'), tool('wrench', 'Pipe wrench', 'wrench')],
    correctTool: 'clamp', action: 'Seal the pipe joint',
    fact: 'A tight pipe joint helps keep every drop of drinking water inside.',
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
    scenario: 'Dust is covering a solar panel. Find the dusty panel so it can catch the Sun’s light.',
    picture: 'Solar panel array',
    parts: ['Dusty panel', 'Panel frame', 'Power cable'],
    brokenPart: 'Dusty panel',
    hint: 'Look for the flat panel that needs a clear view of the Sun.',
    tools: [tool('brush', 'Soft dust brush', 'brush'), tool('gloves', 'Dust gloves', 'gloves'), tool('cloth', 'Panel cloth', 'cloth')],
    correctTool: 'brush', action: 'Brush away the dust',
    fact: 'Solar panels turn sunlight into electricity for the outpost.',
  },
  'oxygen-loop-filter-service': {
    scenario: 'The air filter is full of dust, so clean air cannot move through the habitat as easily.',
    picture: 'Air filter unit',
    parts: ['Dusty filter', 'Air fan', 'Filter cover'],
    brokenPart: 'Dusty filter',
    hint: 'Find the part that catches dust as air passes through.',
    tools: [tool('brush', 'Filter brush', 'brush'), tool('tester', 'Airflow tester', 'tester'), tool('cloth', 'Filter cloth', 'cloth')],
    correctTool: 'brush', action: 'Clean the filter',
    fact: 'Filters catch tiny bits of dust so cleaner air can keep moving.',
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
    tools: [tool('watering', 'Plant water jug', 'watering'), tool('tester', 'Plant-feed tester', 'tester'), tool('scissors', 'Plant scissors', 'scissors')],
    correctTool: 'watering', action: 'Feed the plants',
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

export function getDailyTaskExperience(task: DailyChallengeDefinition): DailyTaskExperience {
  const baseId = Object.keys(TASK_EXPERIENCES)
    .sort((first, second) => second.length - first.length)
    .find((id) => task.id === id || task.id.startsWith(`${id}-`));
  const base = baseId ? TASK_EXPERIENCES[baseId] : undefined;
  if (!base) {
    return TASK_EXPERIENCES['battery-readiness-check'];
  }
  const variantId = baseId && task.id !== baseId ? task.id.slice(baseId.length + 1) : '';
  const variant = VARIANT_EXPERIENCES[variantId];
  if (!variant) return base;
  return {
    ...base,
    ...variant,
    scenario: variant.scenario.replaceAll('{place}', task.targetComponentName),
  };
}
