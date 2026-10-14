import { z } from 'astro/zod';
import {
  DEFAULT_MODEL_PROVIDER,
  isModelAvailableForProvider,
  MODEL_PROVIDER_IDS,
  MODEL_PROVIDERS,
} from './model-providers';
import { AGENT_ROLES, AGENT_SCHEDULE_MODES, MAX_RUNS_PER_DAY, MIN_RUNS_PER_DAY } from './roles';
import { MAX_SCHEDULE_HOURS } from './schedule-hours';

export const agentInputSchema = z
  .object({
    name: z.string().min(2).max(60),
    role: z.enum(AGENT_ROLES),
    prompt: z.string().min(1).max(8000),
    provider: z.enum(MODEL_PROVIDER_IDS).default(DEFAULT_MODEL_PROVIDER),
    model: z.string().min(1).max(80),
    runsPerDay: z.number().int().min(MIN_RUNS_PER_DAY).max(MAX_RUNS_PER_DAY),
    categories: z.array(z.string().trim().min(1).max(40)).max(6).optional(),
    enabled: z.boolean(),
    autoPublish: z.boolean(),
    scheduleMode: z.enum(AGENT_SCHEDULE_MODES).optional(),
    scheduleHours: z.array(z.number().int().min(0).max(23)).max(MAX_SCHEDULE_HOURS).optional(),
  })
  .superRefine((input, context) => {
    if (!isModelAvailableForProvider(input.provider, input.model)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['model'],
        message: `Model "${input.model}" is not offered by ${MODEL_PROVIDERS[input.provider].label}.`,
      });
    }
  });

export const modelProviderKeySchema = z.object({
  provider: z.enum(MODEL_PROVIDER_IDS),
  apiKey: z.string().min(10).max(200),
});
