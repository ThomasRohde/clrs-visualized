/**
 * The deploy gate, asserted rather than trusted.
 *
 * Deploy used to trigger independently on a push to the default branch and run
 * nothing but `npm run build`, so a commit whose tests were red was published
 * exactly like one whose tests were green. The fix is a job dependency:
 * deploy.yml runs ci.yml as a reusable workflow and every other job in it
 * `needs` that, so nothing reaches Pages until every gate has passed for the
 * commit being published.
 *
 * That is one line of YAML and it is invisible until the day it is missing, so
 * it is checked here. The walk below is a real reachability check, not a grep
 * for the word `needs` — a job wired to a *different* job that is itself
 * ungated would pass a grep and fail this.
 *
 * These are workflow files, so there is no YAML parser to hand and none is
 * worth a dependency: the two shapes that matter are `needs: name` and
 * `needs: [a, b]`, and anything else fails loudly as an unknown job rather
 * than passing quietly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workflow = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../.github/workflows/${name}`, import.meta.url)), 'utf8');

interface Job {
  name: string;
  needs: string[];
  body: string;
}

/** The top-level jobs of a workflow, with their declared dependencies. */
function jobsOf(yaml: string): Job[] {
  const after = yaml.slice(yaml.indexOf('\njobs:'));
  const lines = after.split('\n');
  const jobs: Job[] = [];
  let current: Job | null = null;

  for (const line of lines) {
    const header = /^ {2}([A-Za-z][\w-]*):\s*$/.exec(line);
    if (header) {
      current = { name: header[1]!, needs: [], body: '' };
      jobs.push(current);
      continue;
    }
    if (!current) continue;
    current.body += `${line}\n`;
    const needs = /^ {4}needs:\s*(.+?)\s*$/.exec(line);
    if (needs) {
      const raw = needs[1]!;
      current.needs = (raw.startsWith('[') ? raw.slice(1, -1).split(',') : [raw])
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }
  return jobs;
}

test('CI is callable, so another workflow can depend on it', () => {
  const ci = workflow('ci.yml');
  assert.match(
    ci,
    /^ {2}workflow_call:\s*$/m,
    'ci.yml has no workflow_call trigger, so deploy.yml cannot run it as a gate',
  );
  // The gate is only worth having if the suite is inside it.
  assert.match(ci, /^\s+- run: npm test$/m, 'ci.yml no longer runs the test suite');
  assert.match(ci, /^\s+- run: npm run verify:players$/m, 'ci.yml no longer runs the browser pass');
});

test('every job in Deploy waits on CI for the same commit', () => {
  const jobs = jobsOf(workflow('deploy.yml'));
  const byName = new Map(jobs.map((j) => [j.name, j]));

  const gate = byName.get('ci');
  assert.ok(gate, 'deploy.yml has no `ci` job; the gate has been removed');
  assert.match(
    gate.body,
    /uses: \.\/\.github\/workflows\/ci\.yml/,
    'deploy.yml\'s `ci` job does not call ci.yml, so "gated" would mean nothing',
  );
  // Called as a job of this workflow, so it runs against this workflow's own
  // ref and sha. A trigger that merely watched for a CI run to finish could
  // be satisfied by a different commit's.
  assert.ok(
    !/workflow_run/.test(workflow('deploy.yml')),
    'deploy.yml watches another workflow run rather than depending on one; ' +
      'that can be satisfied by a run of a different commit',
  );

  /** Can this job only start once `ci` has succeeded? */
  const gated = (job: Job, seen = new Set<string>()): boolean => {
    if (job.name === 'ci') return true;
    if (seen.has(job.name)) return false;
    seen.add(job.name);
    if (job.needs.length === 0) return false;
    return job.needs.every((n) => {
      const dep = byName.get(n);
      assert.ok(dep, `deploy.yml's "${job.name}" needs "${n}", which is not a job in this file`);
      return gated(dep, seen);
    });
  };

  for (const job of jobs) {
    assert.ok(
      gated(job),
      `deploy.yml's "${job.name}" job can start without CI having passed — ` +
        'add it to the chain that needs `ci`',
    );
  }
});
