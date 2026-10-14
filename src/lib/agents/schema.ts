import { z } from 'astro/zod';
import {
  AGENT_MODELS,
  AGENT_ROLES,
  AGENT_SCHEDULE_MODES,
  MAX_RUNS_PER_DAY,
  MIN_RUNS_PER_DAY,
} from './roles';
import { MAX_SCHEDULE_HOURS } from './schedule-hours';

export const agentInputSchema = z.object({
  name: z.string().min(2).max(60),
  role: z.enum(AGENT_ROLES),
  prompt: z.string().min(1).max(8000),
  model: z.enum(AGENT_MODELS),
  runsPerDay: z.number().int().min(MIN_RUNS_PER_DAY).max(MAX_RUNS_PER_DAY),
  categories: z.array(z.string().trim().min(1).max(40)).max(6).optional(),
  enabled: z.boolean(),
  autoPublish: z.boolean(),
  scheduleMode: z.enum(AGENT_SCHEDULE_MODES).optional(),
  scheduleHours: z.array(z.number().int().min(0).max(23)).max(MAX_SCHEDULE_HOURS).optional(),
});

export const deepseekKeySchema = z.object({
  apiKey: z.string().min(10).max(200),
});
