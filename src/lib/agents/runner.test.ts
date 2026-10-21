import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationInput } from '../notifications/types';
import { createChatCompletion } from './model-client';
import { runPreflight } from './preflight';
import { runAgent, shouldChainReviewRun } from './runner';
import type { AgentRecord } from './store';
import { MAX_UNCLAIMED_TOPICS } from './topics';

const mocks = vi.hoisted(() => ({
  createChatCompletion: vi.fn(),
  requireProviderKey: vi.fn(async () => 'test-key'),
  createPost: vi.fn(async () => ({ id: 'draft-1' })),
  notify: vi.fn<(input: NotificationInput) => Promise<void>>(async () => undefined),
}));

vi.mock('./model-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./model-client')>();
  return { ...actual, createChatCompletion: mocks.createChatCompletion };
});

vi.mock('./settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./settings')>();
  return { ...actual, requireProviderKey: mocks.requireProviderKey };
});

vi.mock('../content/store', () => ({ createPost: mocks.createPost }));

vi.mock('../notifications/notify', () => ({ notify: mocks.notify }));

const MODEL_CALL = vi.mocked(createChatCompletion);
const NO_TOPIC_MESSAGE =
  'No researched topic is available. Run the Researcher to collect material first.';
const NO_QUEUED_TOPIC_MESSAGE =
  'No queued topic is available. Run the Planner to propose topics first.';
const QUEUE_FULL_MESSAGE = 'The topic queue already holds enough unclaimed work.';
const NO_DRAFT_MESSAGE = 'No draft is waiting for review. Run a Writer to produce one.';

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

interface FakeAgentRow {
  id: string;
  name: string;
  role: string;
  prompt: string;
  categories: string | null;
  provider: string;
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

interface FakeTopicRow {
  id: string;
  title: string;
  keywords: string;
  category: string | null;
  intent: string | null;
  status: string;
  assigned_agent_id: string | null;
  used_post_id: string | null;
  created_by_agent_id: string | null;
  note: string | null;
  attempts: number;
  next_attempt_at: string | null;
  created_at: string;
  updated_at: string;
}

interface FakePostRow {
  id: string;
  title: string;
  description: string;
  body: string;
  status: string;
  review_status: string | null;
  review_stage: string | null;
  pub_date: string | null;
  revision_count: number;
  review_notes: string | null;
}

interface RunnerDatabaseOptions {
  agents?: FakeAgentRow[];
  claimableTopic?: FakeTopicRow | null;
  revisionDraft?: FakePostRow | null;
  pendingDraft?: FakePostRow | null;
  plannerCategories?: string[];
  unclaimedTopics?: number;
  verifiedSources?: boolean;
}

interface RunOutcome {
  status: string;
  summary: string;
  error: string | null;
}

interface RunnerDatabase {
  database: D1Database;
  writes: RecordedQuery[];
  runOutcomes: RunOutcome[];
}

function createRunnerDatabase(options: RunnerDatabaseOptions = {}): RunnerDatabase {
  const writes: RecordedQuery[] = [];
  const runOutcomes: RunOutcome[] = [];

  const firstFor = (sql: string): unknown => {
    if (sql.includes('started_at FROM agent_runs')) {
      return null;
    }

    if (sql.includes('SELECT id FROM posts WHERE id = ?')) {
      return null;
    }

    if (sql.includes('FROM posts') && sql.includes('review_notes, revision_count')) {
      return options.revisionDraft ?? null;
    }

    if (sql.includes('FROM posts') && sql.includes('RETURNING')) {
      return options.pendingDraft ?? null;
    }

    if (sql.includes('published_at FROM posts')) {
      return null;
    }

    if (sql.includes('FROM topics') && sql.includes('next_attempt_at')) {
      const topic = options.claimableTopic;

      return topic
        ? { id: topic.id, status: topic.status, next_attempt_at: topic.next_attempt_at }
        : null;
    }

    if (sql.includes('FROM topics') && sql.includes('used_post_id = ?')) {
      return options.claimableTopic ?? null;
    }

    if (sql.includes('SELECT * FROM topics WHERE id = ?')) {
      return options.claimableTopic ?? null;
    }

    if (sql.includes('SELECT id FROM sources')) {
      return options.verifiedSources === false ? null : { id: 'source-1' };
    }

    if (sql.includes('FROM settings')) {
      return null;
    }

    if (sql.includes('FROM usage_counters')) {
      return sql.includes('SUM') ? { total: 0 } : null;
    }

    return null;
  };

  const allFor = (sql: string): { results: unknown[] } => {
    if (sql.includes('FROM agents') && sql.includes('ORDER BY created_at')) {
      return { results: options.agents ?? [] };
    }

    if (sql.includes('categories FROM agents')) {
      const categories = options.plannerCategories ?? [];

      return {
        results: categories.length > 0 ? [{ categories: JSON.stringify(categories) }] : [],
      };
    }

    if (sql.includes('FROM agent_runs') && sql.includes('SELECT status')) {
      return { results: [] };
    }

    if (sql.includes('COUNT(*) AS total FROM topics')) {
      const total = options.unclaimedTopics ?? 0;

      return { results: total > 0 ? [{ status: 'queued', total }] : [] };
    }

    if (sql.includes('FROM posts') && sql.includes('SELECT id, title, revision_count')) {
      return { results: [] };
    }

    return { results: [] };
  };

  const runFor = (sql: string, params: unknown[]): { meta: { changes: number } } => {
    if (sql.includes('UPDATE agent_runs SET status')) {
      runOutcomes.push({
        status: String(params[0] ?? ''),
        summary: String(params[1] ?? ''),
        error: params[5] === null || params[5] === undefined ? null : String(params[5]),
      });
    }

    return { meta: { changes: 1 } };
  };

  const database = {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        async first() {
          writes.push({ sql, params });
          return firstFor(sql);
        },
        async all() {
          writes.push({ sql, params });
          return allFor(sql);
        },
        async run() {
          writes.push({ sql, params });
          return runFor(sql, params);
        },
      };

      return statement;
    },
  };

  return { database: database as unknown as D1Database, writes, runOutcomes };
}

