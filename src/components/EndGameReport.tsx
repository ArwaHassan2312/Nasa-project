import type {
  DailyChallenge,
  DecisionRecord,
  EventOutcomeRecord,
  GameStatus,
  ResourceLevels,
  TaskMissionRecord,
} from '../hooks/useGameSimulation';
import { MISSION_FAILURE_RESOURCE_THRESHOLD } from '../hooks/useGameSimulation';
import type { ResourceKey } from '../data/moonEvents';
import type { EventOccurrence } from '../hooks/eventScheduler';
import { buildMissionFailureNarrative } from './missionFailureNarrative';
import { getPlayerAddress } from '../utils/playerAddress';
import { SCIENCE_DISCOVERIES } from '../data/missionStory';

interface EndGameReportProps {
  status: Exclude<GameStatus, 'playing'>;
  day: number;
  maxDays: number;
  resources: ResourceLevels;
  failureReason: ResourceKey | null;
  decisionHistory: DecisionRecord[];
  dailyChallenges: DailyChallenge[];
  eventHistory: EventOccurrence[];
  eventOutcomeHistory: EventOutcomeRecord[];
  taskMissionHistory: TaskMissionRecord[];
  onRestart: () => void;
  commanderName?: string;
  baseName?: string;
  scienceNotebookIds?: string[];
}

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  power: 'Power',
  battery: 'Power',
  oxygen: 'Oxygen',
  water: 'Water',
  food: 'Food',
  habitat: 'Crew safety',
  equipment: 'Outpost tools',
  health: 'Crew safety',
  radProtection: 'Crew safety',
  comms: 'Power',
  science: 'Science',
  emergencyReserve: 'Water',
  potentialWater: 'Water',
};

const VITAL_RESOURCES: ResourceKey[] = [
  'oxygen', 'water', 'power', 'battery', 'food', 'health', 'science',
];

const REPORT_RESOURCE_LABELS: Partial<Record<ResourceKey, string>> = {
  oxygen: 'Oxygen', water: 'Water', power: 'Power',
  battery: 'Battery', food: 'Food', health: 'Crew safety',
};

