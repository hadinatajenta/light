import { z } from 'astro/zod';
import { ApiError } from '../http';
import { type GithubConfig, getFile, putFile } from './github';

export const categorySchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(60),
  label: z.string().min(2).max(60),
  description: z.string().max(160).default(''),
});

export type Category = z.infer<typeof categorySchema>;

const CATEGORIES_PATH = 'src/data/categories.json';

export async function readCategories(
  config: GithubConfig,
): Promise<{ categories: Category[]; sha: string | null }> {
  const file = await getFile(config, CATEGORIES_PATH);

  if (!file) {
    return { categories: [], sha: null };
  }

  const parsed = z.array(categorySchema).safeParse(JSON.parse(file.content));
  if (!parsed.success) {
    throw new ApiError(500, 'CATEGORIES_INVALID', 'The categories file is malformed.');
  }

  return { categories: parsed.data, sha: file.sha };
}

export async function writeCategories(
  config: GithubConfig,
  categories: Category[],
  sha: string | null,
  message: string,
): Promise<void> {
  await putFile(
    config,
    CATEGORIES_PATH,
    `${JSON.stringify(categories, null, 2)}\n`,
    message,
    sha ?? undefined,
  );
}
