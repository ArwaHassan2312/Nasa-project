import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { before } from 'node:test';
import { transformWithOxc } from 'vite';
import { INITIAL_REPAIR_INVENTORY } from '../hooks/taskLifecycle.js';

let challengeDefinitions;
let taskExperiences;

before(async () => {
  const challengeSource = await readFile(new URL('./dailyChallenges.ts', import.meta.url), 'utf8');
  const transformedChallenges = await transformWithOxc(challengeSource, 'dailyChallenges.ts');
  challengeDefinitions = await import(
    `data:text/javascript;base64,${Buffer.from(transformedChallenges.code).toString('base64')}`
  );

  const experienceSource = await readFile(new URL('./dailyTaskExperiences.ts', import.meta.url), 'utf8');
  const transformedExperiences = await transformWithOxc(experienceSource, 'dailyTaskExperiences.ts');
  taskExperiences = await import(
    `data:text/javascript;base64,${Buffer.from(transformedExperiences.code).toString('base64')}`
  );
});

test('every non-repair task definition has a first-five plan using shared reusable inventory', () => {
  const taskDefinitions = challengeDefinitions.DAILY_CHALLENGES.filter((task) => (
    !taskExperiences.getDailyTaskExperience({ ...task, scheduledDay: 3 }).repair
  ));
  const plans = taskDefinitions.map((task) => taskExperiences.getFirstFiveTaskPlan(task));

  assert.ok(plans.length > 0);
  for (const plan of plans) {
    assert.ok(INITIAL_REPAIR_INVENTORY.tools.includes(plan.toolId), `${plan.toolId} is in shared inventory`);
    assert.ok(plan.action);
    assert.ok(plan.gestureInstruction);
    assert.ok(plan.testPrompt);
    assert.ok(plan.passingReading);
    assert.ok(plan.failingReading);
  }
  assert.ok(new Set(plans.map((plan) => plan.gesture)).size >= 4);
});

test('regolith task experience is corrected only for Days 1–5', () => {
  const regolithTask = challengeDefinitions.DAILY_CHALLENGES.find(
    (task) => task.id === 'regolith-plant-maintenance',
  );
  assert.ok(regolithTask);

  const firstFiveExperience = taskExperiences.getDailyTaskExperience({
    ...regolithTask,
    scheduledDay: 4,
  });
  const laterExperience = taskExperiences.getDailyTaskExperience({
    ...regolithTask,
    scheduledDay: 6,
  });

  assert.equal(firstFiveExperience.brokenPart, 'Service valve');
  assert.equal(laterExperience.picture, 'Battery container');
});
