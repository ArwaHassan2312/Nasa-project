import type { Decision, GameEvent } from '../data/moonEvents';

const RESOURCE_LABELS: Record<string, string> = {
  power: 'Power', battery: 'Battery', oxygen: 'Oxygen', water: 'Water', food: 'Food',
  habitat: 'Habitat integrity', equipment: 'Equipment', health: 'Crew health',
  radProtection: 'Radiation protection', comms: 'Communications', science: 'Science',
  emergencyReserve: 'Emergency reserve', potentialWater: 'Potential water',
};
const SYSTEM_LABELS: Record<string, string> = {
  power: 'Power system', lifeSupport: 'Life support', water: 'Water system', equipment: 'Equipment systems',
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
        <div className="simulation-eyebrow">Mission event · Lunar day {event.day ?? '—'}</div>
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
                <span>ISSUE {index + 1}</span>{entry.name}
              </button>;
            })}
          </nav>
        )}
        <div className="simulation-event-heading">
          <h2 id="event-title">{event.name}</h2>
          <span className={`severity-badge severity-${event.severity}`}>
            {event.severity}
          </span>
        </div>
        {!locked && <button className="simulation-event-close" type="button" aria-label="Abandon unresolved event" onClick={onClose}>
          ×
        </button>}
        {(remainingMs !== null || locked) && (
          <div className="simulation-event-risk-panel">
            <strong>{locked ? 'Day-end transition · response locked' : `Response window · ${formatCountdown(remainingMs ?? 0)}`}</strong>
            <span>Resources at risk: {event.riskResources.map((resource) => RESOURCE_LABELS[resource] ?? resource).join(', ')}</span>
            <span>Failure impact: {Object.entries(event.failureEffects).map(([resource, change]) => `${RESOURCE_LABELS[resource] ?? resource} ${change > 0 ? '+' : ''}${change}%`).join(' · ')}</span>
            <span>{event.failureFeedback}</span>
          </div>
        )}
        {event.triggerSource === 'task' && (
          <div className="simulation-event-cause">
            <strong>Missed task connection</strong>
            <span>Task not completed: {event.riskTaskIds?.map((id) => taskTitles[id] ?? id).join(', ') || 'Required maintenance task'}</span>
            <span>Resulting problem: {event.name}</span>
            <span>Location / system: {event.affectedSystems.map((system) => SYSTEM_LABELS[system] ?? system).join(', ')}</span>
            <span>Outpost impact: {event.failureFeedback}</span>
          </div>
        )}
        <p className="simulation-event-situation">{event.situation}</p>
        {locked ? <p className="simulation-event-prompt">The day has ended. The incident will be recorded before the day report.</p>
          : canDecide
            ? <p className="simulation-event-prompt">Choose how the crew should respond:</p>
            : <p className="simulation-event-prompt">This alert is being presented. Response options will be available when the presentation completes.</p>}
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
                <span><b>Benefit:</b> {decision.benefit}</span>
                <span><b>Cost:</b> {decision.cost}</span>
                <span className="simulation-decision-risk"><b>Risk:</b> {decision.risk}</span>
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