function countRunInserts(store: RunnerDatabase): number {
  return store.writes.filter((write) => write.sql.includes('INSERT INTO agent_runs')).length;
}

function runAgentIds(store: RunnerDatabase): unknown[] {
  return store.writes
    .filter((write) => write.sql.includes('INSERT INTO agent_runs'))
    .map((write) => write.params[1]);
}

function failureNotification(): NotificationInput | undefined {
  return mocks.notify.mock.calls
    .map((call) => call[0])
    .find((input) => input.event === 'agent.run.failed');
}

function agentRow(agent: AgentRecord): FakeAgentRow {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    prompt: agent.prompt,
    categories: JSON.stringify(agent.categories),
    provider: agent.provider,
    model: agent.model,
    runs_per_day: agent.runsPerDay,
    enabled: agent.enabled ? 1 : 0,
    auto_publish: agent.autoPublish ? 1 : 0,
    schedule_mode: agent.scheduleMode,
    schedule_hours: agent.scheduleHours.length > 0 ? agent.scheduleHours.join(',') : null,
    system_managed: agent.systemManaged ? 1 : 0,
    last_run_at: agent.lastRunAt,
    next_run_at: agent.nextRunAt,
    created_at: agent.createdAt,
    updated_at: agent.updatedAt,
  };
}

function topicRow(overrides: Partial<FakeTopicRow> = {}): FakeTopicRow {
  return {
    id: 'topic-1',
    title: 'How far should a monitor sit from your eyes',
    keywords: '["monitor distance","screen height"]',
    category: 'desk-setup',
    intent: 'informational',
    status: 'researched',
    assigned_agent_id: null,
    used_post_id: null,
    created_by_agent_id: null,
    note: null,
    attempts: 0,
    next_attempt_at: null,
    created_at: '2026-10-13T00:00:00.000Z',
    updated_at: '2026-10-13T00:00:00.000Z',
    ...overrides,
  };
}

