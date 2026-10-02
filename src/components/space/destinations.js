export const DESTINATIONS = {
  moon: {
    eyebrow: 'Mission briefing // Destination 01',
    title: 'Moon',
    type: 'Earth’s natural satellite',
    stats: [
      { label: 'Gravity', value: '16.5% of Earth' },
      { label: 'Temperature', value: '+127°C to −173°C' },
      { label: 'Day–night cycle', value: '≈ 29.5 Earth days' },
    ],
    sections: [
      {
        heading: 'Atmosphere & radiation',
        body: 'The Moon has almost no atmosphere and no global magnetic field, leaving its surface highly exposed to solar and cosmic radiation.',
      },
      {
        heading: 'Temperature & day–night cycle',
        body: 'Temperatures range from about 127°C to −173°C, and its day-night cycle lasts about 29.5 Earth days, creating major energy challenges.',
      },
      {
        heading: 'Gravity & terrain',
        body: 'Its gravity is only 16.5% of Earth’s. The surface is covered with lunar regolith and contains craters, mountains, valleys, and plains.',
      },
      {
        heading: 'Water resources',
        body: 'Water ice may exist in permanently shadowed polar regions and could be used for drinking, life support, oxygen, and fuel.',
      },
      {
        heading: 'Energy',
        body: 'Solar energy is abundant in illuminated areas, but the long lunar night makes reliable energy storage or alternative power sources necessary.',
      },
    ],
  },
  mars: {
    eyebrow: 'Mission briefing // Destination 02',
    title: 'Mars',
    type: 'Fourth planet from the Sun',
    stats: [
      { label: 'Gravity', value: '38% of Earth' },
      { label: 'Atmosphere', value: 'Very thin · ≈ 95% CO₂' },
      { label: 'Water ice', value: 'Underground & polar' },
    ],
    sections: [
      {
        heading: 'Atmosphere & radiation',
        body: 'Mars has a very thin atmosphere made mostly of carbon dioxide (~95%), which provides limited protection from radiation and cannot support human breathing. It has no global magnetic field, so radiation remains a major risk.',
      },
      {
        heading: 'Climate & gravity',
        body: 'Temperatures are generally very cold and vary by location and season. Mars has 38% of Earth’s gravity.',
      },
      {
        heading: 'Terrain',
        body: 'Diverse terrain including plains, craters, dunes, valleys, and volcanoes.',
      },
      {
        heading: 'Water & resources',
        body: 'Water ice exists mainly underground and near the polar regions, making it an important resource for future settlements. Its atmosphere and surface resources could potentially be used to produce oxygen, water, and other supplies needed for a long-term outpost.',
      },
      {
        heading: 'Hazards',
        body: 'Mars also experiences winds and dust storms, which can reduce solar power and damage equipment.',
      },
    ],
  },
};