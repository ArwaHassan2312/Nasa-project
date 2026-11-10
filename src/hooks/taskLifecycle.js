export const BASELINE_DAILY_CONSUMPTION = Object.freeze({
  power: -1,
  oxygen: -1,
  water: -1,
  food: -1,
});

export const REUSABLE_REPAIR_TOOLS = Object.freeze([
  'tester',
  'clamp',
  'patch',
  'brush',
  'wrench',
  'screwdriver',
  'flashlight',
  'pliers',
  'gloves',
  'repair-kit',
]);

export const INITIAL_REPAIR_INVENTORY = Object.freeze({
  tools: REUSABLE_REPAIR_TOOLS,
  spareParts: Object.freeze({
    waterSeal: 1,
    oxygenFilter: 1,
    solarPatch: 1,
  }),
});

export function getRepairPartAvailability(inventory, partsCost = {}) {
  return Object.entries(partsCost).every(([part, amount]) => (
    Number.isInteger(amount)
    && amount >= 0
    && (inventory.spareParts[part] ?? 0) >= amount
  ));
}

export function consumeVerifiedRepairParts(inventory, partsCost = {}, verificationPassed = false) {
  if (!verificationPassed || !getRepairPartAvailability(inventory, partsCost)) return null;
  return {
    ...inventory,
    tools: [...inventory.tools],
    spareParts: Object.fromEntries(
      Object.entries(inventory.spareParts).map(([part, amount]) => [
        part,
        amount - (partsCost[part] ?? 0),
      ]),
    ),
  };
}

export function hasEventOccurredOnDay(state, day = state.day) {
  return state.eventHistory.some((event) => event.day === day)
    || (Boolean(state.currentEvent) && (state.currentEvent.day ?? day) === day)
    || state.queuedEvents.some(({ event }) => (event.day ?? day) === day);
}

export function hasTaskEventOccurredOnDay(state, day = state.day) {
  return state.eventHistory.some((event) => event.day === day && event.source === 'task')
    || (state.currentEvent?.triggerSource === 'task'
      && (state.currentEvent.day ?? day) === day)
    || state.queuedEvents.some(({ event }) => (
      event.triggerSource === 'task' && (event.day ?? day) === day
    ));
}

export function getUnresolvedEventOccurrenceIdsAtDayEnd(currentEvent, queuedEvents, eventPhase) {
  const pendingCurrentEvent = eventPhase === 'resolving' ? null : currentEvent;
  return [pendingCurrentEvent, ...queuedEvents.map(({ event }) => event)]
    .filter(Boolean)
    .map((event) => event.occurrenceId ?? `${event.id}-${event.day ?? 0}`);
}

export function hasEventOccurredInSession(eventHistory, eventId) {
  return eventHistory.some((event) => (
    event.eventId === eventId || event.sourceEventId === eventId
  ));
}

export function selectUntriggeredCriticalTaskEvents(tasks, taskEvents, eventHistory) {
  const selected = [];
  const selectedSources = new Set();
  for (const task of tasks) {
    if (task.priority !== 'critical' || task.status !== 'overdue') continue;
    const event = taskEvents.find((candidate) => (
      candidate.riskTaskIds?.includes(task.id)
      && !selectedSources.has(candidate.sourceEventId ?? candidate.id)
      && !task.triggeredEventIds.includes(candidate.id)
      // Task consequences have their own event IDs. An independent occurrence
      // of the source event must not suppress the consequence for missed work.
      // Only a previous occurrence of this exact task event suppresses it.
      && !hasEventOccurredInSession(eventHistory, candidate.id)
    ));
    if (event) {
      selected.push({ task, event });
      selectedSources.add(event.sourceEventId ?? event.id);
    }
  }
  return selected;
}

function eventKey(event) {
  return event?.occurrenceId ?? (event ? `${event.id}-${event.day ?? 0}` : null);
}

export function removeEventOccurrence(currentEvent, queuedEvents, occurrenceId) {
  if (eventKey(currentEvent) === occurrenceId) {
    return { event: currentEvent, isCurrent: true, queuedEvents };
  }
  const queuedEvent = queuedEvents.find(({ event }) => eventKey(event) === occurrenceId);
  return queuedEvent
    ? {
      event: queuedEvent.event,
      isCurrent: false,
      queuedEvents: queuedEvents.filter(({ event }) => eventKey(event) !== occurrenceId),
    }
    : { event: null, isCurrent: false, queuedEvents };
}