const DRAFT_TITLE = 'How far should a monitor sit from your eyes';
const DRAFT_DESCRIPTION =
  'Distance, screen height, and desk depth: the numbers to check before you buy a monitor arm.';
const DRAFT_PARAGRAPH =
  'Measure the distance from your eyes to the panel and adjust the arm until the top of the screen sits just below eye level. ';

function buildDraftBody(): string {
  const section = DRAFT_PARAGRAPH.repeat(8).trim();

  return [
    '## Quick answer',
    DRAFT_PARAGRAPH.trim(),
    '## How far should the monitor be from your eyes',
    section,
    '## Which desk depth supports that distance',
    section,
    '## When a monitor arm is the better fix',
    section,
    '## If the free fixes are not enough',
    section,
  ].join('\n\n');
}

const DRAFT_BODY = buildDraftBody();

function draftRow(overrides: Partial<FakePostRow> = {}): FakePostRow {
  return {
    id: 'draft-1',
    title: DRAFT_TITLE,
    description: DRAFT_DESCRIPTION,
    body: DRAFT_BODY,
    status: 'draft',
    review_status: 'pending',
    review_stage: null,
    pub_date: null,
    revision_count: 0,
    review_notes: null,
    ...overrides,
  };
}

function writerCompletion(body = DRAFT_BODY) {
  return {
    content: JSON.stringify({
      title: DRAFT_TITLE,
      description: DRAFT_DESCRIPTION,
      tags: ['desk-setup', 'monitors'],
      body,
      editorNotes: 'Drafted the guide from the research notes.',
    }),
    reasoning: '',
    finishReason: 'stop',
    tokensIn: 120,
    tokensOut: 480,
  };
}

function reviewerCompletion(body = DRAFT_BODY) {
  return {
    content: JSON.stringify({
      decision: 'approve',
      notes: 'Moved the reach numbers into a table.',
      revisedBody: body,
    }),
    reasoning: '',
    finishReason: 'stop',
    tokensIn: 140,
    tokensOut: 520,
  };
}

function agentFixture(
  role: AgentRecord['role'],
  overrides: Partial<AgentRecord> = {},
): AgentRecord {
  return {
    id: `agent-${role}`,
    name: role,
    role,
    prompt: `Focus for ${role}`,
    categories: [],
    model: 'deepseek-flash',
    provider: 'deepseek',
    runsPerDay: 24,
    enabled: true,
    autoPublish: role === 'reviewer',
    scheduleMode: 'daily',
    scheduleHours: [],
    systemManaged: false,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: '2026-10-13T00:00:00.000Z',
    updatedAt: '2026-10-13T00:00:00.000Z',
    ...overrides,
  };
}

const WRITER_AGENT = agentFixture('writer', { id: 'agent-writer-a', name: 'Writer A' });
const REVIEWER_AGENT = agentFixture('reviewer', {
  id: 'agent-reviewer-strict',
  name: 'Reviewer Strict',
});
const SCRAPPER_AGENT = agentFixture('scrapper');
const PLANNER_AGENT = agentFixture('planner');

beforeEach(() => {
  MODEL_CALL.mockReset();
  mocks.notify.mockClear();
  mocks.createPost.mockClear();
});

