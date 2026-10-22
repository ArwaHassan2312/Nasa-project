import type { Decision, GameEvent } from '../data/moonEvents';

interface EventModalProps {
  event: GameEvent | null;
  onSelectDecision: (decision: Decision) => void;
  onClose: () => void;
}

export default function EventModal({ event, onSelectDecision, onClose }: EventModalProps) {
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
        <div className="simulation-event-heading">
          <h2 id="event-title">{event.name}</h2>
          <span className={`severity-badge severity-${event.severity}`}>
            {event.severity}
          </span>
        </div>
        <button className="simulation-event-close" type="button" onClick={onClose}>
          Close alert
        </button>
        <p className="simulation-event-situation">{event.situation}</p>
        <p className="simulation-event-prompt">Choose how the crew should respond:</p>
        <div className="simulation-decision-list">
          {event.decisions.map((decision) => (
            <button
              className="simulation-decision"
              key={decision.id}
              type="button"
              onClick={() => onSelectDecision(decision)}
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
        </div>
      </section>
    </div>
  );
}
