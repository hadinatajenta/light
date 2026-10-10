export const AGENT_ROLES = ['writer', 'reviewer', 'qc', 'scrapper'] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export const AGENT_MODELS = ['deepseek-flash', 'deepseek-v4-pro'] as const;

export type AgentModel = (typeof AGENT_MODELS)[number];

export const DEFAULT_AGENT_MODEL: AgentModel = 'deepseek-flash';

export const MAX_AGENTS = 6;

export const MIN_RUNS_PER_DAY = 1;

export const MAX_RUNS_PER_DAY = 24;

export interface AgentRoleDefinition {
  id: AgentRole;
  label: string;
  description: string;
  defaultEffort: 'low' | 'high' | 'max';
  canAutoPublish: boolean;
  defaultPrompt: string;
}

export const AGENT_ROLE_DEFINITIONS: Record<AgentRole, AgentRoleDefinition> = {
  writer: {
    id: 'writer',
    label: 'Writer',
    description: 'Drafts a new buying guide from the topic you describe in the prompt.',
    defaultEffort: 'high',
    canAutoPublish: false,
    defaultPrompt:
      'Write a practical buying guide for the topic below. Aim for 900 to 1400 words of markdown with an H1-free body (start at H2), a short intro, at least four H2 sections, and one actionable checklist. Never invent specifications, prices, or test results. Prefer plain prose over lists except in the checklist. Do not use em dashes.\n\nTopic: ',
  },
  reviewer: {
    id: 'reviewer',
    label: 'Reviewer',
    description: 'Reviews the oldest pending draft, approves it, or requests changes.',
    defaultEffort: 'high',
    canAutoPublish: true,
    defaultPrompt:
      'Review the draft below as a careful editor. Check factual caution (no invented specs or prices), structure, clarity, and that it answers the topic. Approve only when it is publishable as is. Return the full revised markdown when you request changes.\n\nReview focus: ',
  },
  qc: {
    id: 'qc',
    label: 'QC',
    description: 'Audits the oldest pending draft for formatting, SEO fields, and policy issues.',
    defaultEffort: 'high',
    canAutoPublish: false,
    defaultPrompt:
      'Audit the draft below. Check title length (10 to 70 characters), description length (50 to 160 characters), heading structure, word count, presence of placeholder text, and any claim that looks unverifiable. Report every issue you find with a short reason.\n\nExtra checks: ',
  },
  scrapper: {
    id: 'scrapper',
    label: 'Scrapper',
    description: 'Collects research notes for a topic so writers have source material.',
    defaultEffort: 'low',
    canAutoPublish: false,
    defaultPrompt:
      'Produce concise research notes for the topic below. List what a buyer should verify, which specification numbers matter, and the common marketing claims that mislead. Do not fetch or invent specific product data.\n\nTopic: ',
  },
};

export function isAgentRole(value: string): value is AgentRole {
  return (AGENT_ROLES as readonly string[]).includes(value);
}

export function isAgentModel(value: string): value is AgentModel {
  return (AGENT_MODELS as readonly string[]).includes(value);
}

export function getRoleDefinition(role: AgentRole): AgentRoleDefinition {
  return AGENT_ROLE_DEFINITIONS[role];
}