describe('shouldChainReviewRun', () => {
  const NOW = 1_800_000_000_000;

  it('chains the reviewer after a writer run that produced a draft', () => {
    expect(
      shouldChainReviewRun({
        role: 'writer',
        status: 'succeeded',
        producedDraft: true,
        signalAborted: false,
        deadline: NOW + 60_000,
        now: NOW,
      }),
    ).toBe(true);
  });

  it('chains the reviewer when the caller set no deadline', () => {
    expect(
      shouldChainReviewRun({
        role: 'writer',
        status: 'succeeded',
        producedDraft: true,
        signalAborted: false,
        deadline: undefined,
        now: NOW,
      }),
    ).toBe(true);
  });

  it('never chains a run from the reviewer itself', () => {
    expect(
      shouldChainReviewRun({
        role: 'reviewer',
        status: 'succeeded',
        producedDraft: true,
        signalAborted: false,
        deadline: undefined,
        now: NOW,
      }),
    ).toBe(false);
  });

  it('never chains when the writer produced no draft', () => {
    expect(
      shouldChainReviewRun({
        role: 'writer',
        status: 'succeeded',
        producedDraft: false,
        signalAborted: false,
        deadline: undefined,
        now: NOW,
      }),
    ).toBe(false);
  });

  it('never chains after a failed run', () => {
    expect(
      shouldChainReviewRun({
        role: 'writer',
        status: 'failed',
        producedDraft: false,
        signalAborted: false,
        deadline: undefined,
        now: NOW,
      }),
    ).toBe(false);
    expect(
      shouldChainReviewRun({
        role: 'writer',
        status: 'skipped',
        producedDraft: true,
        signalAborted: false,
        deadline: undefined,
        now: NOW,
      }),
    ).toBe(false);
  });

  it('stands down when the deadline leaves no budget for a review', () => {
    expect(
      shouldChainReviewRun({
        role: 'writer',
        status: 'succeeded',
        producedDraft: true,
        signalAborted: false,
        deadline: NOW,
        now: NOW,
      }),
    ).toBe(false);
    expect(
      shouldChainReviewRun({
        role: 'writer',
        status: 'succeeded',
        producedDraft: true,
        signalAborted: false,
        deadline: NOW + 19_000,
        now: NOW,
      }),
    ).toBe(false);
  });

  it('stands down when the caller aborted the request', () => {
    expect(
      shouldChainReviewRun({
        role: 'writer',
        status: 'succeeded',
        producedDraft: true,
        signalAborted: true,
        deadline: undefined,
        now: NOW,
      }),
    ).toBe(false);
  });
});

