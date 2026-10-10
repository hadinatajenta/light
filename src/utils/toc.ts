export interface HeadingLike {
  depth: number;
  slug: string;
  text: string;
}

export interface TableOfContentsEntry {
  id: string;
  text: string;
  label: string;
  isSub: boolean;
}

export function buildTableOfContents(
  headings: HeadingLike[],
  maxDepth = 3,
): TableOfContentsEntry[] {
  const entries: TableOfContentsEntry[] = [];
  let sectionNumber = 0;
  let subsectionNumber = 0;

  for (const heading of headings) {
    if (heading.depth < 2 || heading.depth > maxDepth) {
      continue;
    }

    if (heading.depth === 2) {
      sectionNumber += 1;
      subsectionNumber = 0;
      entries.push({
        id: heading.slug,
        text: heading.text,
        label: String(sectionNumber).padStart(2, '0'),
        isSub: false,
      });
      continue;
    }

    if (sectionNumber === 0) {
      continue;
    }

    subsectionNumber += 1;
    entries.push({
      id: heading.slug,
      text: heading.text,
      label: `${sectionNumber}.${subsectionNumber}`,
      isSub: true,
    });
  }

  return entries;
}
