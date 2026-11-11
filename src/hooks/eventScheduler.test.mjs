import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { before } from 'node:test';
import { transformWithOxc } from 'vite';

let scheduler;
before(async () => {
  const source = await readFile(new URL('./eventScheduler.ts', import.meta.url), 'utf8');
  const transformed = await transformWithOxc(source, 'eventScheduler.ts');
  scheduler = await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`);
});

function chooseIndependentEvent({ day, elapsedMs, dayDurationMs = 300_000 }) {
  return scheduler.selectMajorEvent({
    events: [{
      id: `independent-day-${day}`,
      severity: 'medium',
      minDay: 1,
      cooldownDays: 1,
      maxOccurrences: 1,
      baseWeight: 1,
      affectedSystems: ['power'],
      riskResources: ['power'],
    }],
    day,
    maxDays: 30,
    dayDurationMs,
    elapsedMs: day * dayDurationMs + elapsedMs,
    independentElapsedMs: elapsedMs,
    rngState: day,
    flags: [],
    systemConditions: { power: 100 },
    resources: { power: 100 },
    eventHistory: [],
    forceEvent: false,
  }, 10_000);
}

test('independent events are selectable from minute two until the final minute', () => {
  for (let day = 1; day <= 10; day += 1) {
    const elapsedMs = 120_000 + (day % 4) * 10_000;
    assert.ok(chooseIndependentEvent({ day, elapsedMs }).event, `day ${day} should allow an event in the window`);
    assert.equal(chooseIndependentEvent({ day, elapsedMs: 240_000 }).event, null,
      `day ${day} must close independent scheduling one minute before day end`);
  }
  assert.equal(chooseIndependentEvent({ day: 11, elapsedMs: 40_000, dayDurationMs: 90_000 }).event, null);
});

test('task-triggered event selection is not restricted by the independent-event window', () => {
  const selected = scheduler.selectMajorEvent({
    events: [{
      id: 'task-consequence', severity: 'critical', minDay: 1, cooldownDays: 1,
      maxOccurrences: 1, baseWeight: 1, affectedSystems: ['power'], riskResources: ['power'],
    }],
    day: 4,
    maxDays: 30,
    dayDurationMs: 120_000,
    elapsedMs: 4 * 120_000 + 90_000,
    rngState: 4,
    flags: [],
    systemConditions: { power: 100 },
    resources: { power: 100 },
    eventHistory: [],
    forceEvent: true,
  }, 10_000);
  assert.equal(selected.event?.id, 'task-consequence');
});
