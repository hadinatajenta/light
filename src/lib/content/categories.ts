import { ApiError } from '../http';
import { type Category, readCategories, writeCategories } from './category-store';
import { getGithubConfig } from './config';
import { type CategoryWithCount, createD1CategoryStore } from './d1-categories';
import { resolveContentDatabase } from './database';
import { listPosts } from './store';

export async function listCategories(): Promise<CategoryWithCount[]> {
  const database = await resolveContentDatabase();
  if (database) {
    return createD1CategoryStore(database).listCategories();
  }

  const config = getGithubConfig();
  const { categories } = await readCategories(config);
  const posts = await listPosts();

  return categories.map((category) => ({
    ...category,
    createdAt: null,
    postCount: posts.filter((post) => post.category === category.slug).length,
  }));
}

export async function createCategory(input: Category): Promise<Category> {
  const database = await resolveContentDatabase();
  if (database) {
    return createD1CategoryStore(database).createCategory(input);
  }

  const config = getGithubConfig();
  const { categories, sha } = await readCategories(config);

  if (categories.some((category) => category.slug === input.slug)) {
    throw new ApiError(409, 'CATEGORY_EXISTS', 'A category with that slug already exists.');
  }

  await writeCategories(
    config,
    [...categories, input],
    sha,
    `feat(content): add category ${input.slug}`,
  );

  return input;
}

export async function updateCategory(slug: string, input: Category): Promise<Category> {
  const database = await resolveContentDatabase();
  if (database) {
    return createD1CategoryStore(database).updateCategory(slug, input);
  }

  const config = getGithubConfig();
  const { categories, sha } = await readCategories(config);
  const index = categories.findIndex((category) => category.slug === slug);

  if (index === -1) {
    throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'That category does not exist.');
  }

  const next = [...categories];
  next[index] = input;

  await writeCategories(config, next, sha, `feat(content): update category ${slug}`);

  return input;
}

export async function deleteCategory(slug: string): Promise<void> {
  const database = await resolveContentDatabase();
  if (database) {
    await createD1CategoryStore(database).deleteCategory(slug);
    return;
  }

  const config = getGithubConfig();
  const { categories, sha } = await readCategories(config);

  if (!categories.some((category) => category.slug === slug)) {
    throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'That category does not exist.');
  }

  const posts = await listPosts();
  const inUse = posts.filter((post) => post.category === slug).length;

  if (inUse > 0) {
    throw new ApiError(409, 'CATEGORY_IN_USE', `Reassign the ${inUse} post(s) first.`);
  }

  await writeCategories(
    config,
    categories.filter((category) => category.slug !== slug),
    sha,
    `chore(content): remove category ${slug}`,
  );
}

export type { CategoryWithCount } from './d1-categories';
