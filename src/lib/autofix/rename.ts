/**
 * Renaming a grade or subject inside the list columns teachers carry
 * (subjects, grades, sections). Sections entries look like
 * "Subject::Grade:Section", "Grade:Section" or a bare section; JSON objects
 * may be keyed by grade.
 */

export type NameKind = 'grade' | 'subject';

/** Renames one stored token. */
export function renameToken(token: string, kind: NameKind, from: string, to: string): string {
  const trimmed = token.trim();
  if (trimmed.includes('::')) {
    const [subject, rest] = trimmed.split('::');
    const renamedSubject = kind === 'subject' && subject.trim() === from ? to : subject.trim();
    return `${renamedSubject}::${renameToken(rest, kind, from, to)}`;
  }
  if (kind === 'grade' && trimmed.includes(':')) {
    const separator = trimmed.lastIndexOf(':');
    const grade = trimmed.slice(0, separator).trim();
    return grade === from ? `${to}:${trimmed.slice(separator + 1).trim()}` : trimmed;
  }
  return trimmed === from ? to : token;
}

export function renameDeep(value: unknown, kind: NameKind, from: string, to: string): unknown {
  if (typeof value === 'string') return renameToken(value, kind, from, to);
  if (Array.isArray(value)) {
    const renamed = value.map((item) => renameDeep(item, kind, from, to));
    return renamed.every((item) => typeof item === 'string') ? [...new Set(renamed as string[])] : renamed;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const newKey = renameToken(key, kind, from, to);
      const renamed = renameDeep(entry, kind, from, to);
      result[newKey] = newKey in result && Array.isArray(result[newKey]) && Array.isArray(renamed)
        ? [...new Set([...(result[newKey] as unknown[]), ...renamed])]
        : renamed;
    }
    return result;
  }
  return value;
}

/** Renames inside a list column (JSON or legacy "a; b" text). Returns null when unchanged. */
export function renameListColumn(raw: string | null, kind: NameKind, from: string, to: string): string | null {
  if (!raw) return null;
  let next: string;
  try {
    next = JSON.stringify(renameDeep(JSON.parse(raw), kind, from, to));
  } catch {
    next = raw.split(/([;,|/])/).map((part) => (/^[;,|/]$/.test(part) ? part : renameToken(part, kind, from, to))).join('');
  }
  return next === raw ? null : next;
}
