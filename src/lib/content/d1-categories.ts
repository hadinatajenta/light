import { ApiError } from '../http';
import type { Category } from './category-store';

interface CategoryRow {
  slug: string;
  label: string;
  description: string;
  post_count: number;
}

export interface CategoryWithCount extends Category {
  postCount: number;
}

export function createD1CategoryStore(db: D1Database) {
  async function requireSlug(slug: string): Promise<void> {
    const row = await db.prepare('SELECT slug FROM categories WHERE slug = ?').bind(slug).first();
    if (!row) {
      throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'That category does not exist.');
    }
  }

  return {
    async listCategories(): Promise<CategoryWithCount[]> {
      const result = await db
        .prepare(
          `SELECT c.slug, c.label, c.description, COUNT(p.id) AS post_count
           FROM categories c
           LEFT JOIN posts p ON p.category = c.slug
           GROUP BY c.slug, c.label, c.description
           ORDER BY c.rowid`,
        )
        .all<CategoryRow>();

      return (result.results ?? []).map((row) => ({
        slug: row.slug,
        label: row.label,
        description: row.description,
        postCount: row.post_count,
      }));
    },

    async createCategory(input: Category): Promise<Category> {
      const existing = await db
        .prepare('SELECT slug FROM categories WHERE slug = ?')
        .bind(input.slug)
        .first();

      if (existing) {
        throw new ApiError(409, 'CATEGORY_EXISTS', 'A category with that slug already exists.');
      }

      await db
        .prepare('INSERT INTO categories (slug, label, description) VALUES (?, ?, ?)')
        .bind(input.slug, input.label, input.description)
        .run();

      return input;
    },

    async updateCategory(slug: string, input: Category): Promise<Category> {
      await requireSlug(slug);

      if (input.slug !== slug) {
        const taken = await db
          .prepare('SELECT slug FROM categories WHERE slug = ?')
          .bind(input.slug)
          .first();

        if (taken) {
          throw new ApiError(409, 'CATEGORY_EXISTS', 'A category with that slug already exists.');
        }
      }

      await db
        .prepare('UPDATE categories SET slug = ?, label = ?, description = ? WHERE slug = ?')
        .bind(input.slug, input.label, input.description, slug)
        .run();

      if (input.slug !== slug) {
        await db
          .prepare('UPDATE posts SET category = ? WHERE category = ?')
          .bind(input.slug, slug)
          .run();
      }

      return input;
    },

    async deleteCategory(slug: string): Promise<void> {
      await requireSlug(slug);

      const inUse = await db
        .prepare('SELECT COUNT(*) AS total FROM posts WHERE category = ?')
        .bind(slug)
        .first<{ total: number }>();
      const total = inUse?.total ?? 0;

      if (total > 0) {
        throw new ApiError(409, 'CATEGORY_IN_USE', `Reassign the ${total} post(s) first.`);
      }

      await db.prepare('DELETE FROM categories WHERE slug = ?').bind(slug).run();
    },
  };
}

export type D1CategoryStore = ReturnType<typeof createD1CategoryStore>;
