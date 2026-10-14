import { ApiError } from '../errors';
import {
  getModelProvider,
  type ModelProviderDefinition,
  type ModelProviderId,
} from './model-providers';

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_TOKENS = 8192;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  provider: ModelProviderId;
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
  finishReason: string | null;
  tokensIn: number;
  tokensOut: number;
}

interface CompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface CompletionChoice {
  message?: {
    content?: string | null;
    reasoning_content?: string | null;
  };
  finish_reason?: unknown;
}

interface CompletionPayload {
  choices?: CompletionChoice[];
  usage?: CompletionUsage;
}

function requireProvider(providerId: string): ModelProviderDefinition {
  const provider = getModelProvider(providerId);

  if (!provider) {
    throw new ApiError(422, 'MODEL_PROVIDER_UNKNOWN', `Unknown model provider "${providerId}".`);
  }

  return provider;
}

function parseJsonBody(text: string, provider: ModelProviderDefinition): CompletionPayload {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');

  if (start < 0) {
    throw new ApiError(
      502,
      'MODEL_PROVIDER_BAD_RESPONSE',
      `${provider.label} returned an empty response.`,
    );
  }

  try {
    return JSON.parse(trimmed.slice(start)) as CompletionPayload;
  } catch {
    throw new ApiError(
      502,
      'MODEL_PROVIDER_BAD_RESPONSE',
      `${provider.label} returned an unreadable response.`,
    );
  }
}

async function readErrorDetail(
  response: Response,
  provider: ModelProviderDefinition,
): Promise<string> {
  const text = await response.text().catch(() => '');
  const trimmed = text.trim();

  if (!trimmed) {
    return `${provider.label} responded with status ${response.status}.`;
  }

  return trimmed.slice(0, 300);
}

function toStatusError(
  response: Response,
  detail: string,
  provider: ModelProviderDefinition,
): ApiError {
  if (response.status === 401 || response.status === 403) {
    return new ApiError(
      401,
      'MODEL_PROVIDER_UNAUTHORIZED',
      `The ${provider.label} API key was rejected.`,
    );
  }

  if (response.status === 402) {
    return new ApiError(
      402,
      'MODEL_PROVIDER_INSUFFICIENT_BALANCE',
      `The ${provider.label} account has no balance.`,
    );
  }

  if (response.status === 429) {
    return new ApiError(
      429,
      'MODEL_PROVIDER_RATE_LIMITED',
      `${provider.label} is rate limiting requests.`,
      {
        retryAfter: response.headers.get('Retry-After'),
      },
    );
  }

  return new ApiError(502, 'MODEL_PROVIDER_ERROR', detail);
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

const EMPTY_COMPLETION_ATTEMPTS = 2;
const EMPTY_COMPLETION_RETRY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildRequestBody(
  request: ChatRequest,
  provider: ModelProviderDefinition,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
    stream: false,
    max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
  };

  if (provider.capabilities.supportsReasoningEffort) {
    body.reasoning_effort = request.effort ?? 'high';
  }

  if (provider.capabilities.supportsThinking) {
    body.thinking = { type: 'enabled' };
  }

  if (provider.capabilities.supportsUserId && request.userId) {
    body.user_id = request.userId;
  }

  if (provider.capabilities.supportsJsonMode && request.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  return body;
}

async function performChatCompletion(
  request: ChatRequest,
  provider: ModelProviderDefinition,
  signal: AbortSignal,
): Promise<ChatResponse> {
  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRequestBody(request, provider)),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(504, 'MODEL_PROVIDER_TIMEOUT', `The ${provider.label} request timed out.`);
    }
    throw new ApiError(
      502,
      'MODEL_PROVIDER_UNREACHABLE',
      `Could not reach the ${provider.label} API.`,
    );
  }

  if (!response.ok) {
    throw toStatusError(response, await readErrorDetail(response, provider), provider);
  }

  const payload = parseJsonBody(await response.text(), provider);
  const finishReason = payload.choices?.[0]?.finish_reason;

  return {
    content: payload.choices?.[0]?.message?.content ?? '',
    reasoning: payload.choices?.[0]?.message?.reasoning_content ?? '',
    finishReason: typeof finishReason === 'string' ? finishReason : null,
    tokensIn: payload.usage?.prompt_tokens ?? 0,
    tokensOut: payload.usage?.completion_tokens ?? 0,
  };
}

export function isEmptyCompletion(completion: ChatResponse): boolean {
  return completion.content.trim() === '' && completion.reasoning.trim() === '';
}

export async function createChatCompletion(request: ChatRequest): Promise<ChatResponse> {
  const provider = requireProvider(request.provider);
  let lastCompletion: ChatResponse | null = null;

  for (let attempt = 1; attempt <= EMPTY_COMPLETION_ATTEMPTS; attempt += 1) {
    const { signal, cancel } = withTimeout(request);

    try {
      lastCompletion = await performChatCompletion(request, provider, signal);

      if (!isEmptyCompletion(lastCompletion)) {
        return lastCompletion;
      }
    } finally {
      cancel();
    }

    if (attempt < EMPTY_COMPLETION_ATTEMPTS) {
      await delay(EMPTY_COMPLETION_RETRY_MS);
    }
  }

  return lastCompletion as ChatResponse;
}

export async function verifyProviderKey(providerId: string, apiKey: string): Promise<void> {
  const provider = requireProvider(providerId);

  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError(
      502,
      'MODEL_PROVIDER_UNREACHABLE',
      `Could not reach the ${provider.label} API.`,
    );
  }

  if (!response.ok) {
    throw toStatusError(response, await readErrorDetail(response, provider), provider);
  }
}

export function extractJsonObject(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  const snippet = trimmed.slice(0, 200);

  if (start < 0 || end <= start) {
    throw new ApiError(502, 'MODEL_OUTPUT_INVALID', 'The model did not return a JSON object.', {
      snippet,
      length: trimmed.length,
    });
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new ApiError(502, 'MODEL_OUTPUT_INVALID', 'The model returned invalid JSON.', {
      snippet,
      length: trimmed.length,
    });
  }
}
