import { useState } from 'react';
import LaunchPage from './pages/LaunchPage';
import { useGameSimulation } from './hooks/useGameSimulation';

export default function App() {
  const [missionActive, setMissionActive] = useState(false);
  const simulation = useGameSimulation({ enabled: missionActive });

  return (
    <LaunchPage
      simulation={simulation}
      onMissionStart={() => setMissionActive(true)}
      onMissionPause={() => setMissionActive(false)}
    />
  );
}
