const MODEL_PROVIDER_FAILURE_HINTS: Record<string, string> = {
  MODEL_PROVIDER_INSUFFICIENT_BALANCE:
    'The model provider account has no balance. Top up the account to resume agent runs.',
  MODEL_PROVIDER_UNAUTHORIZED:
    'The model provider API key was rejected. Replace the key in Settings to resume agent runs.',
  MODEL_PROVIDER_KEY_MISSING:
    'No model provider API key is configured. Add one in Settings to resume agent runs.',
  MODEL_PROVIDER_RATE_LIMITED:
    'The model provider is rate limiting requests. Runs continue on the next schedule.',
};

export function isModelProviderFailureCode(code: string): boolean {
  return code in MODEL_PROVIDER_FAILURE_HINTS;
}

export function describeModelProviderFailure(code: string): string | null {
  return MODEL_PROVIDER_FAILURE_HINTS[code] ?? null;
}
