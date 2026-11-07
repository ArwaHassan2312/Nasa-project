export const DESTINATIONS = {
  moon: {
    eyebrow: 'Moon mission',
    title: 'Moon',
    type: 'The Moon travels around Earth',
    stats: [
      { label: 'Gravity', value: '16.5% of Earth' },
      { label: 'Temperature', value: '+127°C to −173°C' },
      { label: 'One day and night', value: 'About 29.5 Earth days' },
    ],
    sections: [
      {
        heading: 'Air and space radiation',
        body: 'The Moon has almost no air or magnetic shield. Radiation from the Sun and space can reach the ground.',
      },
      {
        heading: 'Heat and cold',
        body: 'Temperatures can go from about 127°C to −173°C. Day and night together last about 29.5 Earth days, so saving power is important.',
      },
      {
        heading: 'Gravity and ground',
        body: 'Gravity is only 16.5% of Earth’s. The ground has Moon dust, craters, mountains, valleys, and flat plains.',
      },
      {
        heading: 'Water',
        body: 'Ice may be hidden in dark places near the poles. It could help provide drinking water, air, and fuel.',
      },
      {
        heading: 'Energy',
        body: 'Sunlight can make lots of power, but the long Moon night means the outpost must save power or find another source.',
      },
    ],
  },
  mars: {
    eyebrow: 'Mars mission',
    title: 'Mars',
    type: 'The fourth planet from the Sun',
    stats: [
      { label: 'Gravity', value: '38% of Earth' },
      { label: 'Atmosphere', value: 'Very thin · ≈ 95% CO₂' },
      { label: 'Water ice', value: 'Underground & polar' },
    ],
    sections: [
      {
        heading: 'Air and space radiation',
        body: 'Mars has very thin air. About 95% is carbon dioxide. People cannot breathe it, and it gives little protection from radiation. Mars has no magnetic shield, so radiation is still a danger.',
      },
      {
        heading: 'Weather and gravity',
        body: 'Mars is usually very cold, but the temperature changes by place and season. Its gravity is 38% of Earth’s.',
      },
      {
        heading: 'Terrain',
        body: 'Mars has plains, craters, sand dunes, valleys, and volcanoes.',
      },
      {
        heading: 'Water and supplies',
        body: 'Most water ice is underground or near the poles. It could help future homes. Mars’s air and ground may also help make oxygen, water, and other supplies for a long stay.',
      },
      {
        heading: 'Hazards',
        body: 'Strong winds and dust storms can block sunlight and damage machines.',
      },
    ],
  },
};
