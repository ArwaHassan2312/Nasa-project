import type {
  DailyChallenge,
  DecisionRecord,
  GameStatus,
  ResourceLevels,
  SystemConditions,
  SystemFaultRecord,
  PostponementRecord,
} from '../hooks/useGameSimulation';
import { MISSION_FAILURE_RESOURCE_THRESHOLD } from '../hooks/useGameSimulation';
import { MOON_EVENTS } from '../data/moonEvents';
import type { ResourceKey } from '../data/moonEvents';
import type { EventOccurrence } from '../hooks/eventScheduler';

interface EndGameReportProps {
  status: Exclude<GameStatus, 'playing'>;
  day: number;
  maxDays: number;
  resources: ResourceLevels;
  failureReason: ResourceKey | null;
  decisionHistory: DecisionRecord[];
  dailyChallenges: DailyChallenge[];
  systemConditions: SystemConditions;
  faultHistory: SystemFaultRecord[];
  postponementHistory: PostponementRecord[];
  eventHistory: EventOccurrence[];
  onRestart: () => void;
}

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  power: 'Power reserve',
  battery: 'Battery',
  oxygen: 'Oxygen',
  water: 'Water reserve',
  food: 'Food',
  habitat: 'Habitat',
  equipment: 'Equipment stock',
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
  systemConditions,
  faultHistory,
  postponementHistory,
  eventHistory,
  onRestart,
}: EndGameReportProps) {
  const isSuccess = status === 'success';
  const finalResources = (Object.entries(resources) as [ResourceKey, number][])
    .sort(([, first], [, second]) => first - second);
  const completedTasks = dailyChallenges.filter((task) => task.status === 'completed');
  const overdueTasks = dailyChallenges.filter((task) => task.status === 'overdue');
  const unfinishedTasks = dailyChallenges.filter((task) => task.status !== 'completed');
  const completedOnTime = completedTasks.filter((task) => task.completedAfterDeadline === false).length;
  const completedLate = completedTasks.filter((task) => task.completedAfterDeadline === true).length;
  const criticalResponseTimes = completedTasks
    .filter((task) => task.emergency && task.responseTimeMs !== null)
    .map((task) => task.responseTimeMs ?? 0);
  const averageCriticalResponseMs = criticalResponseTimes.length > 0
    ? criticalResponseTimes.reduce((total, responseTime) => total + responseTime, 0)
      / criticalResponseTimes.length
    : null;
  const preventedEmergencies = dailyChallenges.filter((task) => task.emergencyPrevented).length;
  const escalatedEmergencies = dailyChallenges.filter((task) => task.escalationApplied).length;
  const systemLabels: Record<keyof SystemConditions, string> = {
    power: 'Power system',
    lifeSupport: 'Life support',
    water: 'Water system',
    equipment: 'Equipment',
  };

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
            ? 'Your crew reached the end of the 30-day mission with its vital resources still operating.'
            : `The mission ended when ${failureReason ? RESOURCE_LABELS[failureReason].toLowerCase() : 'a vital resource'} fell to the critical reserve limit of ${MISSION_FAILURE_RESOURCE_THRESHOLD}%. Continuing below that level is unsafe for the crew.`}
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
              ? `Keeping oxygen, water, and power above ${MISSION_FAILURE_RESOURCE_THRESHOLD}% through the final day made the mission a success.`
              : `On day ${day}, ${RESOURCE_LABELS[failureReason ?? 'oxygen'].toLowerCase()} reached the critical ${MISSION_FAILURE_RESOURCE_THRESHOLD}% reserve limit. Check the remaining reserves below to see where the crew had the least margin.`}
          </p>
        </div>

        <div className="report-resources">
          <h3>Final resource status</h3>
          <ul>
            {finalResources.map(([resource, amount]) => (
              <li key={resource}>
                <span>{RESOURCE_LABELS[resource]}</span>
                <strong>{amount}%</strong>
              </li>
            ))}
          </ul>
        </div>

        <div className="report-decisions">
          <h3>Mission record</h3>
          <p className="report-stat-line">
            {completedTasks.length} of {dailyChallenges.length} tasks completed ·{' '}
            {unfinishedTasks.length} unfinished · {overdueTasks.length} overdue ·{' '}
            {eventHistory.length} major events encountered
          </p>
          <p className="report-stat-line">
            {completedOnTime} completed on time · {completedLate} completed after deadline ·{' '}
            {unfinishedTasks.length} left incomplete
          </p>
          <p className="report-stat-line">
            Average critical response: {averageCriticalResponseMs === null
              ? 'not recorded'
              : `${Math.round(averageCriticalResponseMs / 1000)} seconds`} ·{' '}
            {preventedEmergencies} emergencies prevented · {escalatedEmergencies} escalated
          </p>
          <p className="report-stat-line">
            Mission ended {isSuccess ? `at the end of Day ${day}` : `early on Day ${day}`}.
          </p>
        </div>

        <div className="report-decisions">
          <h3>Final system condition</h3>
          <ul>
            {(Object.entries(systemConditions) as [keyof SystemConditions, number][]).map(([system, condition]) => (
              <li key={system}>
                <strong>{systemLabels[system]}</strong>
                <span>{condition}/100</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="report-decisions">
          <h3>Major events encountered</h3>
          {eventHistory.length === 0 ? (
            <p>No major events occurred during this mission.</p>
          ) : (
            <ul>
              {eventHistory.map((event, index) => (
                <li key={`${event.eventId}-${index}`}>
                  <strong>
                    Day {event.day}: {MOON_EVENTS.find((definition) => definition.id === event.eventId)?.name
                      ?? event.eventId.replaceAll('_', ' ')}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="report-decisions">
          <h3>Faults and postponements</h3>
          {faultHistory.length === 0 && postponementHistory.length === 0 ? (
            <p>No recorded system faults or task postponements.</p>
          ) : (
            <ul>
              {faultHistory.map((fault, index) => (
                <li key={`fault-${fault.day}-${fault.system}-${index}`}>
                  <strong>Day {fault.day}: {systemLabels[fault.system]} · {fault.kind}</strong>
                  <span>{fault.reason} ({fault.change > 0 ? '+' : ''}{fault.change} condition)</span>
                </li>
              ))}
              {postponementHistory.map((record, index) => (
                <li key={`postponement-${record.day}-${record.taskTitle}-${index}`}>
                  <strong>Day {record.day}: postponed {record.taskTitle}</strong>
                  <span>{systemLabels[record.system]} · {record.consequence}</span>
                </li>
              ))}
            </ul>
          )}
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
                  <span>Immediate outcome: {record.actualOutcome}</span>
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
                    : challenge.status === 'overdue' ? 'Overdue'
                      : challenge.status === 'inProgress' ? 'In progress' : 'Unfinished'}
                </strong>
                <span>
                  Location: {challenge.targetComponentName} · Priority: {challenge.priority} ·
                  Deadline: Day {challenge.deadlineDay}
                </span>
                {challenge.completedDay !== null && (
                  <span>Completed on day {challenge.completedDay}</span>
                )}
                {challenge.completedAfterDeadline === true && (
                  <span>Completed after the response deadline · recovery still succeeded</span>
                )}
                {challenge.emergencyPrevented && (
                  <span>Emergency prevented by a timely response</span>
                )}
                {challenge.escalationApplied && (
                  <span>Emergency escalated and applied its second-stage consequence</span>
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
