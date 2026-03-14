export function normalizeTags(tags: unknown): string {
  if (Array.isArray(tags)) {
    return joinUniqueTags(tags);
  }

  if (typeof tags !== 'string') {
    return '';
  }

  return joinUniqueTags(tags.split(/[,\n，]/));
}

export function parseTagList(tags: string): string[] {
  if (!tags) {
    return [];
  }

  return tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function joinUniqueTags(values: unknown[]): string {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].join(',');
}
