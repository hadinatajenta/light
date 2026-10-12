const MIN_KEPT_LENGTH = 200;
const LABEL_PATTERN = /^(title|description|body|tags|editornotes):/i;
const POST_BODY_LABELS = new Set(['body:', 'tags:', 'editornotes:']);

function isLabelLine(line: string): boolean {
  return LABEL_PATTERN.test(line.trim());
}

export function stripWriterEnvelope(body: string): string {
  const lines = body.split('\n');
  let index = 0;

  const skipBlankLines = (): void => {
    while (index < lines.length && lines[index].trim() === '') {
      index += 1;
    }
  };

  skipBlankLines();

  if (!/^title:/i.test((lines[index] ?? '').trim())) {
    return body;
  }

  index += 1;
  skipBlankLines();

  if (!/^description:/i.test((lines[index] ?? '').trim())) {
    return body;
  }

  index += 1;
  while (index < lines.length && lines[index].trim() !== '' && !isLabelLine(lines[index])) {
    index += 1;
  }

  skipBlankLines();

  const candidateLabel = (lines[index] ?? '').trim().toLowerCase();
  if (POST_BODY_LABELS.has(candidateLabel)) {
    index += 1;
    skipBlankLines();
  }

  const stripped = lines.slice(index).join('\n').trim();

  return stripped.length >= MIN_KEPT_LENGTH ? stripped : body;
}
