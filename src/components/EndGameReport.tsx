import type {
  DailyChallenge,
  DecisionRecord,
  GameStatus,
  ResourceLevels,
} from '../hooks/useGameSimulation';
import type { ResourceKey } from '../data/moonEvents';

interface EndGameReportProps {
  status: Exclude<GameStatus, 'playing'>;
  day: number;
  maxDays: number;
  resources: ResourceLevels;
  failureReason: ResourceKey | null;
  decisionHistory: DecisionRecord[];
  dailyChallenges: DailyChallenge[];
  onRestart: () => void;
}

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  power: 'Power',
  battery: 'Battery',
  oxygen: 'Oxygen',
  water: 'Water',
  food: 'Food',
  habitat: 'Habitat',
  equipment: 'Equipment',
  health: 'Crew health',
  radProtection: 'Radiation protection',
  comms: 'Communications',
  science: 'Science',
  emergencyReserve: 'Emergency reserve',
  potentialWater: 'Potential water',
};

export default function EndGameReport({
  status,
  day,
  maxDays,
  resources,
  failureReason,
  decisionHistory,
  dailyChallenges,
  onRestart,
}: EndGameReportProps) {
  const isSuccess = status === 'success';
  const lowestResources = (Object.entries(resources) as [ResourceKey, number][])
    .filter(([resource]) => resource !== 'science' && resource !== 'potentialWater')
    .sort(([, first], [, second]) => first - second)
    .slice(0, 3);

  return (
    <div className="simulation-modal-backdrop">
      <section
        className="simulation-report"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
      >
        <div className="simulation-eyebrow">Mission debrief · Day {day} of {maxDays}</div>
        <h2 id="report-title" className={isSuccess ? 'report-success' : 'report-failed'}>
          {isSuccess ? 'Mission Success' : 'Mission Failed'}
        </h2>
        <p className="report-intro">
          {isSuccess
            ? 'Your crew reached the end of the mission with its vital systems still operating.'
            : `The mission ended when ${failureReason ? RESOURCE_LABELS[failureReason].toLowerCase() : 'a vital resource'} ran out. A resource reaching zero means the crew can no longer safely continue.`}
        </p>

        <div className="report-learning-card">
          <h3>Cause &amp; Effect</h3>
          <p>
            Every day uses power, oxygen, water, and food. Decisions can restore
            one resource while spending another, so a short-term benefit may
            reduce the crew’s safety margin later.
          </p>
          <p>
            {isSuccess
              ? 'Keeping oxygen, water, and power above zero through the final day made the mission a success.'
              : `On day ${day}, ${RESOURCE_LABELS[failureReason ?? 'oxygen'].toLowerCase()} reached zero. Check the remaining reserves below to see where the crew had the least margin.`}
          </p>
        </div>

        <div className="report-resources">
          <h3>Lowest remaining reserves</h3>
          <ul>
            {lowestResources.map(([resource, amount]) => (
              <li key={resource}>
                <span>{RESOURCE_LABELS[resource]}</span>
                <strong>{amount}%</strong>
              </li>
            ))}
          </ul>
        </div>

        <div className="report-decisions">
          <h3>Decisions and lessons</h3>
          {decisionHistory.length === 0 ? (
            <p>No scheduled event decisions were needed on this mission.</p>
          ) : (
            <ul>
              {decisionHistory.map((record) => (
                <li key={`${record.day}-${record.eventName}`}>
                  <strong>Day {record.day}: {record.decisionLabel}</strong>
                  <span>{record.eventName} — {record.lesson}</span>
                  <span>Later effect: {record.futureConsequence}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="report-decisions">
          <h3>Campaign tasks</h3>
          <ul>
            {dailyChallenges.map((challenge) => (
              <li key={challenge.id}>
                <strong>
                  {challenge.title} · {challenge.status === 'completed'
                    ? 'Completed'
                    : challenge.status === 'inProgress' ? 'In progress' : 'Unfinished'}
                </strong>
                <span>Location: {challenge.targetComponentName} · Priority: {challenge.priority}</span>
                {challenge.completedDay !== null && (
                  <span>Completed on day {challenge.completedDay}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <button className="simulation-primary-button report-restart" type="button" onClick={onRestart}>
          Restart mission
        </button>
      </section>
    </div>
  );
}