export default function EndGameReport({
  status,
  day,
  maxDays,
  resources,
  failureReason,
  decisionHistory,
  dailyChallenges,
  eventHistory,
  eventOutcomeHistory,
  taskMissionHistory,
  onRestart,
  commanderName = 'Commander',
  baseName = 'Moonbase Alpha',
  scienceNotebookIds = [],
}: EndGameReportProps) {
  const isSuccess = status === 'success';
  const playerAddress = getPlayerAddress(commanderName);
  const discoveryCount = scienceNotebookIds.length;
  const vitalResources = ['oxygen', 'water', 'power', 'battery', 'food', 'health'] as const;
  const maintainedOutpost = vitalResources.every((resource) => resources[resource] >= 50);
  const ending = !isSuccess
    ? { title: 'Brave Learner', summary: 'This mission ended before Day 15, but every result is useful. Real explorers learn from each challenge and try again.' }
    : resources.science >= 70 && discoveryCount >= 8 && maintainedOutpost
      ? { title: 'Pioneer', summary: 'Your report shows that a long-term human presence on the Moon may be possible. Earth is ready for the next step!' }
      : { title: 'Careful Explorer', summary: 'The Moon may be possible, and there is more to learn. Your mission was an important first step!' };
  const missionTasks = [
    ...taskMissionHistory,
    ...dailyChallenges.map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      status: task.status,
      affectedSystem: task.affectedSystem,
      day: task.scheduledDay,
      emergency: task.emergency,
      completedAfterDeadline: task.completedAfterDeadline,
      responseTimeMs: task.responseTimeMs,
    })),
  ];
  const analysis = buildMissionFailureNarrative({
    day,
    failureReason,
    resources,
    threshold: MISSION_FAILURE_RESOURCE_THRESHOLD,
    tasks: missionTasks,
    events: eventHistory,
    outcomes: eventOutcomeHistory,
    decisions: decisionHistory,
  });
  const resourceMeters = VITAL_RESOURCES.map((resource) => ({
    resource,
    label: RESOURCE_LABELS[resource],
    value: Math.round(resource === 'health'
      ? (resources.health + resources.habitat + resources.radProtection) / 3
      : resources[resource]),
  }));

  return (
    <div className="simulation-modal-backdrop simulation-report-backdrop">
      <section
        className="simulation-report"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        tabIndex={0}
      >
        <header className="report-header">
          <div className="simulation-eyebrow">Mission wrap-up · Day {day} of {maxDays}</div>
          <h2 id="report-title" className={isSuccess ? 'report-success' : 'report-failed'}>{ending.title}</h2>
          <p className="report-intro">
            {isSuccess
              ? `${baseName} made it to Day ${day} of ${maxDays}. Review what ${playerAddress} discovered and how the outpost changed.`
              : analysis.explanation[0]}
          </p>
        </header>

        <section className="report-section report-final-message">
          <h3>Final message from Dr. Noor</h3>
          <p>{ending.summary}</p>
          <div className="report-final-discovery"><span>{playerAddress.toUpperCase()}’S SCIENCE NOTEBOOK</span><strong>{discoveryCount} / {SCIENCE_DISCOVERIES.length} discoveries saved</strong><small>Final Science reading: {Math.round(resources.science)}%</small></div>
          <ol className="report-final-steps"><li>Mission summary</li><li>Scientific discoveries</li><li>Best decisions</li><li>What to try next</li></ol>
        </section>

        <section className="report-section">
          <h3>Mission summary</h3>
            <p>{isSuccess
            ? `${playerAddress} completed the 15-day mission at ${baseName}. See how your choices, jobs, problems, discoveries, and resources shaped the result.`
            : analysis.explanation[0]}</p>
          <div className="report-stat-grid report-summary-grid">
            <article className="report-stat-card"><span>How it went</span><strong>{isSuccess ? 'Mission complete' : 'Mission paused early'}</strong><small>{isSuccess ? 'The outpost made it through the mission' : `A resource got too low: ${failureReason ? REPORT_RESOURCE_LABELS[failureReason] ?? failureReason : 'check the bars'}`}</small></article>
            <article className="report-stat-card"><span>Problems</span><strong>{analysis.stats.resolvedEvents} fixed</strong><small>{analysis.stats.unresolvedEvents} still needed help</small></article>
            <article className="report-stat-card"><span>Important jobs</span><strong>{priorityTaskCount(missionTasks) - analysis.stats.missedPriorityTasks} / {priorityTaskCount(missionTasks)}</strong><small>Jobs finished in time</small></article>
          </div>
        </section>

        <section className="report-section">
          <h3>Your choices</h3>
          <article className="report-insight-card report-insight-card--neutral">
            <span aria-hidden="true">◈</span><p>{analysis.decisionProfile}</p>
          </article>
          <div className="report-stat-grid report-behavior-grid">
            {analysis.behavior.map((item) => (
              <article className={`report-stat-card is-${item.tone}`} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </article>
            ))}
          </div>
          <div className="report-insights">
            {analysis.insights.map((insight) => <p key={insight}>{insight}</p>)}
          </div>
        </section>

        <section className="report-section">
          <h3>Things you did well</h3>
          {analysis.strengths.length > 0 ? (
            <div className="report-analysis-list">
              {analysis.strengths.map((item) => <article className={`report-insight-card is-${item.tone}`} key={`${item.title}-${item.detail}`}><span aria-hidden="true">✓</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}
            </div>
          ) : <p>No one choice stands out. The numbers above show how the jobs and problems went.</p>}
        </section>

        <section className="report-section">
          <h3>Things to try next time</h3>
          {analysis.lessons.length > 0 ? (
            <div className="report-analysis-list">
              {analysis.lessons.map((item) => <article className={`report-insight-card is-${item.tone}`} key={`${item.title}-${item.detail}`}><span aria-hidden="true">!</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}
            </div>
          ) : <p>You handled what you could. Some choices have trade-offs that are not shown in this report.</p>}
        </section>

        <section className="report-section">
          <h3>Resources</h3>
          <div className="report-analysis-list">
            {analysis.resourceAnalysis.map((item) => <article className="report-insight-card report-insight-card--neutral" key={item}><span aria-hidden="true">◉</span><p>{item}</p></article>)}
          </div>
          <div className="report-resource-grid" aria-label="Final vital resource status">
            {resourceMeters.map(({ resource, label, value }) => (
              <div className={`report-resource-card${resource !== 'science' && value <= MISSION_FAILURE_RESOURCE_THRESHOLD ? ' is-critical' : ''}`} key={resource}>
                <div><span>{label}</span><strong>{value}%</strong></div>
                <progress value={value} max={100} aria-label={`${label}: ${value}%`} />
              </div>
            ))}
          </div>
        </section>

        <section className="report-section">
          <h3>Mission numbers</h3>
          <div className="report-stat-grid report-summary-grid">
            <article className="report-stat-card">
              <span>Days played</span>
              <strong>{day} / {maxDays} days</strong>
              <small>{isSuccess ? 'Completed' : 'Ended early'}</small>
            </article>
            <article className="report-stat-card">
              <span>Jobs finished</span>
              <strong>{analysis.stats.completedTasks} / {missionTasks.length}</strong>
              <small>{analysis.stats.taskCompletionRate}% complete · {analysis.stats.missedTasks} still to do</small>
            </article>
            <article className="report-stat-card">
              <span>Problems fixed</span>
              <strong>{analysis.stats.resolvedEvents} / {eventHistory.length}</strong>
              <small>{analysis.stats.unresolvedEvents} still need help · {analysis.stats.eventResolutionRate}% fixed</small>
            </article>
          </div>

        </section>

        <section className="report-section">
          <h3>Tips for next time</h3>
          <ol className="report-recommendations">
            {analysis.recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}
          </ol>
        </section>

        <button className="simulation-primary-button report-restart" type="button" onClick={onRestart}>
          Restart mission
        </button>
      </section>
    </div>
  );
}

function priorityTaskCount(tasks: { priority: string }[]) {
  return tasks.filter((task) => task.priority === 'critical' || task.priority === 'high').length;
}
