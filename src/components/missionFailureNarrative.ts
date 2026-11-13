import { MOON_EVENTS, TASK_CONSEQUENCE_EVENTS } from '../data/moonEvents';
import type { ResourceKey } from '../data/moonEvents';

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  power: 'Power',
  battery: 'Battery',
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

const RESOURCE_SYSTEMS: Partial<Record<ResourceKey, string[]>> = {
  power: ['power'],
  battery: ['power'],
  oxygen: ['lifeSupport'],
  water: ['water'],
  emergencyReserve: ['water'],
  equipment: ['equipment'],
  habitat: ['lifeSupport'],
  health: ['lifeSupport'],
};

export function buildMissionFailureNarrative({
  day,
  failureReason,
  resources,
  threshold,
  tasks,
  events,
  outcomes,
  decisions,
}: {
  day: number;
  failureReason: ResourceKey | null;
  resources: Record<ResourceKey, number>;
  threshold: number;
  tasks: {
    id: string;
    title?: string;
    priority: string;
    status: string;
    affectedSystem?: string;
    emergency?: boolean;
    completedAfterDeadline?: boolean | null;
    responseTimeMs?: number | null;
  }[];
  events: { eventId: string; day: number; occurrenceId?: string; eventName?: string }[];
  outcomes: {
    eventId: string;
    day: number;
    occurrenceId: string;
    status: 'resolved' | 'failed' | 'expired';
    eventName?: string;
    decision?: string;
    feedback?: string;
    resourceChanges?: Partial<Record<ResourceKey, number>>;
  }[];
  decisions: {
    day?: number;
    eventName?: string;
    decisionLabel?: string;
    lesson?: string;
    futureConsequence?: string;
    actualOutcome?: string;
    resourceChanges?: Partial<Record<ResourceKey, number>>;
  }[];
}) {
  const trackedVitals: ResourceKey[] = ['oxygen', 'water', 'power', 'battery', 'food', 'habitat', 'health'];
  const failedResource = failureReason ?? trackedVitals.reduce((lowest, resource) => (
    resources[resource] < resources[lowest] ? resource : lowest
  ), trackedVitals[0]);
  const resourceLabel = RESOURCE_LABELS[failedResource];
  const finalAmount = Math.round(resources[failedResource] ?? 0);
  const definitions = [...MOON_EVENTS, ...TASK_CONSEQUENCE_EVENTS];
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const outcomeByOccurrence = new Map(outcomes.map((outcome) => [outcome.occurrenceId, outcome]));
  const outcomeFor = (event: (typeof events)[number]) => event.occurrenceId
    ? outcomeByOccurrence.get(event.occurrenceId)
    : outcomes.find((outcome) => outcome.eventId === event.eventId && outcome.day === event.day);
  const resolvedEvents = events.filter((event) => outcomeFor(event)?.status === 'resolved');
  const unresolvedEvents = events.filter((event) => outcomeFor(event)?.status !== 'resolved');
  const missedPriorityTasks = tasks.filter((task) => (
    (task.priority === 'critical' || task.priority === 'high') && task.status !== 'completed'
  ));
  const priorityTasks = tasks.filter((task) => task.priority === 'critical' || task.priority === 'high');
  const linkedMisses = unresolvedEvents.filter((event) => {
    const definition = definitions.find((entry) => entry.id === event.eventId);
    return definition?.riskTaskIds?.some((id) => missedPriorityTasks.some((task) => task.id === id));
  }).length;
  const unresolvedResourceEvents = unresolvedEvents.filter((event) => {
    const definition = definitions.find((entry) => entry.id === event.eventId);
    return definition?.riskResources?.includes(failedResource);
  }).length;
  const missedTasksAffectingFailedSystem = missedPriorityTasks.filter((task) => (
    RESOURCE_SYSTEMS[failedResource]?.includes(task.affectedSystem ?? '')
  )).length;
  const resourceCostChoices = decisions.filter((decision) => (
    (decision.resourceChanges?.[failedResource] ?? 0) < 0
  )).length;
  const lateTasks = tasks.filter((task) => task.status === 'completed' && task.completedAfterDeadline === true);
  const measuredResponseTimes = tasks
    .filter((task) => task.emergency && typeof task.responseTimeMs === 'number')
    .map((task) => task.responseTimeMs ?? 0);
  const averageResponseMs = measuredResponseTimes.length > 0
    ? Math.round(measuredResponseTimes.reduce((sum, value) => sum + value, 0) / measuredResponseTimes.length)
    : null;
  const completedTasks = tasks.filter((task) => task.status === 'completed').length;
  const missedTasks = tasks.length - completedTasks;
  const visibleResources: Record<'power' | 'battery' | 'oxygen' | 'water' | 'food' | 'health', number> = {
    power: resources.power,
    battery: resources.battery,
    oxygen: resources.oxygen,
    water: resources.water,
    food: resources.food,
    health: (resources.health + resources.habitat + resources.radProtection) / 3,
  };
  const criticalResources = (Object.entries(visibleResources) as [ResourceKey, number][])
    .filter(([, amount]) => amount <= threshold)
    .sort(([, first], [, second]) => first - second)
    .map(([resource, amount]) => ({ resource, label: RESOURCE_LABELS[resource], amount: Math.round(amount) }));
  const taskCompletionRate = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const priorityMissRate = priorityTasks.length > 0
    ? Math.round((missedPriorityTasks.length / priorityTasks.length) * 100)
    : 0;
  const eventResolutionRate = events.length > 0
    ? Math.round((resolvedEvents.length / events.length) * 100)
    : 0;
  const taskFollowThrough = priorityTasks.length > 0
    ? `${missedPriorityTasks.length} of ${priorityTasks.length} important jobs still needed doing (${priorityMissRate}%).`
    : 'There were no important jobs to finish on this mission.';
  const taskEventEffect = linkedMisses > 0
    ? ` Missing those jobs led to ${linkedMisses} outpost problem${linkedMisses === 1 ? '' : 's'}.`
    : '';
  const responsePattern = lateTasks.length > 0
    ? `${lateTasks.length} job${lateTasks.length === 1 ? '' : 's'} were finished after their due time${averageResponseMs === null ? '' : `; you took about ${Math.round(averageResponseMs / 1000)} seconds to answer urgent calls on average`}.`
    : averageResponseMs === null
      ? 'No job was late, and no urgent-call times were saved.'
      : `You answered urgent calls in about ${Math.round(averageResponseMs / 1000)} seconds on average. No job was late.`;
  const resourcePattern = criticalResources.length > 0
    ? `${criticalResources.length} resource bar${criticalResources.length === 1 ? '' : 's'} ended low: ${criticalResources.map(({ label, amount }) => `${label} ${amount}%`).join(', ')}.`
    : 'All tracked resources stayed above the low mark.';
  const choicePattern = resourceCostChoices > 0
    ? `${resourceCostChoices} emergency choice${resourceCostChoices === 1 ? '' : 's'} used more ${resourceLabel.toLowerCase()} than it gave back.`
    : `No emergency choice used more ${resourceLabel.toLowerCase()} than it gave back.`;

  const contributors: string[] = [];
  if (missedTasksAffectingFailedSystem > 0) {
    contributors.push(`${missedTasksAffectingFailedSystem} important job${missedTasksAffectingFailedSystem === 1 ? '' : 's'} still needed doing to help the ${resourceLabel.toLowerCase()} system`);
  }
  if (unresolvedResourceEvents > 0) {
    contributors.push(`${unresolvedResourceEvents} outpost problem${unresolvedResourceEvents === 1 ? '' : 's'} made it harder to keep ${resourceLabel.toLowerCase()} ready`);
  }
  if (resourceCostChoices > 0) {
    contributors.push(`${resourceCostChoices} emergency choice${resourceCostChoices === 1 ? '' : 's'} used more ${resourceLabel.toLowerCase()} than it gave back`);
  }
  if (contributors.length > 0 && linkedMisses > 0) {
    contributors.push(`${linkedMisses} outpost problem${linkedMisses === 1 ? '' : 's'} followed unfinished important jobs`);
  }

  const explanation = [
    `The mission ended on Day ${day} because ${resourceLabel.toLowerCase()} fell to ${finalAmount}%. It needs to stay above ${threshold}% for the mission to continue. ${contributors.length > 0 ? `Here’s what made it harder: ${contributors.join('; ')}. You can use this to plan for next time.` : `The mission notes don’t show an unfinished important job, an open problem, or a choice that used more ${resourceLabel.toLowerCase()} than it gave back.`}`,
  ];

  const behavior = [
    {
      label: 'Jobs finished',
      value: `${completedTasks}/${tasks.length} · ${taskCompletionRate}%`,
      detail: `${missedTasks} still to do`,
      tone: taskCompletionRate >= 75 ? 'good' : taskCompletionRate >= 50 ? 'warn' : 'critical',
    },
    {
      label: 'Important jobs',
      value: `${priorityTasks.length - missedPriorityTasks.length}/${priorityTasks.length} done`,
      detail: `${missedPriorityTasks.length} still to do · ${priorityMissRate}%`,
      tone: missedPriorityTasks.length === 0 ? 'good' : 'critical',
    },
    {
      label: 'Problems',
      value: `${resolvedEvents.length}/${events.length} · ${eventResolutionRate}%`,
      detail: `${unresolvedEvents.length} still need help`,
      tone: unresolvedEvents.length === 0 ? 'good' : 'warn',
    },
    {
      label: 'Quick help',
      value: `${lateTasks.length} job${lateTasks.length === 1 ? '' : 's'} after due time`,
      detail: averageResponseMs === null ? 'No times recorded' : `About ${Math.round(averageResponseMs / 1000)} seconds on average`,
      tone: lateTasks.length === 0 ? 'good' : 'warn',
    },
    {
      label: 'Resource choices',
      value: `${resourceCostChoices} choice${resourceCostChoices === 1 ? '' : 's'} used ${resourceLabel.toLowerCase()}`,
      detail: 'From the choices you made',
      tone: resourceCostChoices === 0 ? 'good' : 'warn',
    },
  ];

  const insights = [
    `${taskFollowThrough}${taskEventEffect}`,
    responsePattern,
    choicePattern,
    resourcePattern,
  ];

  const positiveDecision = decisions.find((decision) => (
    Object.values(decision.resourceChanges ?? {}).some((change) => (change ?? 0) > 0)
  ));
  const costlyDecision = decisions.find((decision) => (
    Object.values(decision.resourceChanges ?? {}).some((change) => (change ?? 0) < 0)
  ));
  const decisionProfile = decisions.length === 0
    ? 'There were no event choices in this record to review.'
    : `You made ${decisions.length} event choice${decisions.length === 1 ? '' : 's'}. You fixed ${resolvedEvents.length} of ${events.length} problems, and ${missedPriorityTasks.length} of ${priorityTasks.length} important jobs still needed doing. This helps show what happened on the mission.`;
  const strengths = [
    ...(positiveDecision ? [{
      title: `${positiveDecision.eventName ?? 'Event response'} · ${positiveDecision.decisionLabel ?? 'Decision recorded'}`,
      detail: `${positiveDecision.actualOutcome ?? 'The recorded choice produced a positive resource change.'}${positiveDecision.lesson ? ` ${positiveDecision.lesson}` : ''}`,
      tone: 'good',
    }] : []),
    ...resolvedEvents.slice(0, 2).map((event) => {
      const outcome = outcomeFor(event);
      const name = outcome?.eventName ?? event.eventName ?? definitions.find((definition) => definition.id === event.eventId)?.name ?? 'Mission event';
      return {
        title: `${name} · Day ${event.day}`,
        detail: outcome?.feedback || 'This event was recorded as resolved.',
        tone: 'good',
      };
    }),
  ];
  const lessons = [
    ...missedPriorityTasks.slice(0, 2).map((task) => ({
      title: `${task.title ?? 'Priority task'} · Day ${task.day}`,
      detail: `This job was still waiting. ${task.affectedSystem ? `It helps the ${task.affectedSystem} system. You can try it earlier next time.` : 'You can try it earlier next time.'}`,
      tone: 'warn',
    })),
    ...unresolvedEvents.slice(0, 2).map((event) => {
      const outcome = outcomeFor(event);
      const name = outcome?.eventName ?? event.eventName ?? definitions.find((definition) => definition.id === event.eventId)?.name ?? 'Mission event';
      return {
        title: `${name} · Day ${event.day}`,
        detail: outcome?.feedback || `This event was ${outcome?.status ?? 'not recorded as resolved'}. Check whether an earlier response was possible alongside the other active priorities.`,
        tone: 'warn',
      };
    }),
    ...(costlyDecision ? [{
      title: `${costlyDecision.eventName ?? 'Event response'} · ${costlyDecision.decisionLabel ?? 'Decision recorded'}`,
      detail: `${costlyDecision.actualOutcome ?? 'This choice used some resources.'}${costlyDecision.futureConsequence ? ` It may also mean ${costlyDecision.futureConsequence.toLowerCase()}.` : ''} A cost does not make a choice wrong. Think about the problem and the other choices you had.`,
      tone: 'warn',
    }] : []),
  ];
  const choiceResourceNames = [...new Set(
    decisions.flatMap((decision) => Object.entries(decision.resourceChanges ?? {})
      .filter(([, change]) => (change ?? 0) !== 0)
      .map(([resource]) => RESOURCE_LABELS[resource as ResourceKey])),
  )].join(', ');
  const resourceAnalysis = [
    ...criticalResources.map(({ label, amount }) => `${label} ended at ${amount}%, below the ${threshold}% low mark.`),
    ...(decisions.length > 0
      ? [`Your event choices changed ${choiceResourceNames || 'no resources'}. Daily use and job rewards are counted separately.`]
      : ['No event choices changed the resources, so there is nothing to compare here.']),
  ];
  const recommendations = [
    ...(missedPriorityTasks.length > 0
      ? [`Try ${missedPriorityTasks[0].title ?? 'the most important job'} before other jobs next time; ${missedPriorityTasks[0].affectedSystem ? `it helps the ${missedPriorityTasks[0].affectedSystem} system.` : 'check what it helps and when it is due.'}`]
      : []),
    ...(criticalResources.length > 0
      ? [`Watch ${criticalResources[0].label.toLowerCase()} early next time. It ended at ${criticalResources[0].amount}%, so save some resources and care for its system before it falls below ${threshold}%.`]
      : []),
    ...(unresolvedEvents.length > 0
      ? [`If a similar problem appears, check how soon it needs help and what resources it may use. Then choose a way to help before time runs out.`]
      : []),
    ...(decisions.length === 0 && missedPriorityTasks.length === 0 && criticalResources.length === 0 && unresolvedEvents.length === 0
      ? ['Keep using the event and task history to compare trade-offs; this run contains no clear recorded decision pattern that supports a more specific recommendation.']
      : []),
  ];

  return {
    explanation,
    behavior,
    insights,
    decisionProfile,
    strengths,
    lessons,
    resourceAnalysis,
    recommendations,
    stats: {
      completedTasks,
      missedTasks,
      taskCompletionRate,
      resolvedEvents: resolvedEvents.length,
      unresolvedEvents: unresolvedEvents.length,
      eventResolutionRate,
      criticalResources,
      missedPriorityTasks: missedPriorityTasks.length,
    },
  };
}
