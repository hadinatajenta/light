import {
  countWords,
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  extractHeadings,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
} from '../seo/audit';
import { findTopicMatchIssues, type TopicMatchReference } from './topic-match';

export interface PreflightIssue {
  code: string;
  message: string;
}

export interface PreflightDraft {
  title: string;
  description: string;
  body: string;
}

const MIN_BODY_WORDS = 600;
const MIN_H2_HEADINGS = 3;
const PLACEHOLDER_TOKENS = ['lorem ipsum', 'todo', 'tbd', '[insert', 'placeholder', 'xxx'];

function findPlaceholderTokens(body: string): string[] {
  const lowered = body.toLowerCase();

  return PLACEHOLDER_TOKENS.filter((token) => lowered.includes(token));
}

export function runPreflight(draft: PreflightDraft, topic?: TopicMatchReference): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const title = draft.title.trim();
  const description = draft.description.trim();
  const headings = extractHeadings(draft.body);
  const wordCount = countWords(draft.body);
  const h2Count = headings.filter((heading) => heading.depth === 2).length;
  const hasH1 = headings.some((heading) => heading.depth === 1);
  const placeholderTokens = findPlaceholderTokens(draft.body);

  if (title.length < TITLE_MIN_LENGTH || title.length > TITLE_MAX_LENGTH) {
    issues.push({
      code: 'TITLE_LENGTH',
      message: `Title must be ${TITLE_MIN_LENGTH} to ${TITLE_MAX_LENGTH} characters; it is ${title.length}.`,
    });
  }

  if (description.length < DESCRIPTION_MIN_LENGTH || description.length > DESCRIPTION_MAX_LENGTH) {
    issues.push({
      code: 'DESCRIPTION_LENGTH',
      message: `Description must be ${DESCRIPTION_MIN_LENGTH} to ${DESCRIPTION_MAX_LENGTH} characters; it is ${description.length}.`,
    });
  }

  if (wordCount < MIN_BODY_WORDS) {
    issues.push({
      code: 'BODY_WORD_COUNT',
      message: `Body must be at least ${MIN_BODY_WORDS} words; it has ${wordCount}.`,
    });
  }

  if (hasH1) {
    issues.push({
      code: 'BODY_HAS_H1',
      message: 'Body must not contain an H1 heading; the title is the only H1.',
    });
  }

  if (h2Count < MIN_H2_HEADINGS) {
    issues.push({
      code: 'BODY_H2_COUNT',
      message: `Body must contain at least ${MIN_H2_HEADINGS} H2 headings; it has ${h2Count}.`,
    });
  }

  if (placeholderTokens.length > 0) {
    issues.push({
      code: 'PLACEHOLDER_TEXT',
      message: `Body contains placeholder text: ${placeholderTokens.join(', ')}.`,
    });
  }

  if (topic) {
    for (const mismatch of findTopicMatchIssues(draft, topic)) {
      issues.push({ code: mismatch.code, message: mismatch.message });
    }
  }

  return issues;
}

export function formatPreflightIssues(issues: PreflightIssue[]): string {
  return issues.map((issue) => `- ${issue.message}`).join('\n');
}
