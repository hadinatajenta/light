import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../errors';
import { generateImageBytes, type ImageModelBinding, withRetry } from './generate';

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
});
