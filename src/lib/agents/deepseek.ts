import { ApiError } from '../errors';

const BASE_URL = 'https://api.deepseek.com';
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_TOKENS = 8192;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  effort?: 'low' | 'high' | 'max';
  userId?: string;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ChatResponse {
  content: string;
  reasoning: string;
  tokensIn: number;
  tokensOut: number;
}

interface DeepseekUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface DeepseekChoice {
  message?: {
    content?: string | null;
    reasoning_content?: string | null;
  };
}

interface DeepseekCompletion {
  choices?: DeepseekChoice[];
  usage?: DeepseekUsage;
}

function parseJsonBody(text: string): DeepseekCompletion {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');

  if (start < 0) {
    throw new ApiError(502, 'DEEPSEEK_BAD_RESPONSE', 'DeepSeek returned an empty response.');
  }

  try {
    return JSON.parse(trimmed.slice(start)) as DeepseekCompletion;
  } catch {
    throw new ApiError(502, 'DEEPSEEK_BAD_RESPONSE', 'DeepSeek returned an unreadable response.');
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  const trimmed = text.trim();
  if (!trimmed) {
    return `DeepSeek responded with status ${response.status}.`;
  }

  return trimmed.slice(0, 300);
}

function toStatusError(response: Response, detail: string): ApiError {
  if (response.status === 401) {
    return new ApiError(401, 'DEEPSEEK_UNAUTHORIZED', 'The DeepSeek API key was rejected.');
  }

  if (response.status === 402) {
    return new ApiError(
      402,
      'DEEPSEEK_INSUFFICIENT_BALANCE',
      'The DeepSeek account has no balance.',
    );
  }

  if (response.status === 429) {
    return new ApiError(429, 'DEEPSEEK_RATE_LIMITED', 'DeepSeek rate limit reached.', {
      retryAfter: response.headers.get('Retry-After'),
    });
  }

  return new ApiError(502, 'DEEPSEEK_ERROR', detail);
}

function withTimeout(request: ChatRequest): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const cancel = (): void => clearTimeout(timeoutId);

  if (request.signal) {
    if (request.signal.aborted) {
      controller.abort();
    } else {
      request.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  return { signal: controller.signal, cancel };
}

export async function createChatCompletion(request: ChatRequest): Promise<ChatResponse> {
  const { signal, cancel } = withTimeout(request);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: false,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        reasoning_effort: request.effort ?? 'high',
        thinking: { type: 'enabled' },
        ...(request.userId ? { user_id: request.userId } : {}),
        ...(request.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal,
    });
  } catch (error) {
    cancel();
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(504, 'DEEPSEEK_TIMEOUT', 'The DeepSeek request timed out.');
    }
    throw new ApiError(502, 'DEEPSEEK_UNREACHABLE', 'Could not reach the DeepSeek API.');
  }

  cancel();

  if (!response.ok) {
    throw toStatusError(response, await readErrorDetail(response));
  }

  const payload = parseJsonBody(await response.text());
  const choice = payload.choices?.[0]?.message;

  return {
    content: choice?.content ?? '',
    reasoning: choice?.reasoning_content ?? '',
    tokensIn: payload.usage?.prompt_tokens ?? 0,
    tokensOut: payload.usage?.completion_tokens ?? 0,
  };
}

export async function verifyApiKey(apiKey: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError(502, 'DEEPSEEK_UNREACHABLE', 'Could not reach the DeepSeek API.');
  }

  if (!response.ok) {
    throw toStatusError(response, await readErrorDetail(response));
  }
}

export function extractJsonObject(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');

  if (start < 0 || end <= start) {
    throw new ApiError(502, 'MODEL_OUTPUT_INVALID', 'The model did not return a JSON object.');
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new ApiError(502, 'MODEL_OUTPUT_INVALID', 'The model returned invalid JSON.');
  }
}
