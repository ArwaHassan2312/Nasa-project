import { useState } from 'react';
import LaunchPage from './pages/LaunchPage';
import { useGameSimulation } from './hooks/useGameSimulation';
import { hasResumableMission } from './hooks/missionPersistence.js';

export default function App() {
  const [missionActive, setMissionActive] = useState(() => hasResumableMission());
  const simulation = useGameSimulation({ enabled: missionActive });

  return (
    <LaunchPage
      simulation={simulation}
      resumeMission={missionActive}
      onMissionStart={() => setMissionActive(true)}
      onMissionPause={() => setMissionActive(false)}
    />
  );
}