import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../errors';
import { generateImageBytes, type ImageModelBinding, isQuotaError, withRetry } from './generate';

vi.mock('../content/store', () => ({
  getPost: vi.fn(),
  updatePost: vi.fn(),
}));

vi.mock('../http', async () => {
  const httpErrors = await vi.importActual<typeof import('../errors')>('../errors');
  return { ApiError: httpErrors.ApiError };
});

const BASE64_FIXTURE = 'AAEC';

function createFailingModel(message: string): ImageModelBinding {
  return {
    run: vi.fn(async () => {
      throw new Error(message);
    }),
  };
}

function createSucceedingModel(image: string): ImageModelBinding {
  return {
    run: vi.fn(async () => ({ image })),
  };
}

describe('withRetry', () => {
  it('returns on the first success without retrying', async () => {
    const operation = vi.fn(async () => 'ok');

    await expect(withRetry(operation)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries once after a failure and returns the success', async () => {
    let callCount = 0;
    const operation = vi.fn(async () => {
      callCount += 1;
      if (callCount < 2) {
        throw new Error('transient');
      }
      return 'recovered';
    });

    await expect(withRetry(operation)).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting the attempts', async () => {
    const operation = vi.fn(async () => {
      throw new Error('permanently down');
    });

    await expect(withRetry(operation)).rejects.toThrow('permanently down');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry when the error is not retryable', async () => {
    const operation = vi.fn(async () => {
      throw new Error('do not retry');
    });

    await expect(withRetry(operation, 3, () => false)).rejects.toThrow('do not retry');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe('isQuotaError', () => {
  it('detects the Workers AI quota message', () => {
    expect(
      isQuotaError(
        new Error(
          "4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan",
        ),
      ),
    ).toBe(true);
  });

  it('does not treat a generic failure as a quota error', () => {
    expect(isQuotaError(new Error('upstream model unavailable'))).toBe(false);
  });
});

describe('generateImageBytes', () => {
  it('reports the underlying model failure', async () => {
    const model = createFailingModel('upstream model unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const error = await generateImageBytes(model, 'a calm desk scene').catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 502,
      code: 'IMAGE_GENERATION_FAILED',
      message: 'The image model could not generate an image.',
      details: { cause: 'upstream model unavailable' },
    });

    consoleError.mockRestore();
  });

  it('resolves base64 image content to bytes', async () => {
    const model = createSucceedingModel(BASE64_FIXTURE);

    const bytes = await generateImageBytes(model, 'a calm desk scene');

    expect(Array.from(bytes)).toEqual([0, 1, 2]);
  });

  it('reports a quota error without retrying', async () => {
    const model = createFailingModel(
      "4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan",
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const error = await generateImageBytes(model, 'a calm desk scene').catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: 'IMAGE_QUOTA_EXCEEDED' });
    expect(model.run).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });
});
