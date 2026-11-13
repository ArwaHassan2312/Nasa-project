export interface StoryChapter {
  id: 1 | 2 | 3;
  title: string;
  firstDay: number;
  lastDay: number;
  goal: string;
  introduction: string;
  ending: string;
  discoveries: string[];
}

export const STORY_CHAPTERS: StoryChapter[] = [
  {
    id: 1, title: 'First Steps', firstDay: 1, lastDay: 5,
    goal: 'Bring the outpost online and learn how the Moon changes everyday life.',
    introduction: 'The Moon has no air, so your base must bring its own. Gravity is much weaker than on Earth, and sharp lunar dust gets everywhere. Let’s check each system and learn how this place works.',
    ending: 'Your first chapter is complete. The outpost is settling in, and every careful check is teaching Earth more about living here.',
    discoveries: ['moon-dust', 'weak-gravity', 'no-air', 'earth-in-sky', 'craters', 'footprints'],
  },
  {
    id: 2, title: 'The Long Night', firstDay: 6, lastDay: 10,
    goal: 'Save power and keep the base safe through darkness and extreme temperatures.',
    introduction: 'The long darkness is approaching. Solar panels cannot make power at night, so your energy plan matters. Keep the batteries ready and the base cozy.',
    ending: 'You made it through the hardest stretch. The long night tested the outpost, and your choices gave Earth a better plan for the next mission.',
    discoveries: ['temperature-swings', 'solar-radiation', 'moon-night'],
  },
  {
    id: 3, title: 'The Big Discovery', firstDay: 11, lastDay: 15,
    goal: 'Explore the lunar surface, study water ice, and report what future settlers may need.',
    introduction: 'Satellites have found clues that water ice may hide in dark craters. If it is there, people could one day use it for drinking water, air, and fuel. Let’s investigate carefully.',
    ending: 'Your findings are ready for Earth. The next mission can build on what you discovered here.',
    discoveries: ['water-ice', 'growing-food', 'moonquakes'],
  },
];

export function getStoryChapter(day: number): StoryChapter {
  return STORY_CHAPTERS.find((chapter) => day >= chapter.firstDay && day <= chapter.lastDay)
    ?? STORY_CHAPTERS[STORY_CHAPTERS.length - 1];
}

export const STORY_DAY_BEATS: Record<number, { character: 'noor'; text: string }> = {
  2: { character: 'noor', text: 'The first small problem is part of exploration. Check the system, choose a safe fix, and we will learn from the result.' },
  3: { character: 'noor', text: 'Look at that gray dust! It is called Moon dust. It can stick to things and scratch surfaces.' },
  5: { character: 'noor', text: 'You have had time to explore the base. Notice how a small hop carries you farther here? The Moon’s pull is much weaker than Earth’s.' },
  6: { character: 'noor', text: 'Battery check! The dark days are coming, so let’s save some power.' },
  7: { character: 'noor', text: 'A solar storm may send extra radiation across the surface. Let’s keep an eye on the shelter and plan outdoor work carefully.' },
  8: { character: 'noor', text: 'The Sun is going down. Your power notes are saved. You are doing great!' },
  9: { character: 'noor', text: 'The lunar night is close. Let’s check the batteries and heating tasks together before the sunlight fades.' },
  10: { character: 'noor', text: 'Sunrise! The panels can make power again. Your careful energy choices gave us valuable data.' },
  11: { character: 'noor', text: 'We have reached the final chapter. Let’s visit the shadowed crater and learn what the ice clues mean.' },
  12: { character: 'noor', text: 'We made it to the crater! Pick a marked spot and collect a sample. It will be saved in your Science Notebook.' },
  13: { character: 'noor', text: 'The sample has water ice! The discovery is being added to your Science Notebook.' },
  14: { character: 'noor', text: 'Water ice could be cleaned to make drinking water. Scientists would need to test how much energy that takes.' },
  15: { character: 'noor', text: 'It is time to send your final report. Every result matters, including the things that did not go to plan.' },
};

export interface LocationStoryCard {
  name: string;
  what: string;
  why: string;
  fact: string;
}

