import { describe, expect, it } from 'vitest';
import { countWords } from '../seo/audit';
import {
  formatPreflightIssues,
  type PreflightDraft,
  type PreflightIssue,
  runPreflight,
} from './preflight';
import { type AgentRole, sortAgentsByRoleOrder } from './roles';
import type { AgentRecord } from './store';

const VALID_TITLE = 'Choosing an Office Chair That Fits Your Desk';
const VALID_DESCRIPTION =
  'A practical guide to choosing a home office chair that stays comfortable through long working days.';
const SECTION_TITLES = ['Sizing the chair', 'Setting the height', 'Checking the warranty'];
const PLACEHOLDER_TOKENS = ['lorem ipsum', 'TODO', 'TBD', '[insert', 'Placeholder', 'xxx'];

function buildBody(totalWords: number, sectionTitles: string[] = SECTION_TITLES): string {
  const headings = sectionTitles.map((title) => `## ${title}`).join('\n\n');
  const fillerWords = Math.max(totalWords - countWords(headings), 0);
  const filler = Array.from({ length: fillerWords }, () => 'word').join(' ');

  return `${headings}\n\n${filler}`;
}

function buildDraft(overrides: Partial<PreflightDraft> = {}): PreflightDraft {
  return {
    title: VALID_TITLE,
    description: VALID_DESCRIPTION,
    body: buildBody(600),
    ...overrides,
  };
}

function codes(issues: PreflightIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

function buildAgent(id: string, role: AgentRole): AgentRecord {
  return {
    id,
    name: id,
    role,
    prompt: `Focus for ${id}`,
    categories: [],
    model: 'deepseek-flash',
    runsPerDay: 1,
    enabled: true,
    autoPublish: false,
    scheduleMode: 'daily',
    scheduleHours: [],
    systemManaged: false,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('runPreflight', () => {
  it('returns no issues for a publishable draft', () => {
    expect(countWords(buildBody(600))).toBe(600);
    expect(runPreflight(buildDraft())).toEqual([]);
  });

  it('requires a title between 10 and 70 characters', () => {
    expect(codes(runPreflight(buildDraft({ title: 'Chairs' })))).toEqual(['TITLE_LENGTH']);
    expect(codes(runPreflight(buildDraft({ title: '' })))).toEqual(['TITLE_LENGTH']);
    expect(
      codes(runPreflight(buildDraft({ title: `${VALID_TITLE} for Very Small Home Offices` }))),
    ).toEqual(['TITLE_LENGTH']);
  });

  it('requires a description between 50 and 160 characters', () => {
    expect(codes(runPreflight(buildDraft({ description: 'Too short.' })))).toEqual([
      'DESCRIPTION_LENGTH',
    ]);
    expect(
      codes(runPreflight(buildDraft({ description: `${VALID_DESCRIPTION} ${VALID_DESCRIPTION}` }))),
    ).toEqual(['DESCRIPTION_LENGTH']);
  });

  it('requires at least 600 body words', () => {
    expect(codes(runPreflight(buildDraft({ body: buildBody(599) })))).toEqual(['BODY_WORD_COUNT']);
    expect(runPreflight(buildDraft({ body: buildBody(600) }))).toEqual([]);
  });

  it('flags a body that is missing entirely', () => {
    expect(codes(runPreflight(buildDraft({ body: '' })))).toEqual([
      'BODY_WORD_COUNT',
      'BODY_H2_COUNT',
    ]);
  });

  it('flags an H1 heading in the body', () => {
    const body = buildBody(600, [...SECTION_TITLES, 'Reading the fine print']).replace(
      '## Reading the fine print',
      '# Reading the fine print',
    );

    expect(codes(runPreflight(buildDraft({ body })))).toEqual(['BODY_HAS_H1']);
  });

  it('requires at least three H2 headings', () => {
    expect(
      codes(runPreflight(buildDraft({ body: buildBody(600, SECTION_TITLES.slice(0, 2)) }))),
    ).toEqual(['BODY_H2_COUNT']);
  });

  it.each(PLACEHOLDER_TOKENS)('flags the placeholder token "%s"', (token) => {
    const body = `${buildBody(600)}\n\nA closing line mentioning ${token}.`;

    expect(codes(runPreflight(buildDraft({ body })))).toEqual(['PLACEHOLDER_TEXT']);
  });

  it('reports every issue in a stable order', () => {
    expect(codes(runPreflight({ title: '', description: '', body: '' }))).toEqual([
      'TITLE_LENGTH',
      'DESCRIPTION_LENGTH',
      'BODY_WORD_COUNT',
      'BODY_H2_COUNT',
    ]);
  });
});

describe('formatPreflightIssues', () => {
  it('renders one dash line per message', () => {
    const formatted = formatPreflightIssues([
      { code: 'TITLE_LENGTH', message: 'Title must be 10 to 70 characters; it is 6.' },
      { code: 'BODY_HAS_H1', message: 'Body must not contain an H1 heading.' },
    ]);

    expect(formatted).toBe(
      '- Title must be 10 to 70 characters; it is 6.\n- Body must not contain an H1 heading.',
    );
  });

  it('renders an empty issue list as an empty string', () => {
    expect(formatPreflightIssues([])).toBe('');
  });
});

describe('sortAgentsByRoleOrder', () => {
  it('orders agents as scrapper, writer, qc, reviewer', () => {
    const agents = [
      buildAgent('reviewer-one', 'reviewer'),
      buildAgent('qc-one', 'qc'),
      buildAgent('writer-one', 'writer'),
      buildAgent('scrapper-one', 'scrapper'),
    ];

    expect(sortAgentsByRoleOrder(agents).map((agent) => agent.id)).toEqual([
      'scrapper-one',
      'writer-one',
      'qc-one',
      'reviewer-one',
    ]);
  });

  it('keeps the input order within a role', () => {
    const agents = [
      buildAgent('writer-two', 'writer'),
      buildAgent('writer-one', 'writer'),
      buildAgent('qc-one', 'qc'),
    ];

    expect(sortAgentsByRoleOrder(agents).map((agent) => agent.id)).toEqual([
      'writer-two',
      'writer-one',
      'qc-one',
    ]);
  });

  it('keeps unknown roles last in their relative order', () => {
    const agents = [
      { ...buildAgent('legacy-one', 'writer'), role: 'editor' },
      buildAgent('writer-one', 'writer'),
      { ...buildAgent('legacy-two', 'writer'), role: 'editor' },
      buildAgent('reviewer-one', 'reviewer'),
    ];

    expect(sortAgentsByRoleOrder(agents).map((agent) => agent.id)).toEqual([
      'writer-one',
      'reviewer-one',
      'legacy-one',
      'legacy-two',
    ]);
  });

  it('does not mutate the input list', () => {
    const agents = [buildAgent('reviewer-one', 'reviewer'), buildAgent('writer-one', 'writer')];
    const inputSnapshot = [...agents];

    sortAgentsByRoleOrder(agents);

    expect(agents).toEqual(inputSnapshot);
  });
});
