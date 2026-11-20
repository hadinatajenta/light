const TABLE_BLOCK_PATTERN = /<table>([\s\S]*?)<\/table>/g;
const TABLE_SCROLL_OPEN_TAG =
  '<div class="post-table-scroll" tabindex="0" role="region" aria-label="Scrollable table">';

export function wrapMarkdownTables(html: string): string {
  return html.replace(
    TABLE_BLOCK_PATTERN,
    (_match, inner: string) => `${TABLE_SCROLL_OPEN_TAG}\n<table>${inner}</table>\n</div>`,
  );
}