export const LOCATION_STORY_CARDS: Record<string, LocationStoryCard> = {
  '001': { name: 'Cylinder Habitat', what: 'Your main indoor home on the Moon.', why: 'It protects the air, water, and life-support systems you depend on.', fact: 'The Moon has no breathable air, so a habitat must hold its own atmosphere.' },
  '002': { name: 'Inflatable Habitat', what: 'A flexible room that gives the base more indoor space.', why: 'Extra protected space can support daily work and rest.', fact: 'Space habitats use strong layers to hold air in and keep hazards out.' },
  '003': { name: 'Observation Cupola', what: 'A windowed lookout over the lunar landscape.', why: 'It helps you watch the surface and check changing conditions.', fact: 'Earth would look almost fixed in the sky from many places on the Moon.' },
  '004': { name: 'Regolith Shielded Habitat', what: 'A protected room covered by layers of lunar soil.', why: 'The shielding helps lower the radiation reaching the living space.', fact: 'A thick layer of Moon soil can help shield a habitat.' },
  '005': { name: 'Airlock', what: 'A small room between the base and the Moon outside.', why: 'It helps keep the habitat air inside when you go out.', fact: 'An airlock uses two doors so both sides are not open at once.' },
  '006': { name: 'Connecting Tunnel', what: 'A covered path between parts of the outpost.', why: 'It lets you move around indoors while staying protected.', fact: 'Connected modules let a base grow one room at a time.' },
  '007': { name: 'Tunnel Junction', what: 'A crossing where several covered paths meet.', why: 'It helps you reach different base areas safely.', fact: 'A clear route makes it easier to check every module.' },
  '008': { name: 'Greenhouse', what: 'A bright growing space for plants.', why: 'Plants can provide fresh food and help future bases reuse air and water.', fact: 'Plants need light, water, nutrients, and the right temperature to grow.' },
  '009': { name: 'Medical Module', what: 'A protected place for health checks and first aid.', why: 'A remote base needs supplies ready for unexpected problems.', fact: 'A space mission plans for health needs because help from Earth is far away.' },
  '010': { name: 'Workshop', what: 'The base’s tool and repair area.', why: 'Keeping tools ready makes other maintenance jobs safer and quicker.', fact: 'On the Moon, a loose tool can float away if it is not secured.' },
  '011': { name: 'Solar Array', what: 'Panels that turn sunlight into electricity.', why: 'Their power runs base equipment and can charge batteries.', fact: 'Solar panels make no electricity while they are in darkness.' },
  '012': { name: 'Solar Tracker Array', what: 'A set of panels that can turn toward the Sun.', why: 'Better aiming can help the panels collect more light.', fact: 'A moving tracker can keep a panel pointed toward the Sun.' },
  '013': { name: 'Solar Tower', what: 'A tall structure that supports power equipment.', why: 'It helps place equipment where it can work well across the outpost.', fact: 'Lunar bases can use several kinds of power systems together.' },
  '014': { name: 'Radiator Bank', what: 'Panels that release extra heat from equipment.', why: 'Machines need help staying within a safe temperature range.', fact: 'In space, heat can leave a spacecraft by radiating from its surfaces.' },
  '015': { name: 'Battery Container', what: 'A protected place for stored electrical energy.', why: 'Stored power helps the base work when sunlight is weak or gone.', fact: 'Batteries store energy made earlier so it can be used later.' },
  '016': { name: 'Nuclear Power Unit', what: 'A steady source of electricity and heat.', why: 'It can help provide power when solar panels are not enough.', fact: 'Some space power systems make electricity from heat released by radioactive materials.' },
  '017': { name: 'Communications Mast', what: 'The radio link between your base and Earth.', why: 'It carries messages and important science results across space.', fact: 'A radio message takes about 1.3 seconds to travel from the Moon to Earth.' },
  '018': { name: 'Regolith Excavator', what: 'A machine for digging and moving lunar soil.', why: 'It can help investigate the ground and search for useful materials.', fact: 'Lunar soil is called regolith; it is made of broken rock and dust.' },
  '019': { name: 'Open Rover', what: 'A small vehicle for exploring beyond the base.', why: 'It helps you travel over rough ground and carry samples home.', fact: 'Rover wheels are built for loose, rocky ground and low gravity.' },
  '020': { name: 'Pressurized Rover', what: 'A sealed vehicle for longer trips across the Moon.', why: 'It gives you a protected place to travel while exploring farther away.', fact: 'A pressurized rover could act like a tiny mobile habitat.' },
  '021': { name: 'EVA Suit', what: 'A suit that protects you outside the base.', why: 'It provides air and helps shield you from the lunar environment.', fact: 'A spacesuit is like a small personal spacecraft.' },
  '022': { name: 'Equipment Sled', what: 'A cart for moving tools and supplies.', why: 'It helps carry gear across the rough lunar ground.', fact: 'Moon dust can make moving equipment over the surface tricky.' },
  '023': { name: 'Survey Markers', what: 'Markers that show where measurements were taken.', why: 'They help you return to the same spot and compare observations.', fact: 'Repeating a measurement in the same place helps make science more useful.' },
  '024': { name: 'Command Center', what: 'The control room for the outpost.', why: 'It brings important system information together in one place.', fact: 'Mission control teams use data from many sensors to understand a spacecraft.' },
};