describe('runAgent chained review', () => {
  it('passes the deterministic preflight on the draft fixture', () => {
    expect(
      runPreflight({ title: DRAFT_TITLE, description: DRAFT_DESCRIPTION, body: DRAFT_BODY }),
    ).toEqual([]);
  });

  it('runs the reviewer once after the writer creates a draft and makes it publishable', async () => {
    const store = createRunnerDatabase({
      agents: [agentRow(WRITER_AGENT), agentRow(REVIEWER_AGENT)],
      claimableTopic: topicRow(),
      pendingDraft: draftRow(),
    });

    MODEL_CALL.mockResolvedValueOnce(writerCompletion()).mockResolvedValueOnce(
      reviewerCompletion(),
    );

    const result = await runAgent(store.database, WRITER_AGENT, { force: true });

    expect(result.status).toBe('succeeded');
    expect(countRunInserts(store)).toBe(2);
    expect(runAgentIds(store)).toEqual([WRITER_AGENT.id, REVIEWER_AGENT.id]);
    expect(MODEL_CALL).toHaveBeenCalledTimes(2);
    expect(store.runOutcomes.map((outcome) => outcome.status)).toEqual(['succeeded', 'succeeded']);
    expect(store.runOutcomes[1]?.summary).toContain(`Approved "${DRAFT_TITLE}"`);

    const postUpdates = store.writes.filter((write) => write.sql.startsWith('UPDATE posts SET'));
    const reviews = postUpdates.filter((write) => write.sql.includes('SET review_status = ?'));
    const stage = postUpdates.find((write) => write.sql.includes('SET review_stage = ?'));
    const publication = postUpdates.find((write) => write.sql.includes('SET pub_date = ?'));

    expect(reviews.map((write) => write.params[0])).toEqual(['pending', 'approved']);
    expect(reviews[1]?.params[1]).toBe(REVIEWER_AGENT.id);
    expect(stage?.params[0]).toBe('fact_check_passed');
    expect(Number.isNaN(Date.parse(String(publication?.params[0])))).toBe(false);
  });

  it('never chains a second review from the reviewer run', async () => {
    const store = createRunnerDatabase({
      agents: [agentRow(WRITER_AGENT), agentRow(REVIEWER_AGENT)],
      pendingDraft: draftRow(),
    });

    MODEL_CALL.mockResolvedValueOnce(reviewerCompletion());

    const result = await runAgent(store.database, REVIEWER_AGENT, { force: true });

    expect(result.status).toBe('succeeded');
    expect(countRunInserts(store)).toBe(1);
    expect(MODEL_CALL).toHaveBeenCalledTimes(1);
  });

  it('claims a draft that no stage has touched', async () => {
    const store = createRunnerDatabase({
      agents: [agentRow(REVIEWER_AGENT)],
      pendingDraft: draftRow(),
    });

    MODEL_CALL.mockResolvedValueOnce(reviewerCompletion());
    await runAgent(store.database, REVIEWER_AGENT, { force: true });

    const claim = store.writes.find((write) =>
      write.sql.includes("SET review_status = 'in_review'"),
    );

    expect(claim?.sql).toContain("review_stage IS NULL OR review_stage = 'qc_passed'");
  });

  it('stands down when no budget remains for the chained review', async () => {
    const store = createRunnerDatabase({
      agents: [agentRow(WRITER_AGENT), agentRow(REVIEWER_AGENT)],
      claimableTopic: topicRow(),
      pendingDraft: draftRow(),
    });

    MODEL_CALL.mockResolvedValueOnce(writerCompletion());

    const result = await runAgent(store.database, WRITER_AGENT, {
      force: true,
      deadline: Date.now(),
    });

    expect(result.status).toBe('succeeded');
    expect(countRunInserts(store)).toBe(1);
    expect(runAgentIds(store)).toEqual([WRITER_AGENT.id]);
    expect(MODEL_CALL).toHaveBeenCalledTimes(1);
  });

  it('does not chain the reviewer when the writer returns NEEDS RESEARCH', async () => {
    const store = createRunnerDatabase({
      agents: [agentRow(WRITER_AGENT), agentRow(REVIEWER_AGENT)],
      claimableTopic: topicRow(),
      pendingDraft: draftRow(),
    });

    MODEL_CALL.mockResolvedValueOnce({
      ...writerCompletion(),
      content: 'NEEDS RESEARCH: the ANSI/BIFMA seat height range is not in the notes.',
    });

    const result = await runAgent(store.database, WRITER_AGENT, { force: true });

    expect(result.status).toBe('succeeded');
    expect(result.summary).toContain('needs research');
    expect(countRunInserts(store)).toBe(1);
    expect(MODEL_CALL).toHaveBeenCalledTimes(1);
  });

  it('does not chain the reviewer when the writer run fails', async () => {
    const store = createRunnerDatabase({
      agents: [agentRow(WRITER_AGENT), agentRow(REVIEWER_AGENT)],
      claimableTopic: topicRow(),
      pendingDraft: draftRow(),
    });

    MODEL_CALL.mockRejectedValueOnce(new Error('DeepSeek returned an unreadable response.'));

    const result = await runAgent(store.database, WRITER_AGENT, { force: true });

    expect(result.status).toBe('failed');
    expect(countRunInserts(store)).toBe(1);
    expect(runAgentIds(store)).toEqual([WRITER_AGENT.id]);
    expect(MODEL_CALL).toHaveBeenCalledTimes(1);
  });
});

describe('product reference guard', () => {
  const linkedBody = `${DRAFT_BODY}

For a bright room, buy [the monitor light bar](product:light-bar) and keep it off-axis.`;

  it('strips a product reference from a writer body before it is stored', async () => {
    const store = createRunnerDatabase({
      agents: [agentRow(WRITER_AGENT)],
      claimableTopic: topicRow(),
    });

    MODEL_CALL.mockResolvedValueOnce(writerCompletion(linkedBody));

    const result = await runAgent(store.database, WRITER_AGENT, { force: true });

    expect(result.status).toBe('succeeded');
    const calls = mocks.createPost.mock.calls as unknown as Array<[{ body: string }]>;
    expect(calls[0]?.[0]?.body).not.toContain('product:');
    expect(calls[0]?.[0]?.body).toContain('the monitor light bar');
  });

  it('strips a product reference from a reviewer body before it is stored', async () => {
    const store = createRunnerDatabase({
      agents: [agentRow(REVIEWER_AGENT)],
      claimableTopic: topicRow(),
      pendingDraft: draftRow(),
    });

    MODEL_CALL.mockResolvedValueOnce(reviewerCompletion(linkedBody));

    const result = await runAgent(store.database, REVIEWER_AGENT, { force: true });

    expect(result.status).toBe('succeeded');
    const bodyWrite = store.writes.find((write) => write.sql.includes('SET body = ?'));
    expect(bodyWrite?.params[0]).not.toContain('product:');
    expect(String(bodyWrite?.params[0])).toContain('the monitor light bar');
  });
});

