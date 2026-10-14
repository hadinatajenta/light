import { describe, expect, it } from 'vitest';
import { AGENT_ROLES, MAX_AGENTS_BY_ROLE, MAX_RUNS_PER_DAY, MIN_RUNS_PER_DAY } from './roles';
import {
  type AgentRecord,
  claimAgentRun,
  computeAgentNextRunAt,
  computeNextRunAt,
  hasRepeatedFailures,
  listAgents,
  listDueAgents,
  MAX_AGENT_CATEGORIES,
  mergeWriterCategories,
  parseAgentCategories,
  serializeAgentCategories,
  updateAgent,
} from './store';

const FROM = new Date('2026-10-11T00:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

interface FakeAgentRow {
  id: string;
  name: string;
  role: string;
  prompt: string;
  categories: string | null;
  model: string;
  runs_per_day: number;
  enabled: number;
  auto_publish: number;
  schedule_mode: string | null;
  schedule_hours: string | null;
  system_managed: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

function agentRow(overrides: Partial<FakeAgentRow> = {}): FakeAgentRow {
  return {
    id: 'agent-1',
    name: 'Writer One',
    role: 'writer',
    prompt: 'Draft buying guides.',
    categories: '[]',
    model: 'deepseek-flash',
    runs_per_day: 2,
    enabled: 1,
    auto_publish: 0,
    schedule_mode: null,
    schedule_hours: null,
    system_managed: 0,
    last_run_at: null,
    next_run_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function createFakeAgentDatabase(row: FakeAgentRow): {
  database: D1Database;
  writes: RecordedQuery[];
  queries: RecordedQuery[];
} {
  const writes: RecordedQuery[] = [];
  const queries: RecordedQuery[] = [];

  const database = {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        async first() {
          queries.push({ sql, params });
          return sql.includes('FROM agent_runs') ? null : { ...row };
        },
        async all() {
          queries.push({ sql, params });
          return sql.includes('FROM agent_runs') ? { results: [] } : { results: [{ ...row }] };
        },
        async run() {
          writes.push({ sql, params });
          if (sql.includes('UPDATE agents SET name')) {
            row.name = String(params[0]);
            row.role = String(params[1]);
            row.prompt = String(params[2]);
            row.categories = String(params[3]);
            row.model = String(params[4]);
            row.runs_per_day = Number(params[5]);
            row.enabled = Number(params[6]);
            row.auto_publish = Number(params[7]);
            row.schedule_mode = params[8] === null ? null : String(params[8]);
            row.next_run_at = params[9] === null ? null : String(params[9]);
            row.updated_at = String(params[10]);
            row.schedule_hours = params[11] === null ? null : String(params[11]);
          }
          return { meta: { changes: 1 } };
        },
      };

      return statement;
    },
  };

  return { database: database as unknown as D1Database, writes, queries };
}

const WRITER_AGENT: AgentRecord = {
  id: 'agent-1',
  name: 'Writer One',
  role: 'writer',
  prompt: 'Draft buying guides.',
  categories: [],
  model: 'deepseek-flash',
  runsPerDay: 2,
  enabled: true,
  autoPublish: false,
  scheduleMode: null,
  scheduleHours: [],
  systemManaged: false,
  lastRunAt: null,
  nextRunAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('computeNextRunAt', () => {
  it('spreads one run per day across a full day', () => {
    expect(computeNextRunAt(1, FROM)).toBe(new Date(FROM.getTime() + 24 * HOUR_MS).toISOString());
  });

  it('shortens the interval as runs per day grows', () => {
    expect(computeNextRunAt(4, FROM)).toBe(new Date(FROM.getTime() + 6 * HOUR_MS).toISOString());
    expect(computeNextRunAt(24, FROM)).toBe(new Date(FROM.getTime() + HOUR_MS).toISOString());
  });

  it('clamps values below one and above the cap', () => {
    expect(computeNextRunAt(0, FROM)).toBe(computeNextRunAt(1, FROM));
    expect(computeNextRunAt(1000, FROM)).toBe(computeNextRunAt(MAX_RUNS_PER_DAY, FROM));
  });

  it('supports the fifteen minute cadence at the cap', () => {
    expect(computeNextRunAt(MAX_RUNS_PER_DAY, FROM)).toBe(
      new Date(FROM.getTime() + 15 * 60 * 1000).toISOString(),
    );
  });

  it('schedules the claim past the claim time for every cadence', () => {
    for (let runsPerDay = MIN_RUNS_PER_DAY; runsPerDay <= MAX_RUNS_PER_DAY; runsPerDay += 1) {
      const nextRunAt = computeNextRunAt(runsPerDay, FROM);

      expect(new Date(nextRunAt).getTime()).toBeGreaterThan(FROM.getTime());
    }
  });
});

describe('computeAgentNextRunAt', () => {
  it('spreads daily runs with the existing runs per day cadence', () => {
    expect(computeAgentNextRunAt({ scheduleMode: 'daily', runsPerDay: 4 }, FROM)).toBe(
      new Date(FROM.getTime() + 6 * HOUR_MS).toISOString(),
    );
  });

  it('falls through to the runs per day cadence when no mode is stored', () => {
    expect(computeAgentNextRunAt({ scheduleMode: null, runsPerDay: 2 }, FROM)).toBe(
      new Date(FROM.getTime() + 12 * HOUR_MS).toISOString(),
    );
  });

  it('schedules weekly runs seven days out', () => {
    expect(computeAgentNextRunAt({ scheduleMode: 'weekly', runsPerDay: 1 }, FROM)).toBe(
      new Date(FROM.getTime() + 7 * 24 * HOUR_MS).toISOString(),
    );
  });

  it('returns null for manual agents so they are never due', () => {
    expect(computeAgentNextRunAt({ scheduleMode: 'manual', runsPerDay: 24 }, FROM)).toBeNull();
  });

  it('ignores runs per day outside the daily mode', () => {
    expect(computeAgentNextRunAt({ scheduleMode: 'weekly', runsPerDay: 96 }, FROM)).toBe(
      computeAgentNextRunAt({ scheduleMode: 'weekly', runsPerDay: 1 }, FROM),
    );
  });

  it('returns the next fixed hour in Jakarta when hours are configured', () => {
    expect(
      computeAgentNextRunAt(
        { scheduleMode: 'hours', runsPerDay: 24, scheduleHours: [6, 12, 18] },
        FROM,
      ),
    ).toBe(new Date('2026-10-11T05:00:00.000Z').toISOString());
  });

  it('returns the Jakarta morning that falls on the previous UTC day', () => {
    expect(
      computeAgentNextRunAt(
        { scheduleMode: 'hours', runsPerDay: 24, scheduleHours: [6, 12, 18] },
        new Date('2026-10-13T22:59:00.000Z'),
      ),
    ).toBe(new Date('2026-10-13T23:00:00.000Z').toISOString());
  });

  it('rolls the fixed hours over to the next Jakarta day', () => {
    expect(
      computeAgentNextRunAt(
        { scheduleMode: 'hours', runsPerDay: 24, scheduleHours: [6, 12, 18] },
        new Date('2026-10-13T12:00:00.000Z'),
      ),
    ).toBe(new Date('2026-10-13T23:00:00.000Z').toISOString());
  });

  it('falls back to the run interval when the hour schedule is empty', () => {
    expect(
      computeAgentNextRunAt({ scheduleMode: 'hours', runsPerDay: 4, scheduleHours: [] }, FROM),
    ).toBe(computeNextRunAt(4, FROM));
  });

  it('falls back to the run interval when the hour schedule is null or unknown', () => {
    expect(
      computeAgentNextRunAt({ scheduleMode: 'hours', runsPerDay: 2, scheduleHours: null }, FROM),
    ).toBe(computeNextRunAt(2, FROM));
    expect(
      computeAgentNextRunAt(
        { scheduleMode: 'hours', runsPerDay: 2, scheduleHours: [99, -3] },
        FROM,
      ),
    ).toBe(computeNextRunAt(2, FROM));
    expect(computeAgentNextRunAt({ scheduleMode: 'hours', runsPerDay: 2 }, FROM)).toBe(
      computeNextRunAt(2, FROM),
    );
  });
});

describe('hasRepeatedFailures', () => {
  it('detects three failed runs in a row', () => {
    expect(hasRepeatedFailures(['failed', 'failed', 'failed'])).toBe(true);
  });

  it('ignores a streak shorter than three runs', () => {
    expect(hasRepeatedFailures([])).toBe(false);
    expect(hasRepeatedFailures(['failed'])).toBe(false);
    expect(hasRepeatedFailures(['failed', 'failed'])).toBe(false);
  });

  it('breaks the streak when any run did not fail', () => {
    expect(hasRepeatedFailures(['failed', 'succeeded', 'failed'])).toBe(false);
    expect(hasRepeatedFailures(['failed', 'failed', 'skipped'])).toBe(false);
    expect(hasRepeatedFailures(['failed', 'failed', 'running'])).toBe(false);
  });

  it('requires exactly the three newest runs', () => {
    expect(hasRepeatedFailures(['failed', 'failed', 'failed', 'failed'])).toBe(false);
  });
});

describe('parseAgentCategories', () => {
  it('parses the stored JSON array form', () => {
    expect(parseAgentCategories('["desk-setup","chairs"]')).toEqual(['desk-setup', 'chairs']);
  });

  it('parses a plain comma separated string', () => {
    expect(parseAgentCategories('accessories, monitors, audio')).toEqual([
      'accessories',
      'monitors',
      'audio',
    ]);
  });

  it('trims entries and drops empties', () => {
    expect(parseAgentCategories('[" desk-setup ", "", "  ", "chairs"]')).toEqual([
      'desk-setup',
      'chairs',
    ]);
    expect(parseAgentCategories(' accessories , , monitors ')).toEqual(['accessories', 'monitors']);
  });

  it('de-duplicates repeated categories', () => {
    expect(parseAgentCategories('["chairs","desk-setup","chairs","desk-setup"]')).toEqual([
      'chairs',
      'desk-setup',
    ]);
  });

  it('caps the number of categories', () => {
    const many = '["a","b","c","d","e","f","g","h"]';

    expect(parseAgentCategories(many)).toHaveLength(MAX_AGENT_CATEGORIES);
    expect(parseAgentCategories(many)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('returns an empty array for unparseable input', () => {
    expect(parseAgentCategories('')).toEqual([]);
    expect(parseAgentCategories('   ')).toEqual([]);
    expect(parseAgentCategories(null)).toEqual([]);
    expect(parseAgentCategories(42)).toEqual([]);
    expect(parseAgentCategories('[1,2,3]')).toEqual([]);
    expect(parseAgentCategories('[not valid json')).toEqual([]);
  });

  it('keeps only string entries from a mixed array', () => {
    expect(parseAgentCategories('["chairs", 5, null, "chairs", ""]')).toEqual(['chairs']);
  });
});

describe('serializeAgentCategories', () => {
  it('round trips through parse', () => {
    const serialized = serializeAgentCategories(['chairs', 'desk-setup']);
    const parsed = JSON.parse(serialized);

    expect(serialized).toBe('["chairs","desk-setup"]');
    expect(parsed).toEqual(['chairs', 'desk-setup']);
    expect(parseAgentCategories(serialized)).toEqual(['chairs', 'desk-setup']);
  });

  it('normalizes before serializing', () => {
    expect(serializeAgentCategories([' chairs ', 'chairs', ''])).toBe('["chairs"]');
  });

  it('serializes an empty list', () => {
    expect(serializeAgentCategories([])).toBe('[]');
  });
});

describe('mergeWriterCategories', () => {
  it('flattens lists and keeps first-seen order', () => {
    expect(mergeWriterCategories([['chairs', 'audio'], ['desk-setup']])).toEqual([
      'chairs',
      'audio',
      'desk-setup',
    ]);
  });

  it('de-duplicates across writers', () => {
    expect(
      mergeWriterCategories([
        ['chairs', 'audio'],
        ['audio', 'chairs', 'monitors'],
      ]),
    ).toEqual(['chairs', 'audio', 'monitors']);
  });

  it('returns an empty array when nothing is configured', () => {
    expect(mergeWriterCategories([])).toEqual([]);
    expect(mergeWriterCategories([[], []])).toEqual([]);
  });

  it('ignores empty and whitespace-only entries', () => {
    expect(mergeWriterCategories([['', '  '], ['monitors']])).toEqual(['monitors']);
  });
});

describe('MAX_AGENTS_BY_ROLE', () => {
  it('caps writers at four and every other role at two', () => {
    expect(MAX_AGENTS_BY_ROLE.writer).toBe(4);
    expect(MAX_AGENTS_BY_ROLE.planner).toBe(2);
    expect(MAX_AGENTS_BY_ROLE.scrapper).toBe(2);
    expect(MAX_AGENTS_BY_ROLE.qc).toBe(2);
    expect(MAX_AGENTS_BY_ROLE.reviewer).toBe(2);
    expect(MAX_AGENTS_BY_ROLE.analyst).toBe(1);
  });

  it('defines a limit for every agent role', () => {
    for (const role of AGENT_ROLES) {
      expect(MAX_AGENTS_BY_ROLE[role]).toBeGreaterThan(0);
    }
  });
});

describe('listDueAgents', () => {
  it('keeps an agent that stores no schedule mode eligible', async () => {
    const row = agentRow({ schedule_mode: null, next_run_at: null });
    const { database, queries } = createFakeAgentDatabase(row);

    const agents = await listDueAgents(database, FROM.toISOString());

    expect(agents.map((agent) => agent.id)).toEqual([row.id]);
    expect(agents[0]?.scheduleMode).toBeNull();
    const select = queries.find((query) => query.sql.includes('SELECT * FROM agents'));
    expect(select?.sql).toContain("(schedule_mode IS NULL OR schedule_mode != 'manual')");
  });
});

describe('claimAgentRun', () => {
  it('claims a due agent that stores no schedule mode', async () => {
    const row = agentRow({ schedule_mode: null, next_run_at: null });
    const { database, writes } = createFakeAgentDatabase(row);

    const claimed = await claimAgentRun(database, WRITER_AGENT, { now: FROM });

    expect(claimed).toBe(true);
    const update = writes.find((write) => write.sql.includes('UPDATE agents SET next_run_at'));
    expect(update?.sql).toContain("(schedule_mode IS NULL OR schedule_mode != 'manual')");
  });
});

describe('updateAgent', () => {
  it('stores the run interval sentinel when the payload omits the schedule mode', async () => {
    const row = agentRow({ schedule_mode: null });
    const { database, writes } = createFakeAgentDatabase(row);

    const agent = await updateAgent(database, row.id, {
      name: 'Writer Two',
      role: 'writer',
      prompt: 'Draft buying guides.',
      categories: [],
      model: 'deepseek-v4-pro',
      runsPerDay: 4,
      enabled: true,
      autoPublish: false,
    });

    const update = writes.find((write) => write.sql.includes('UPDATE agents SET name'));
    expect(agent.scheduleMode).toBe('interval');
    expect(update?.params[8]).toBe('interval');
  });

  it('does not move the next run of a system managed agent when the mode is omitted', async () => {
    const nextRunAt = '2026-10-18T00:00:00.000Z';
    const row = agentRow({
      role: 'analyst',
      system_managed: 1,
      schedule_mode: 'weekly',
      next_run_at: nextRunAt,
      runs_per_day: 1,
    });
    const { database, writes } = createFakeAgentDatabase(row);

    const agent = await updateAgent(database, row.id, {
      name: 'Performance Analyst',
      role: 'analyst',
      prompt: 'Watch the analytics queue.',
      model: 'deepseek-flash',
      runsPerDay: 1,
      enabled: true,
      autoPublish: false,
    });

    const update = writes.find((write) => write.sql.includes('UPDATE agents SET name'));
    expect(agent.scheduleMode).toBe('weekly');
    expect(update?.params[8]).toBe('weekly');
    expect(update?.params[9]).toBe(nextRunAt);
  });

  it('persists an explicit manual mode and clears the next run', async () => {
    const row = agentRow({ schedule_mode: 'weekly', next_run_at: '2026-10-18T00:00:00.000Z' });
    const { database, writes } = createFakeAgentDatabase(row);

    const agent = await updateAgent(database, row.id, {
      name: 'Writer One',
      role: 'writer',
      prompt: 'Draft buying guides.',
      categories: [],
      model: 'deepseek-flash',
      runsPerDay: 2,
      enabled: true,
      autoPublish: false,
      scheduleMode: 'manual',
    });

    const update = writes.find((write) => write.sql.includes('UPDATE agents SET name'));
    expect(agent.scheduleMode).toBe('manual');
    expect(update?.params[8]).toBe('manual');
    expect(update?.params[9]).toBeNull();
  });

  it('stores a fixed hour schedule from the payload', async () => {
    const row = agentRow({ schedule_mode: 'daily' });
    const { database, writes } = createFakeAgentDatabase(row);

    const agent = await updateAgent(database, row.id, {
      name: 'Researcher',
      role: 'scrapper',
      prompt: 'Research topics.',
      categories: [],
      model: 'deepseek-flash',
      runsPerDay: 24,
      enabled: true,
      autoPublish: false,
      scheduleMode: 'hours',
      scheduleHours: [18, 6, 12],
    });

    const update = writes.find((write) => write.sql.includes('UPDATE agents SET name'));
    expect(agent.scheduleMode).toBe('hours');
    expect(agent.scheduleHours).toEqual([6, 12, 18]);
    expect(update?.params[8]).toBe('hours');
    expect(update?.params[11]).toBe('6,12,18');
  });

  it('keeps the stored hours when the payload omits them', async () => {
    const row = agentRow({ schedule_mode: 'hours', schedule_hours: '6,12,18' });
    const { database, writes } = createFakeAgentDatabase(row);

    const agent = await updateAgent(database, row.id, {
      name: 'Researcher',
      role: 'scrapper',
      prompt: 'Research topics.',
      categories: [],
      model: 'deepseek-flash',
      runsPerDay: 24,
      enabled: true,
      autoPublish: false,
    });

    const update = writes.find((write) => write.sql.includes('UPDATE agents SET name'));
    expect(agent.scheduleMode).toBe('hours');
    expect(agent.scheduleHours).toEqual([6, 12, 18]);
    expect(update?.params[11]).toBe('6,12,18');
  });
});

describe('listAgents', () => {
  it('reads the stored schedule mode and hours', async () => {
    const row = agentRow({ schedule_mode: 'hours', schedule_hours: '6,12,18' });
    const { database } = createFakeAgentDatabase(row);

    const agents = await listAgents(database);

    expect(agents[0]?.scheduleMode).toBe('hours');
    expect(agents[0]?.scheduleHours).toEqual([6, 12, 18]);
  });

  it('reads an agent with no hour schedule', async () => {
    const row = agentRow({ schedule_mode: 'daily', schedule_hours: null });
    const { database } = createFakeAgentDatabase(row);

    const agents = await listAgents(database);

    expect(agents[0]?.scheduleMode).toBe('daily');
    expect(agents[0]?.scheduleHours).toEqual([]);
  });
});