export const SCIENCE_DISCOVERIES = [
  { id: 'no-air', title: 'No Air', day: 1, science: 0, summary: 'The Moon has almost no atmosphere. A base must bring and protect the air people need.', didYouKnow: 'There is no weather like rain or wind to smooth the lunar ground.' },
  { id: 'earth-in-sky', title: 'Earth in the Sky', day: 2, science: 0, summary: 'From many places on the Moon, Earth appears in nearly the same part of the sky.', didYouKnow: 'The Moon turns once as it orbits Earth, so we usually see the same lunar side.' },
  { id: 'moon-dust', title: 'Moon Dust', day: 3, science: 30, summary: 'Lunar soil is called regolith. Its tiny grains are sharp and cling to surfaces.', didYouKnow: 'With no rain or wind, dust behaves very differently from dust on Earth.' },
  { id: 'weak-gravity', title: 'Weak Gravity', day: 5, science: 30, summary: 'The Moon’s pull is about one-sixth as strong as Earth’s.', didYouKnow: 'A person can jump higher on the Moon, but still needs a spacesuit to breathe.' },
  { id: 'craters', title: 'Moon Craters', day: 5, science: 32, summary: 'Many round dents on the Moon were made when space rocks struck its surface.', didYouKnow: 'Without wind and rain, old craters can remain for a very long time.' },
  { id: 'footprints', title: 'Footprints', day: 7, science: 34, summary: 'A boot print can stay on the Moon because there is no weather to wash it away.', didYouKnow: 'Apollo footprints may last for millions of years unless another impact disturbs them.' },
  { id: 'solar-radiation', title: 'Solar Radiation', day: 7, science: 36, summary: 'The Moon has little natural protection from charged particles released by the Sun.', didYouKnow: 'Earth’s atmosphere and magnetic field shield much of this radiation.' },
  { id: 'temperature-swings', title: 'Temperature Swings', day: 8, science: 38, summary: 'The lunar surface can become very hot in sunlight and very cold in darkness.', didYouKnow: 'A lunar day and night each last about two Earth weeks.' },
  { id: 'moon-night', title: 'The Long Moon Night', day: 9, science: 40, summary: 'Some places on the Moon go without sunlight for many Earth days.', didYouKnow: 'Energy storage is one way future bases could prepare for the dark.' },
  { id: 'water-ice', title: 'Water Ice', day: 13, science: 45, eventId: 'water_ice_exploration', summary: 'Very cold, shadowed craters may hold water ice that has been there for a long time.', didYouKnow: 'Water could be used for drinking and, with special equipment, split into oxygen and hydrogen.' },
  { id: 'growing-food', title: 'Growing Food', day: 12, science: 48, summary: 'A greenhouse can help grow fresh food far from Earth.', didYouKnow: 'Plants need light, water, nutrients, and a safe place to grow.' },
  { id: 'moonquakes', title: 'Moonquakes', day: 14, science: 55, summary: 'The Moon can shake gently as its surface and deep interior shift.', didYouKnow: 'Apollo astronauts left instruments that measured moonquakes.' },
].map((entry) => ({ ...entry, image: entry.id }));