describe('runAgent without work', () => {
  it('fails the writer and names the Researcher when no topic is researched', async () => {
    const store = createRunnerDatabase({ agents: [], claimableTopic: null, revisionDraft: null });

    const result = await runAgent(store.database, WRITER_AGENT, { force: true });

    expect(result.status).toBe('failed');
    expect(result.error).toBe(NO_TOPIC_MESSAGE);
    expect(result.summary).toBe(`Run failed: ${NO_TOPIC_MESSAGE}`);
    expect(MODEL_CALL).not.toHaveBeenCalled();
    expect(store.runOutcomes.at(-1)).toEqual({
      status: 'failed',
      summary: `Run failed: ${NO_TOPIC_MESSAGE}`,
      error: NO_TOPIC_MESSAGE,
    });
    expect(failureNotification()?.body).toContain('Run the Researcher');
  });

  it('fails the scrapper and names the Planner when the queue is empty', async () => {
    const store = createRunnerDatabase({ agents: [], claimableTopic: null });

    const result = await runAgent(store.database, SCRAPPER_AGENT, { force: true });

    expect(result.status).toBe('failed');
    expect(result.error).toBe(NO_QUEUED_TOPIC_MESSAGE);
    expect(MODEL_CALL).not.toHaveBeenCalled();
    expect(store.runOutcomes.at(-1)?.status).toBe('failed');
    expect(failureNotification()?.body).toContain('Run the Planner');
  });

  it('fails the planner when no writer beat has a category', async () => {
    const store = createRunnerDatabase({ agents: [], plannerCategories: [] });

    const result = await runAgent(store.database, PLANNER_AGENT, { force: true });

    expect(result.status).toBe('failed');
    expect(result.error).toBe(QUEUE_FULL_MESSAGE);
    expect(MODEL_CALL).not.toHaveBeenCalled();
    expect(store.runOutcomes.at(-1)?.status).toBe('failed');
  });

  it('fails the planner when the queue already holds enough unclaimed work', async () => {
    const store = createRunnerDatabase({
      agents: [],
      plannerCategories: ['desk-setup'],
      unclaimedTopics: MAX_UNCLAIMED_TOPICS + 1,
    });

    const result = await runAgent(store.database, PLANNER_AGENT, { force: true });

    expect(result.status).toBe('failed');
    expect(result.error).toBe(QUEUE_FULL_MESSAGE);
    expect(MODEL_CALL).not.toHaveBeenCalled();
    const settingsReads = store.writes.filter((write) => write.sql.includes('FROM settings'));
    expect(settingsReads.some((write) => write.params[0] === 'search_provider')).toBe(false);
  });

  it('fails the reviewer and names the Writer when no draft is waiting', async () => {
    const store = createRunnerDatabase({ agents: [agentRow(REVIEWER_AGENT)], pendingDraft: null });

    const result = await runAgent(store.database, REVIEWER_AGENT, { force: true });

    expect(result.status).toBe('failed');
    expect(result.error).toBe(NO_DRAFT_MESSAGE);
    expect(result.summary).toBe(`Run failed: ${NO_DRAFT_MESSAGE}`);
    expect(MODEL_CALL).not.toHaveBeenCalled();
    expect(store.runOutcomes.at(-1)?.status).toBe('failed');
    expect(failureNotification()?.body).toContain('Run a Writer');
  });
});
