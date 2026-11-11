import type { DailyChallengeDefinition } from './dailyChallenges';
import type { ResourceKey } from './moonEvents';

export interface TaskToolChoice {
  id: string;
  name: string;
  picture: 'cable' | 'wrench' | 'brush' | 'patch' | 'filter' | 'tester' | 'watering' | 'checklist' | 'screwdriver' | 'clamp' | 'scissors' | 'gloves' | 'cloth';
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

export interface DailyTaskSolutionOption {
  id: string;
  name: string;
  description: string;
  playerDescription: string;
  tool: TaskToolChoice;
  toolExplanation: string;
  resourceEffects: Partial<Record<ResourceKey, number>>;
  conditionDelta: number;
}

const tool = (id: string, name: string, picture: TaskToolChoice['picture']): TaskToolChoice => ({ id, name, picture });

const TASK_EXPERIENCES: Record<string, DailyTaskExperience> = {
  'battery-readiness-check': {
    scenario: 'The outpost battery is running low. Save power for the long lunar night.',
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
    scenario: 'The seal around a habitat doorway looks worn. Check it to keep your air safely inside.',
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
    fact: 'Plants use light, water, and nutrients to grow food for the mission.',
  },
  'food-storage-inventory': {
    scenario: 'Some meal packs are tucked behind newer ones. Find the food shelf that needs a quick tidy-up.',
    picture: 'Food shelf',
    parts: ['Meal pack shelf', 'Storage latch', 'Cooler light'],
    brokenPart: 'Meal pack shelf',
    hint: 'Look where the mission meals are stored.',
    tools: [tool('checklist', 'Food checklist', 'checklist'), tool('gloves', 'Food gloves', 'gloves'), tool('cloth', 'Shelf cloth', 'cloth')],
    correctTool: 'checklist', action: 'Sort the meal packs',
    fact: 'Putting older food at the front helps you use it before it expires.',
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
    fact: 'An airlock uses two doors to help keep habitat air from escaping when someone goes outside.',
  },
  'radiation-shelter-seal-check': {
    scenario: 'A storm shelter seal looks worn. Find the spot that needs a patch before you need shelter.',
    picture: 'Storm shelter hatch',
    parts: ['Hatch seal', 'Hatch handle', 'Safety light'],
    brokenPart: 'Hatch seal',
    hint: 'Check the edge where the shelter hatch closes.',
    tools: [tool('patch', 'Seal patch', 'patch'), tool('tester', 'Leak tester', 'tester'), tool('cloth', 'Hatch cloth', 'cloth')],
    correctTool: 'patch', action: 'Patch the shelter seal',
    fact: 'Lunar soil, called regolith, can be piled over shelters to help protect people inside.',
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
    picture: 'Commander medical kit',
    parts: ['Supply tray', 'Kit latch', 'Cabinet light'],
    brokenPart: 'Supply tray',
    hint: 'Look where the medical supplies are sorted and stored.',
    tools: [tool('checklist', 'Supply checklist', 'checklist'), tool('gloves', 'Medical gloves', 'gloves'), tool('cloth', 'Kit cloth', 'cloth')],
    correctTool: 'checklist', action: 'Sort the medical supplies',
    fact: 'Keeping a medical kit organized helps people find the right item quickly.',
  },
  'eva-suit-life-support-check': {
    scenario: 'The space suit air hose needs a check before you go outside.',
    picture: 'Commander space suit',
    parts: ['Air hose', 'Helmet visor', 'Glove cuff'],
    brokenPart: 'Air hose',
    hint: 'Find the hose that carries air to your suit.',
    tools: [tool('tester', 'Suit air tester', 'tester'), tool('patch', 'Hose patch', 'patch'), tool('clamp', 'Hose clamp', 'clamp')],
    correctTool: 'tester', action: 'Test the suit air hose',
    fact: 'A space suit is like a tiny spacecraft that gives you air and protection.',
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
    scenario: 'Some greenhouse leaves are ready to eat. Find the ripe greens and gather them for the mission.',
    picture: 'Greenhouse crop tray',
    parts: ['Ready leaves', 'Grow light', 'Water tray'],
    brokenPart: 'Ready leaves',
    hint: 'Choose the leafy part that is ready to be picked.',
    tools: [tool('scissors', 'Plant scissors', 'scissors'), tool('gloves', 'Garden gloves', 'gloves'), tool('checklist', 'Harvest checklist', 'checklist')],
    correctTool: 'scissors', action: 'Pick and store the greens',
    fact: 'Fresh plants can add variety to meals during a long space mission.',
  },
  'communications-backup-beacon-test': {
    scenario: 'Mission Control wants to know if the backup radio will work. Find the beacon that sends the signal.',
    picture: 'Backup radio beacon',
    parts: ['Backup antenna', 'Control dial', 'Power light'],
    brokenPart: 'Backup antenna',
    hint: 'Look for the part that sends the radio signal.',
    tools: [tool('tester', 'Radio tester', 'tester'), tool('cable', 'Backup power cable', 'cable'), tool('brush', 'Antenna brush', 'brush')],
    correctTool: 'tester', action: 'Test the backup radio',
    fact: 'A backup radio gives you another way to send a message if the main radio stops.',
  },
};

const VARIANT_EXPERIENCES: Record<string, Pick<DailyTaskExperience, 'scenario' | 'parts' | 'brokenPart' | 'hint' | 'tools' | 'correctTool' | 'action' | 'fact'>> = {
  'sensor-calibration': {
    scenario: 'At {place}, one sensor is showing a jumpy reading. Find the sensor that needs a careful setup.',
    parts: ['Sensor lens', 'Status light', 'Mounting bracket'], brokenPart: 'Sensor lens', hint: 'Look for the part that takes the reading.',
    tools: [tool('tester', 'Calibration card', 'tester'), tool('cloth', 'Sensor cloth', 'cloth'), tool('wrench', 'Mounting wrench', 'wrench')], correctTool: 'tester', action: 'Set the sensor reading',
    fact: 'Sensors help a commander notice changes in the base and surroundings.',
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
    fact: 'A simple test can help you spot a problem before it grows.',
  },
  'control-signal': {
    scenario: 'At {place}, a warning signal is not showing clearly. Find the control that needs testing.',
    parts: ['Warning light', 'Control switch', 'Cable clip'], brokenPart: 'Warning light', hint: 'Look for the part that tells you when something needs attention.',
    tools: [tool('tester', 'Signal tester', 'tester'), tool('cable', 'Signal cable', 'cable'), tool('cloth', 'Panel cloth', 'cloth')], correctTool: 'tester', action: 'Test the warning signal',
    fact: 'Clear warning lights help commanders know when a machine needs attention.',
  },
  'thermal-stability': {
    scenario: 'At {place}, check whether the system is getting too hot. Find the part that reads temperature.',
    parts: ['Temperature sensor', 'Cooling vent', 'Power switch'], brokenPart: 'Temperature sensor', hint: 'Choose the part that measures how warm the system is.',
    tools: [tool('tester', 'Temperature reader', 'tester'), tool('brush', 'Vent brush', 'brush'), tool('wrench', 'Sensor wrench', 'wrench')], correctTool: 'tester', action: 'Read the temperature',
    fact: 'Temperature checks help keep machines from getting too hot or too cold.',
  },
  'backup-readiness': {
    scenario: 'At {place}, make sure the backup is ready. Find its test switch.',
    parts: ['Backup switch', 'Main control', 'Status light'], brokenPart: 'Backup switch', hint: 'Look for the control that checks the spare system.',
    tools: [tool('tester', 'Backup tester', 'tester'), tool('cable', 'Backup power cable', 'cable'), tool('checklist', 'Backup checklist', 'checklist')], correctTool: 'tester', action: 'Test the backup system',
    fact: 'Backups give people another way to keep important equipment working.',
  },
};

const option = (
  name: string,
  description: string,
  requiredTool: TaskToolChoice,
  resourceEffects: DailyTaskSolutionOption['resourceEffects'] = {},
  conditionDelta = 1,
): Omit<DailyTaskSolutionOption, 'id' | 'toolExplanation' | 'playerDescription'> => ({ name, description, tool: requiredTool, resourceEffects, conditionDelta });

// Each task has its own workable approaches. Their resource changes are
// scaled by task priority in the task experience UI.
const TASK_SOLUTION_OPTIONS: Record<string, [Omit<DailyTaskSolutionOption, 'id' | 'toolExplanation' | 'playerDescription'>, Omit<DailyTaskSolutionOption, 'id' | 'toolExplanation' | 'playerDescription'>, Omit<DailyTaskSolutionOption, 'id' | 'toolExplanation' | 'playerDescription'>]> = {
  'battery-readiness-check': [
    option('Charge from the solar panels', 'Connect the battery to the panels for a quick charge. This uses more power now.', tool('cable', 'Charging cable', 'cable'), { power: -1, battery: 1 }, 2),
    option('Charge it slowly', 'Use the charging cable at a lower rate to save power for other equipment.', tool('cable', 'Charging cable', 'cable'), { power: -1, battery: 2 }, 2),
    option('Check the battery and send charge where it is needed', 'Test the battery first, then send charge to the cells that need it most.', tool('tester', 'Battery tester', 'tester'), { battery: 1 }, 3),
  ],
  'workshop-equipment-maintenance': [
    option('Tighten the loose handle', 'Use the wrench to tighten the handle before the tool is used again.', tool('wrench', 'Wrench', 'wrench'), {}, 3),
    option('Replace the handle screw', 'Fit a new screw so the handle stays firm for longer.', tool('screwdriver', 'Screwdriver', 'screwdriver'), {}, 3),
    option('Take it apart and refit it', 'Remove the loose handle, clean the joint, and fit it back tightly.', tool('wrench', 'Wrench', 'wrench'), {}, 2),
  ],
  'habitat-waterline-inspection': [
    option('Add a new band around the pipe', 'Replace the loose clamp around the dripping pipe joint.', tool('clamp', 'Pipe clamp', 'clamp'), {}, 3),
    option('Seal the joint', 'Wrap the small leak with a fresh water-safe seal strip.', tool('patch', 'Pipe seal patch', 'patch'), {}, 2),
    option('Tighten the pipe fitting', 'Use the pipe wrench to tighten the joint, then check for drips.', tool('wrench', 'Pipe wrench', 'wrench'), {}, 2),
  ],
  'habitat-air-seal-check': [
    option('Replace the worn seal strip', 'Remove the old strip and press a fresh one around the doorway.', tool('patch', 'Fresh seal strip', 'patch'), {}, 3),
    option('Clean and put the same seal back', 'Clean its groove and press the existing seal back into place.', tool('clamp', 'Door clamp', 'clamp'), {}, 2),
    option('Test, then patch weak spots', 'Check where air could escape and patch only those small areas.', tool('tester', 'Air seal tester', 'tester'), { science: 1 }, 2),
  ],
  'solar-array-inspection': [
    option('Brush dust off the panels', 'Use a soft brush to clear dust quickly from the sunlight-facing surface.', tool('brush', 'Soft dust brush', 'brush'), { power: 1 }, 2),
    option('Wipe each panel gently', 'Use a clean cloth to remove dust without scratching the panels.', tool('cloth', 'Panel cloth', 'cloth'), {}, 2),
    option('Clean the panel edges too', 'Use the brush to clear dust from the panel edges and hinges.', tool('brush', 'Soft dust brush', 'brush'), { power: 1 }, 3),
  ],
  'oxygen-loop-filter-service': [
    option('Replace the dirty filter', 'Remove the dusty filter and fit a clean spare so air can flow again.', tool('filter-kit', 'Spare air filter kit', 'filter'), {}, 3),
    option('Clean and reuse the filter', 'Brush dust from the filter and put it back in place.', tool('brush', 'Filter brush', 'brush'), { oxygen: -1 }, 2),
    option('Check the airflow, then clean', 'Use the airflow tester to find the blocked area, then brush it clean.', tool('tester', 'Airflow tester', 'tester'), { science: 1 }, 2),
  ],
  'water-recycler-backflush': [
    option('Replace the clogged filter', 'Fit a clean filter so the recycler can clean water again.', tool('filter-kit', 'Spare water filter kit', 'filter'), { water: 1 }, 3),
    option('Rinse and reuse the filter', 'Brush away the blockage and flush the filter with saved water.', tool('brush', 'Cleaning brush', 'brush'), { water: -1 }, 2),
    option('Test the water path', 'Check the water flow, then clear the blocked part of the filter.', tool('tester', 'Water tester', 'tester'), { science: 1 }, 2),
  ],
  'greenhouse-nutrient-balance': [
    option('Mix fresh plant food', 'Add the right plant food and water to the feed tank.', tool('watering', 'Plant water jug', 'watering'), { water: -1 }, 2),
    option('Clear the feed tube', 'Brush out the blocked tube so the plants receive their mix.', tool('brush', 'Feed-line brush', 'brush'), {}, 3),
    option('Test the plant mix first', 'Check the mix, then adjust the water and plant food to suit the crop.', tool('tester', 'Plant-feed tester', 'tester'), { science: 1 }, 2),
  ],
  'food-storage-inventory': [
    option('Move older meals to the front', 'Use the list to bring the soonest-to-expire packs forward.', tool('checklist', 'Food checklist', 'checklist'), {}, 2),
    option('Sort meals by use-by date', 'Group packs by date so you can use meals before they expire.', tool('checklist', 'Food checklist', 'checklist'), { food: 1 }, 2),
    option('Check seals as you sort', 'Inspect each pack for damage, then move the oldest safe meals forward.', tool('gloves', 'Food gloves', 'gloves'), {}, 3),
  ],
  'solar-tracker-alignment': [
    option('Set the tracker by hand', 'Turn the panel hinge toward the Sun and lock it in place.', tool('wrench', 'Hinge wrench', 'wrench'), { power: -1 }, 3),
    option('Set the Sun sensor so panels follow the Sun', 'Use the alignment tool so the tracker can follow the Sun by itself.', tool('tester', 'Panel alignment tool', 'tester'), { science: 1 }, 3),
    option('Aim panels at the strongest sunlight', 'Aim the panels for the strongest sunlight during this work period.', tool('tester', 'Panel alignment tool', 'tester'), {}, 2),
  ],
  'battery-terminal-inspection': [
    option('Tighten the battery connection', 'Secure the loose terminal so power can flow safely.', tool('wrench', 'Insulated wrench', 'wrench'), { power: 1 }, 3),
    option('Replace the worn wire holder', 'Replace the worn clamp that holds the wire against the battery.', tool('clamp', 'Cable clamp', 'clamp'), {}, 3),
    option('Check the power reading and reconnect the wire', 'Check the power reading, then reconnect the wire firmly.', tool('tester', 'Power tester', 'tester'), { science: 1 }, 2),
  ],
  'nuclear-unit-coolant-check': [
    option('Check the cooling water temperature', 'Read the temperature while the power unit is running.', tool('tester', 'Temperature checker', 'tester'), { science: 1 }, 2),
    option('Look for a leak in the cooling pipe', 'Check the pipe joints and tighten any loose fitting.', tool('wrench', 'Pipe wrench', 'wrench'), {}, 3),
    option('Compare warm and cool readings', 'Take readings before and after the unit runs to check its cooling.', tool('tester', 'Temperature checker', 'tester'), { science: 2 }, 3),
  ],
  'habitat-pressure-door-test': [
    option('Run a seal test', 'Close the door and use the tester to check for escaping air.', tool('tester', 'Seal tester', 'tester'), { science: 1 }, 3),
    option('Check the seal by hand', 'Look around the seal and patch any worn section you find.', tool('patch', 'Seal patch', 'patch'), {}, 2),
    option('Adjust the door wheel', 'Tighten the wheel so the door presses evenly against its seal.', tool('wrench', 'Door wrench', 'wrench'), {}, 3),
  ],
  'radiation-shelter-seal-check': [
    option('Replace the worn seal', 'Remove the weak strip and fit a new seal around the hatch.', tool('patch', 'Seal patch', 'patch'), {}, 3),
    option('Patch the weak area', 'Cover the worn spot while keeping the rest of the seal in place.', tool('patch', 'Seal patch', 'patch'), {}, 2),
    option('Test the hatch, then patch it', 'Find the small leak with the tester and patch that spot.', tool('tester', 'Leak tester', 'tester'), { science: 1 }, 3),
  ],
  'communications-mast-diagnostic': [
    option('Tighten the antenna connection', 'Secure the loose cable where it joins the antenna.', tool('clamp', 'Antenna clip', 'clamp'), {}, 3),
    option('Test and line up the antenna', 'Check the signal, then point the antenna for a clearer link.', tool('tester', 'Signal tester', 'tester'), { science: 1 }, 3),
    option('Replace the signal cable', 'Fit a fresh cable if the old one is damaged.', tool('cable', 'Antenna cable', 'cable'), {}, 2),
  ],
  'medical-kit-expiry-audit': [
    option('Move older items forward', 'Use the checklist to put the soonest-to-expire items in front.', tool('checklist', 'Supply checklist', 'checklist'), {}, 2),
    option('Sort kits by what they treat', 'Group supplies so you can find the right kit quickly.', tool('checklist', 'Supply checklist', 'checklist'), {}, 2),
    option('Check packs as you sort', 'Wear gloves and remove any pack with a damaged seal.', tool('gloves', 'Medical gloves', 'gloves'), {}, 3),
  ],
  'eva-suit-life-support-check': [
    option('Replace the air hose', 'Fit a sound hose so air can reach your suit.', tool('patch', 'Hose repair kit', 'patch'), {}, 3),
    option('Test the air flow', 'Check the air flow through the hose before the suit is used.', tool('tester', 'Suit air tester', 'tester'), { science: 1 }, 2),
    option('Secure the hose joint', 'Fit a fresh clamp and test that the hose stays connected.', tool('clamp', 'Hose clamp', 'clamp'), {}, 3),
  ],
  'rover-wheel-and-brake-check': [
    option('Tighten the wheel parts', 'Secure the wheel fasteners so it can turn safely.', tool('wrench', 'Wheel wrench', 'wrench'), {}, 3),
    option('Check the tire pressure', 'Use the tire tester and add air if the tire is soft.', tool('tester', 'Tire tester', 'tester'), { power: -1 }, 2),
    option('Adjust the brake cable', 'Tighten the brake cable, then test that the wheel stops.', tool('wrench', 'Wheel wrench', 'wrench'), {}, 3),
  ],
  'science-instrument-calibration': [
    option('Match the telescope to a clear test picture', 'Use the calibration card so the telescope gives clear readings.', tool('tester', 'Calibration card', 'tester'), { science: 2 }, 3),
    option('Clean the lens, then test it', 'Wipe the lens and check that the picture is clear.', tool('cloth', 'Lens cloth', 'cloth'), { science: 1 }, 2),
    option('Adjust the telescope stand', 'Straighten and tighten the stand before checking the reading again.', tool('wrench', 'Tripod wrench', 'wrench'), {}, 2),
  ],
  'thermal-radiator-cleaning': [
    option('Brush dust from the panels', 'Use the soft brush to clear dust quickly from the cooling panels.', tool('brush', 'Soft cleaning brush', 'brush'), { power: 1 }, 2),
    option('Wipe between the panel fins', 'Use a cloth to reach dust left between the narrow spaces.', tool('cloth', 'Radiator cloth', 'cloth'), {}, 2),
    option('Clean, then check the heat', 'Brush the dusty area and use the heat tester to check the result.', tool('tester', 'Heat tester', 'tester'), { science: 1 }, 3),
  ],
  'emergency-reserve-seal-audit': [
    option('Replace the lid seal', 'Fit a fresh seal so dust and air stay out of the backup supplies.', tool('patch', 'Container patch', 'patch'), {}, 3),
    option('Tighten the lid clamp', 'Secure the lid with a clamp so it closes tightly.', tool('clamp', 'Lid clamp', 'clamp'), {}, 2),
    option('Test the seal, then fix it', 'Check for a leak and patch the small area that needs help.', tool('tester', 'Seal checker', 'tester'), { science: 1 }, 3),
  ],
  'greenhouse-harvest-and-preservation': [
    option('Pick only the ready leaves', 'Cut ripe leaves and pack them carefully for meals.', tool('scissors', 'Plant scissors', 'scissors'), { food: 1 }, 2),
    option('Harvest the full ripe tray', 'Pick all ready greens now so they do not spoil on the plant.', tool('scissors', 'Plant scissors', 'scissors'), { food: 2 }, 3),
    option('Pick and record the crop', 'Harvest ripe leaves and note how well this crop grew.', tool('scissors', 'Plant scissors', 'scissors'), { science: 1, food: 1 }, 2),
  ],
  'communications-backup-beacon-test': [
    option('Test the backup signal', 'Send a short test message and check that it comes through.', tool('tester', 'Radio tester', 'tester'), { science: 1 }, 2),
    option('Check the antenna cable', 'Make sure the backup antenna has a firm power connection.', tool('cable', 'Backup power cable', 'cable'), { power: -1 }, 3),
    option('Compare both radios', 'Test the backup and main radio to see which sends the clearer signal.', tool('tester', 'Radio tester', 'tester'), { science: 2 }, 3),
  ],
  'sensor-calibration': [
    option('Match the sensor to a trusted reading', 'Use the calibration card to correct the sensor reading.', tool('tester', 'Calibration card', 'tester'), { science: 2 }, 3),
    option('Clean the sensor lens first', 'Wipe away dust, then check the reading again.', tool('cloth', 'Sensor cloth', 'cloth'), { science: 1 }, 2),
    option('Compare it with a spare reader', 'Check the sensor against a trusted reader and adjust it.', tool('tester', 'Calibration card', 'tester'), { science: 1 }, 2),
  ],
  'connection-integrity': [
    option('Secure the loose connector', 'Fit a new clip so the two parts stay joined.', tool('clamp', 'Connector clip', 'clamp'), {}, 3),
    option('Replace the worn connector', 'Swap the loose connector for a sound spare.', tool('cable', 'Connector cable', 'cable'), { power: -1 }, 3),
    option('Test it after tightening', 'Use the connection tester, then secure the connector clip.', tool('tester', 'Connection tester', 'tester'), { science: 1 }, 2),
  ],
  'load-response': [
    option('Run a gentle system test', 'Run the system gently and make sure it still works.', tool('tester', 'Test reader', 'tester'), {}, 2),
    option('Try the system at a few power levels', 'Raise the load step by step and record how the system responds.', tool('tester', 'Test reader', 'tester'), { power: -1, science: 2 }, 3),
    option('Compare before and after readings', 'Check the system readings, adjust it, then test once more.', tool('tester', 'Test reader', 'tester'), { science: 1 }, 3),
  ],
  'control-signal': [
    option('Replace the signal cable', 'Fit a sound cable so the warning light gets a clear signal.', tool('cable', 'Signal cable', 'cable'), {}, 3),
    option('Clean the light contact', 'Wipe the contact and reconnect it so the warning light works.', tool('cloth', 'Panel cloth', 'cloth'), {}, 2),
    option('Test the signal, then reconnect', 'Use the tester to find the weak point and secure the connection.', tool('tester', 'Signal tester', 'tester'), { science: 1 }, 3),
  ],
  'thermal-stability': [
    option('Clear the cooling vent', 'Brush dust from the vent so warm air can escape.', tool('brush', 'Vent brush', 'brush'), { power: 1 }, 3),
    option('Check and set the temperature sensor', 'Use the reader to set the sensor, then check the temperature again.', tool('tester', 'Temperature reader', 'tester'), { science: 1 }, 2),
    option('Open the airflow path', 'Check the vent and move anything blocking the cool air.', tool('brush', 'Vent brush', 'brush'), {}, 2),
  ],
  'backup-readiness': [
    option('Run a short backup test', 'Switch to the backup briefly and check that it starts.', tool('tester', 'Backup tester', 'tester'), { science: 1 }, 3),
    option('Check its power cable', 'Reconnect the cable and make sure the backup can charge.', tool('cable', 'Backup power cable', 'cable'), { power: -1 }, 3),
    option('Check each item on the backup list', 'Check each backup step and confirm its status light is on.', tool('checklist', 'Backup checklist', 'checklist'), {}, 2),
  ],
};

export function getDailyTaskSolutions(task: DailyChallengeDefinition, experience: DailyTaskExperience): DailyTaskSolutionOption[] {
  const baseId = Object.keys(TASK_EXPERIENCES).sort((a, b) => b.length - a.length)
    .find((id) => task.id === id || task.id.startsWith(`${id}-`));
  const variantId = baseId && task.id !== baseId ? task.id.slice(baseId.length + 1) : '';
  const definitions = TASK_SOLUTION_OPTIONS[variantId] ?? (baseId ? TASK_SOLUTION_OPTIONS[baseId] : undefined);
  const priorityFactor = task.priority === 'critical' ? 3 : task.priority === 'high' ? 2 : 1;
  const toolReasons: Record<string, string> = {
    cable: `It connects the ${experience.brokenPart.toLowerCase()} to the power or signal it needs.`,
    wrench: `It helps tighten or adjust the parts around the ${experience.brokenPart.toLowerCase()}.`,
    brush: `It helps clear dust or a blockage from the ${experience.brokenPart.toLowerCase()}.`,
    patch: `It helps seal or repair the ${experience.brokenPart.toLowerCase()}.`,
    'filter-kit': `It gives you a clean filter to replace the one in the ${experience.brokenPart.toLowerCase()}.`,
    tester: `It helps you check the ${experience.brokenPart.toLowerCase()} and see how it is working.`,
    watering: 'It helps you add the right water and plant food to the feed system.',
    checklist: 'It helps you keep track of the items or checks as you work.',
    screwdriver: `It helps you remove or tighten the screw holding the ${experience.brokenPart.toLowerCase()}.`,
    clamp: `It holds the ${experience.brokenPart.toLowerCase()} firmly in place.`,
    scissors: 'They let you cut the ready leaves without hurting the rest of the plant.',
    gloves: `They protect your hands while you handle the ${experience.brokenPart.toLowerCase()}.`,
    cloth: `It helps you wipe dust or dirt from the ${experience.brokenPart.toLowerCase()}.`,
  };
  // Use each option's own wording for the card. The old name-based summary
  // collapsed several different plans into the same generic sentence. Keep
  // the card focused on the action and remove tool/cost hints until later stages.
  const getPlayerDescription = (name: string, description: string): string => {
    const toolOrCostHint = /\b(?:use|using|with)\s+(?:the\s+)?(?:a\s+|an\s+)?(?:tester|test reader|brush|cloth|wrench|cable|clamp|patch|gloves|checklist|card|tool|filter kit|filter|scissors|list|reader)\b|\b(?:uses?|costs?)\s+(?:more|less|extra)\s+(?:power|water|food)|\b(?:save|spend)\s+(?:power|water|food)/i;
    const readableSentences = description
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !toolOrCostHint.test(sentence))
      .join(' ')
      .trim();
    if (readableSentences) return readableSentences;

    const subject = experience.brokenPart.toLowerCase();
    const action = name.toLowerCase();
    if (/replace/.test(action)) return `Take out the worn ${subject} and fit a fresh one.`;
    if (/clean|wipe|brush|rinse/.test(action)) return `Clear dust or dirt from the ${subject}.`;
    if (/test|check|compare|read|match|calibrat/.test(action)) return `Check the ${subject} and see how it is working.`;
    if (/tighten|secure|adjust|set/.test(action)) return `Make the ${subject} firm and ready to work.`;
    if (/sort|move|pick|harvest/.test(action)) return `Sort or gather the items needed for ${subject}.`;
    return `Work on the ${subject} using this plan.`;
  };
  return (definitions ?? [
    option('Repair the affected part', `Use the ${experience.action.toLowerCase()} method for ${experience.brokenPart.toLowerCase()}.`, experience.tools.find((item) => item.id === experience.correctTool) ?? experience.tools[0], {}, 1),
  ]).map((definition, index) => ({
    ...definition,
    id: `${task.id}-solution-${index}`,
    playerDescription: getPlayerDescription(definition.name, definition.description),
    toolExplanation: toolReasons[definition.tool.id] ?? `It helps you work on the ${experience.brokenPart.toLowerCase()}.`,
    resourceEffects: Object.fromEntries(Object.entries(definition.resourceEffects).map(([key, amount]) => [key, amount * priorityFactor])) as DailyTaskSolutionOption['resourceEffects'],
    conditionDelta: definition.conditionDelta * priorityFactor,
  }));
}

export function getAllDailyTaskTools(): TaskToolChoice[] {
  const allExperiences = [...Object.values(TASK_EXPERIENCES), ...Object.values(VARIANT_EXPERIENCES)];
  return [...new Map([
    ...allExperiences.flatMap((experience) => experience.tools),
    ...Object.values(TASK_SOLUTION_OPTIONS).flatMap((options) => options.map((solution) => solution.tool)),
  ].map((item) => [`${item.id}:${item.name}`, item])).values()];
}

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
