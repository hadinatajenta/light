export interface PaginationResult<T> {
  pageItems: T[];
  totalPages: number;
  currentPage: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export function paginateItems<T>(items: T[], page: number, pageSize: number): PaginationResult<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * pageSize;

  return {
    pageItems: items.slice(startIndex, startIndex + pageSize),
    totalPages,
    currentPage,
    hasPreviousPage: currentPage > 1,
    hasNextPage: currentPage < totalPages,
  };
}

export function buildBlogPagePath(page: number): string {
  return page <= 1 ? '/blog/' : `/blog/page/${page}/`;
}
