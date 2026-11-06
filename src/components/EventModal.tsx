import type { Decision, GameEvent } from '../data/moonEvents';

const RESOURCE_LABELS: Record<string, string> = {
  power: 'Power', battery: 'Battery', oxygen: 'Oxygen', water: 'Water', food: 'Food',
  habitat: 'Crew health', equipment: 'Outpost tools', health: 'Crew health',
  radProtection: 'Crew health', comms: 'Power', science: 'Food',
  emergencyReserve: 'Water', potentialWater: 'Water',
};
const RESOURCE_GROUPS: Record<string, string> = {
  battery: 'Battery', comms: 'Power', equipment: 'Power',
  habitat: 'Crew health', radProtection: 'Crew health',
  emergencyReserve: 'Water', potentialWater: 'Water',
  science: 'Food',
};
const SYSTEM_LABELS: Record<string, string> = {
  power: 'Power', lifeSupport: 'Air', water: 'Water', equipment: 'Outpost tools',
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Help now', high: 'Needs help', medium: 'Worth a look', low: 'Small problem',
};

interface EventModalProps {
  event: GameEvent | null;
  events?: GameEvent[];
  onSelectEvent?: (event: GameEvent) => void;
  taskTitles?: Record<string, string>;
  onSelectDecision: (decision: Decision, occurrenceId?: string) => void;
  onClose: () => void;
  remainingMs: number | null;
  locked?: boolean;
  canDecide?: boolean;
}

export default function EventModal({ event, events = [], onSelectEvent, taskTitles = {}, onSelectDecision, onClose, remainingMs, locked = false, canDecide = true }: EventModalProps) {
  if (!event) return null;

  return (
    <div className="simulation-modal-backdrop">
      <section
        className="simulation-event-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-title"
      >
        <div className="simulation-eyebrow">The crew needs help · Day {event.day ?? '—'}</div>
        {events.length > 1 && (
          <nav className="simulation-event-tabs" aria-label="Active mission alerts" role="tablist">
            {events.map((entry, index) => {
              const occurrenceId = entry.occurrenceId ?? `${entry.id}-${entry.day ?? 0}`;
              const selected = occurrenceId === (event.occurrenceId ?? `${event.id}-${event.day ?? 0}`);
              return <button
                key={occurrenceId}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`simulation-event-tab${selected ? ' is-selected' : ''}`}
                onClick={() => onSelectEvent?.(entry)}
              >
                <span>Problem {index + 1}</span>{entry.name}
              </button>;
            })}
          </nav>
        )}
        <div className="simulation-event-heading">
          <h2 id="event-title">{event.name}</h2>
          <span className={`severity-badge severity-${event.severity}`}>
            {SEVERITY_LABELS[event.severity] ?? 'Needs help'}
          </span>
        </div>
        {!locked && <button className="simulation-event-close" type="button" aria-label="Give up on this problem" onClick={onClose}>
          ×
        </button>}
        {(remainingMs !== null || locked) && (
          <div className="simulation-event-risk-panel">
            <strong>{locked ? 'The day has ended' : `Time to help · ${formatCountdown(remainingMs ?? 0)}`}</strong>
            <span>Supplies to protect: {[...new Set(event.riskResources.map((resource) => RESOURCE_GROUPS[resource] ?? RESOURCE_LABELS[resource] ?? resource))].join(', ')}</span>
            <span>{event.failureFeedback}</span>
          </div>
        )}
        {event.triggerSource === 'task' && (
          <div className="simulation-event-cause">
          <strong>This problem started after a job was missed.</strong>
          <span>Job to remember: {event.riskTaskIds?.map((id) => taskTitles[id] ?? id).join(', ') || 'Outpost check'}</span>
          <span>Where the crew needs help: {event.affectedSystems.map((system) => SYSTEM_LABELS[system] ?? system).join(', ')}</span>
          </div>
        )}
        <p className="simulation-event-situation">{event.situation}</p>
        {locked ? <p className="simulation-event-prompt">The day is over. We’ll add this problem to your day report.</p>
          : canDecide
            ? <p className="simulation-event-prompt">How will you help the crew?</p>
            : <p className="simulation-event-prompt">Getting the choices ready. You can pick one in a moment.</p>}
        {!locked && canDecide && <div className="simulation-decision-list">
          {event.decisions.map((decision) => (
            <button
              className="simulation-decision"
              key={decision.id}
              type="button"
              onClick={() => onSelectDecision(decision, event.occurrenceId ?? `${event.id}-${event.day ?? 0}`)}
            >
              <span className="simulation-decision-id">{decision.id}</span>
              <span className="simulation-decision-copy">
                <strong>{decision.label}</strong>
                <span><b>Good thing:</b> {decision.benefit}</span>
                <span><b>Cost:</b> {decision.cost}</span>
                <span className="simulation-decision-risk"><b>Watch out:</b> {decision.risk}</span>
              </span>
              <span className="simulation-decision-arrow" aria-hidden="true">→</span>
            </button>
          ))}
        </div>}
      </section>
    </div>
  );
}

function formatCountdown(milliseconds: number): string {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
