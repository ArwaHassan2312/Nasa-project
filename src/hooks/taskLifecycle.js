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

export function shouldDeferCriticalTaskAtDayEnd(task, campaignElapsedMs) {
  if (task.priority !== 'critical') return false;
  if (task.startedDay === null) return true;
  return task.urgentDeadlineAtMs === null || campaignElapsedMs < task.urgentDeadlineAtMs;
}

export function canTriggerLinkedTaskEvent(task, event) {
  return task.status === 'overdue'
    && task.priority !== 'high'
    && (task.priority !== 'critical' || task.startedDay !== null)
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

export function selectDailyTaskDefinitions(definitions, day, count) {
  if (definitions.length === 0 || count <= 0) return [];
  const startIndex = (definitions.length - 1 + (day - 1) * count) % definitions.length;
  const rotated = Array.from(
    { length: definitions.length },
    (_, index) => definitions[(startIndex + index) % definitions.length],
  );
  if (day <= 1) return rotated.slice(0, count);

  const previousUrgentIds = new Set(selectDailyTaskDefinitions(definitions, day - 1, count)
    .filter((task) => task.priority === 'high' || task.priority === 'critical')
    .map((task) => task.id));
  return rotated.filter((definition) => !previousUrgentIds.has(definition.id)).slice(0, count);
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

export function getTaskMissResourceEffects(task) {
  return task.priority === 'high' && !task.overdueEffectApplied
    ? task.missedResourceEffects ?? {}
    : {};
}

export function getTaskEventRecovery(event) {
  return event.triggerSource === 'task'
    ? Object.fromEntries(event.riskResources.map((resource) => [resource, 3]))
    : {};
}

export function shouldCreateEmergencyFollowUp(event) {
  return event.triggerSource !== 'task' && Boolean(event.emergencyTask);
}

export function applyResourceEffects(resources, effects, maximum = 100) {
  const updated = { ...resources };
  for (const [resource, change] of Object.entries(effects)) {
    updated[resource] = Math.max(0, Math.min(maximum, updated[resource] + change));
  }
  return updated;
}
