const TABLE_BLOCK_PATTERN = /<table>([\s\S]*?)<\/table>/g;

export function wrapMarkdownTables(html: string): string {
  return html.replace(
    TABLE_BLOCK_PATTERN,
    (_match, inner: string) =>
      `<div class="post-table-scroll" tabindex="0">\n<table>${inner}</table>\n</div>`,
  );
}