export function canTriggerLinkedTaskEvent(task, event) {
  return task.status === 'overdue'
    && task.priority === 'critical'
    && event.riskTaskIds?.includes(task.id) === true;
}

export function getResolvedLinkedTasks(tasks, event) {
  if (event.triggerSource !== 'task') return [];
  return tasks.filter((task) => (
    task.status === 'overdue' && event.riskTaskIds?.includes(task.id)
  ));
}

export function excludeTaskEventSources(events, taskEvents, tasks) {
  const conflictingSources = new Set(taskEvents
    .filter((event) => tasks.some((task) => (
      task.status !== 'completed'
      && task.priority !== 'high'
      && event.riskTaskIds?.includes(task.id)
    )))
    .map((event) => event.sourceEventId ?? event.id));
  return events.filter((event) => !conflictingSources.has(event.id));
}

export function startTaskOccurrence(task, day, campaignElapsedMs) {
  return {
    ...task,
    status: task.status === 'overdue' ? 'overdue' : 'inProgress',
    startedDay: task.startedDay ?? day,
    urgentStartedAtMs: task.urgentStartedAtMs
      ?? (task.responseDeadlineMs ? campaignElapsedMs : null),
    urgentDeadlineAtMs: task.urgentDeadlineAtMs
      ?? (task.responseDeadlineMs ? campaignElapsedMs + task.responseDeadlineMs : null),
    escalationAtMs: task.escalationAtMs
      ?? (task.responseDeadlineMs && task.escalationDelayMs
        ? campaignElapsedMs + task.responseDeadlineMs + task.escalationDelayMs
        : null),
  };
}

export function getTaskCompletionResourceEffects(task) {
  return task.completionResourceEffects ?? {};
}

export function getSuccessfulEventResourceEffects(event, decision) {
  const protectedResources = new Set(event.riskResources ?? []);
  return Object.fromEntries(Object.entries(decision.effects ?? {}).filter(([resource, change]) => (
    !protectedResources.has(resource) || Number(change) >= 0
  )));
}

export function getTaskMissResourceEffects(task) {
  return !task.overdueEffectApplied
    ? task.missedResourceEffects ?? {}
    : {};
}

export function getHalfResourceRestoration(resourceLosses = {}) {
  return Object.fromEntries(Object.entries(resourceLosses)
    .map(([resource, loss]) => [resource, Math.round(Math.max(0, loss ?? 0) / 2)])
    .filter(([, amount]) => amount > 0));
}

export function getElapsedResourceEffects(dailyEffects, previousElapsedMs, elapsedMs, dayDurationMs) {
  if (!Number.isFinite(previousElapsedMs) || previousElapsedMs < 0
    || !Number.isFinite(elapsedMs) || elapsedMs <= previousElapsedMs
    || !Number.isFinite(dayDurationMs) || dayDurationMs <= 0) return {};
  const boundedElapsedMs = Math.min(elapsedMs, dayDurationMs);
  const cumulativeEffect = (amount, timeMs) => (
    Math.sign(amount) * Math.floor(Math.abs(amount) * Math.min(timeMs / dayDurationMs, 1) + 1e-9)
  );
  return Object.fromEntries(Object.entries(dailyEffects)
    .map(([resource, amount]) => [
      resource,
      cumulativeEffect(amount, boundedElapsedMs) - cumulativeEffect(amount, previousElapsedMs),
    ])
    .filter(([, change]) => change !== 0));
}

export function findFailedEssentialResource(resources, threshold = 10) {
  const essentialResources = ['oxygen', 'water', 'power', 'battery', 'food', 'habitat', 'health'];
  return essentialResources.find((resource) => resources[resource] <= threshold) ?? null;
}

export function applyResourceEffects(resources, effects, maximum = 100) {
  const updated = { ...resources };
  for (const [resource, change] of Object.entries(effects)) {
    const current = Math.trunc(updated[resource]);
    const wholePointChange = Math.sign(change) * Math.min(1, Math.floor(Math.abs(change)));
    updated[resource] = Math.max(0, Math.min(maximum, current + wholePointChange));
  }
  return updated;
}

export function settlePendingResourceEffects(resources, pendingEffects, maximum = 100) {
  const updated = { ...resources };
  for (const [resource, change] of Object.entries(pendingEffects)) {
    const current = Math.trunc(updated[resource]);
    updated[resource] = Math.max(0, Math.min(maximum, current + Math.trunc(change)));
  }
  return { resources: updated, pendingResourceEffects: {} };
}