export const MOON_FACTS = [
  'The Moon is about 384,400 kilometres from Earth.',
  'A radio message takes about 1.3 seconds to travel between the Moon and Earth.',
  'The Moon’s gravity is about one-sixth of Earth’s gravity.',
  'Apollo 12 and Apollo 16 both landed on the Moon.',
  'Moon dust is made of tiny broken rock grains and can cling to spacesuits.',
  'There is no wind or rain on the Moon, so footprints can last for a very long time.',
  'The far side of the Moon gets sunlight too.',
  'Moon rocks help scientists study the early history of the Solar System.',
  'Future explorers hope to use some lunar materials instead of carrying everything from Earth.',
];

export const EVENT_NARRATION: Record<string, { noor: string }> = {
  'solar_storm': {
    noor: 'The Sun has sent out a burst of tiny charged particles. Earth has air and a magnetic field for protection. The Moon has very little natural shielding, so choose a careful plan.',
  },
  'lunar_night': {
    noor: 'Solar panels cannot make electricity in darkness. Your choice now will affect how much power is left for later.',
  },
  'power_failure': {
    noor: 'A weak connection or a tired power source can affect the whole base. Let’s compare the options and protect the systems that matter most.',
  },
  'water_leak': {
    noor: 'Water is precious on the Moon. Find a safe way to stop the leak and save as much as you can.',
  },
  'fire_lab': {
    noor: 'A fire in a sealed habitat needs a quick, careful response. Protect the air system while you stop the fire.',
  },
  'water_ice_exploration': {
    noor: 'The signal may point to water ice, but a reading is only a clue. Choose how much time and energy to spend checking the site.',
  },
};

export function getEventNarration(event: { id?: string; sourceEventId?: string; name?: string }) {
  const directKey = event.sourceEventId ?? event.id ?? '';
  if (EVENT_NARRATION[directKey]) return EVENT_NARRATION[directKey];
  const name = (event.name ?? '').toLowerCase();
  if (name.includes('solar storm')) return EVENT_NARRATION.solar_storm;
  if (name.includes('lunar night')) return EVENT_NARRATION.lunar_night;
  if (name.includes('power')) return EVENT_NARRATION.power_failure;
  if (name.includes('water') && name.includes('ice')) return EVENT_NARRATION.water_ice_exploration;
  if (name.includes('water')) return EVENT_NARRATION.water_leak;
  if (name.includes('fire')) return EVENT_NARRATION.fire_lab;
  return {
    noor: 'Look at what changed, then choose a safe plan. Your observation will help us understand the Moon better.',
  };
}

export function getChapterReply(day: number, completedTasks: number, totalEvents: number, science: number, playerAddress = 'Commander') {
  if (day === 5) return STORY_CHAPTERS[0].ending;
  if (day === 10) return STORY_CHAPTERS[1].ending;
  if (day === 15) return STORY_CHAPTERS[2].ending;
  if (completedTasks >= 3 && science >= 40) return `Wonderful progress, ${playerAddress}! Your careful work and science readings are helping us understand how to live on the Moon.`;
  if (totalEvents > completedTasks + 1) return `That was a challenging day, ${playerAddress}. Every problem gives us useful information. Tomorrow is another chance to try a new plan.`;
  return `Good work today, ${playerAddress}. I have added your results to the mission record. Keep observing and taking care of the outpost.`;
}

export function getStoryCallback(decisions: { eventName: string; decisionLabel: string }[], resources: Record<string, number>) {
  const choices = decisions.map((decision) => `${decision.eventName} ${decision.decisionLabel}`.toLowerCase()).join(' ');
  if (/battery|backup/.test(choices) && (resources.battery ?? 100) < 65) {
    return 'Remember the backup power you used earlier? It helped at the time, so there is less stored energy for the next challenge.';
  }
  if (/save power|conserve|switch off/.test(choices) && (resources.power ?? 100) > 45) {
    return 'Your earlier plan to save power is helping. The reserve is still ready for another dark stretch.';
  }
  if (/water ice|sample/.test(choices)) {
    return 'Your crater observations are guiding the next science checks. We still need careful measurements before planning to use the ice.';
  }
  if (/solar storm|outside/.test(choices) && (resources.radProtection ?? 100) < 80) {
    return 'The earlier solar storm put extra strain on radiation protection. Let’s plan outdoor work around the next warning.';
  }
  return '';
}
