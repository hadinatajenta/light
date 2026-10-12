const DEEPSEEK_FAILURE_HINTS: Record<string, string> = {
  DEEPSEEK_INSUFFICIENT_BALANCE:
    'The DeepSeek account has no balance. Top up the account to resume agent runs.',
  DEEPSEEK_UNAUTHORIZED:
    'The DeepSeek API key was rejected. Replace the key in Settings to resume agent runs.',
  DEEPSEEK_KEY_MISSING:
    'No DeepSeek API key is configured. Add one in Settings to resume agent runs.',
  DEEPSEEK_RATE_LIMITED:
    'The DeepSeek API is rate limiting requests. Runs continue on the next schedule.',
};

export function isDeepseekFailureCode(code: string): boolean {
  return code in DEEPSEEK_FAILURE_HINTS;
}

export function describeDeepseekFailure(code: string): string | null {
  return DEEPSEEK_FAILURE_HINTS[code] ?? null;
}
