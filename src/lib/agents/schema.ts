import { z } from 'astro/zod';
import { AGENT_MODELS, AGENT_ROLES, MAX_RUNS_PER_DAY, MIN_RUNS_PER_DAY } from './roles';

export const agentInputSchema = z.object({
  name: z.string().min(2).max(60),
  role: z.enum(AGENT_ROLES),
  prompt: z.string().min(1).max(8000),
  model: z.enum(AGENT_MODELS),
  runsPerDay: z.number().int().min(MIN_RUNS_PER_DAY).max(MAX_RUNS_PER_DAY),
  category: z.string().trim().max(40).nullable().optional(),
  enabled: z.boolean(),
  autoPublish: z.boolean(),
});

export const deepseekKeySchema = z.object({
  apiKey: z.string().min(10).max(200),
});
