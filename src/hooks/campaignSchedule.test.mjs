import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { before } from 'node:test';
import { transformWithOxc } from 'vite';

let campaign;
let definitions;

before(async () => {
  const source = await readFile(new URL('./campaignSchedule.ts', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'campaignSchedule.ts');
  campaign = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const challengeSource = await readFile(new URL('../data/dailyChallenges.ts', import.meta.url), 'utf8');
  const transformed = await transformWithOxc(challengeSource, 'dailyChallenges.ts');
  ({ DAILY_CHALLENGES: definitions } = await import(
    `data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`
  ));
});

function byId() {
  return new Map(definitions.map((definition) => [definition.id, definition]));
}

function assertBalanced(schedule) {
  const lookup = byId();
  assert.equal(schedule.length, campaign.CAMPAIGN_DAYS);
  const all = schedule.flat();
  assert.equal(all.length, campaign.CAMPAIGN_TASK_IDS.length);
  assert.equal(new Set(all).size, all.length, 'no task repeats across the campaign');
  assert.deepEqual([...all].sort(), [...campaign.CAMPAIGN_TASK_IDS].sort());
  schedule.forEach((day, index) => {
    assert.equal(day.length, campaign.TASKS_PER_CAMPAIGN_DAY);
    const tasks = day.map((id) => lookup.get(id));
    const criticals = tasks.filter((task) => task.priority === 'critical');
    const normals = tasks.filter((task) => task.priority === 'normal');
    assert.ok(criticals.length <= 1, `day ${index + 1} has at most one critical job`);
    assert.ok(normals.length >= 1, `day ${index + 1} keeps at least one gentle job`);
    if (index === 0) {
      assert.equal(criticals.length, 0, 'day 1 has no critical job');
      assert.ok(normals.length >= 2, 'day 1 is beginner-friendly');
    }
    for (const system of new Set(tasks.map((task) => task.affectedSystem))) {
      assert.ok(tasks.filter((task) => task.affectedSystem === system).length <= 2,
        `day ${index + 1} avoids three ${system} jobs`);
    }
    for (const kind of new Set(day.map((id) => campaign.CAMPAIGN_TASK_INTERACTIONS[id]))) {
      assert.ok(day.filter((id) => campaign.CAMPAIGN_TASK_INTERACTIONS[id] === kind).length <= 2,
        `day ${index + 1} avoids three ${kind} jobs`);
    }
  });
}

test('the campaign deals all fifteen selected tasks across five days of three', () => {
  for (const seed of [1, 7, 42, 0x51a7, 0x6a09e667]) {
    assertBalanced(campaign.createCampaignSchedule(seed, definitions));
  }
});

test('a seed always reproduces the same schedule while new seeds reshuffle it', () => {
  const first = campaign.createCampaignSchedule(0x1248abcd, definitions);
  assert.deepEqual(campaign.createCampaignSchedule(0x1248abcd, definitions), first);
  const distinct = new Set();
  for (let seed = 1; seed <= 200; seed += 1) {
    distinct.add(JSON.stringify(campaign.createCampaignSchedule(seed, definitions)));
  }
  assert.ok(distinct.size > 50, 'different campaigns produce different distributions');
});

test('every selected task declares an interaction pattern', () => {
  for (const id of campaign.CAMPAIGN_TASK_IDS) {
    assert.ok(campaign.CAMPAIGN_TASK_INTERACTIONS[id], `${id} needs an interaction kind`);
  }
});

test('the balanced deal holds across many campaign seeds', () => {
  for (let seed = 1; seed <= 2000; seed += 1) {
    assertBalanced(campaign.createCampaignSchedule(seed, definitions));
  }
});