/**
 * Faculty identity, parsing and validation.
 *
 * One teacher is one record. Subjects, grades and sections are lists on that
 * record - a teacher who picks up another subject or grade is edited, never
 * duplicated. Every write path (manual create, edit, bulk import) validates
 * through here so a malformed row cannot reach the database.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface FacultyRecord {
  name: string;
  email: string | null;
  employeeId: string | null;
  phone: string | null;
  subjects: string[];
  grades: string[];
  sections: string[];
}

export type IssueCode =
  | 'NAME_MISSING'
  | 'NAME_TOO_SHORT'
  | 'NAME_LOOKS_LIKE_EMAIL'
  | 'NAME_NOT_TEXT'
  | 'EMAIL_INVALID'
  | 'EMPLOYEE_ID_INVALID'
  | 'SUBJECT_MISSING'
  | 'SUBJECT_LOOKS_LIKE_EMAIL'
  | 'SUBJECT_NOT_TEXT'
  | 'SUBJECT_LOOKS_NUMERIC'
  | 'GRADE_INVALID'
  | 'DUPLICATE_IN_FILE'
  | 'DUPLICATE_EMPLOYEE_ID'
  | 'DUPLICATE_EMAIL'
  | 'DUPLICATE_IDENTITY';

export interface RowIssue {
  row: number;
  field: string;
  code: IssueCode;
  message: string;
  value?: string;
}

/**
 * Control characters and the Unicode replacement character. Their presence
 * means raw bytes were decoded as text - e.g. an .xlsx (a ZIP archive) read
 * with file.text() and split as CSV.
 */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/;

/** Characters real names and subjects are made of, across the scripts in use. */
const READABLE_CHARS = /[\u0020-\u007E\u00A0-\u024F\u0900-\u097F\u0A80-\u0AFF\u0C80-\u0CFF]/g;

export function looksLikeEmail(value: unknown): boolean {
  const text = String(value ?? '').trim();
  return text.includes('@') && /\S+@\S+/.test(text);
}

export function looksLikeBinary(value: unknown): boolean {
  const text = String(value ?? '');
  if (!text.trim()) return false;
  if (CONTROL_CHARS.test(text)) return true;
  // A mostly-unreadable string is decoded binary, not a person's name.
  const readable = text.match(READABLE_CHARS)?.length ?? 0;
  return readable / text.length < 0.7;
}

/** Split a cell holding several values: "Physics; Maths" or "Physics, Maths". */
export function parseList(value: unknown): string[] {
  const text = String(value ?? '').trim();
  if (!text) return [];
  return text
    .split(/[;,|/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const ROMAN: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6,
  vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12,
};

/** "8", "grade 8", "Class 8" and "VIII" all normalise to "Grade 8". */
export function normalizeGrade(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/^(grade|class|std\.?|standard)\s*/i, '').trim();

  const numeric = cleaned.match(/^(\d{1,2})/);
  if (numeric) {
    const n = Number(numeric[1]);
    return n >= 1 && n <= 12 ? `Grade ${n}` : null;
  }
  const roman = ROMAN[cleaned.toLowerCase()];
  if (roman) return `Grade ${roman}`;

  // Named levels such as "Nursery" or "LKG" are kept verbatim.
  return /^[A-Za-z][A-Za-z\s.-]{1,24}$/.test(cleaned) ? cleaned : null;
}

/** Identity key for "is this the same person?" within one school. */
export function normalizeName(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/^(dr|mr|mrs|ms|miss|prof|smt|shri)\.?\s+/i, '')
    .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeEmail(value: unknown): string | null {
  const text = String(value ?? '').trim().toLowerCase();
  return text ? text : null;
}

export function normalizeEmployeeId(value: unknown): string | null {
  const text = String(value ?? '').trim().toUpperCase();
  return text ? text : null;
}

export interface ValidationResult {
  ok: boolean;
  record?: FacultyRecord;
  issues: RowIssue[];
}

/**
 * Validate one faculty row. Returns every problem found rather than the first,
 * so the importer can show a complete list instead of failing a row at a time.
 */
export function validateFacultyRow(
  raw: {
    name?: unknown;
    email?: unknown;
    employeeId?: unknown;
    phone?: unknown;
    subjects?: unknown;
    grades?: unknown;
    sections?: unknown;
  },
  row: number
): ValidationResult {
  const issues: RowIssue[] = [];
  const push = (field: string, code: IssueCode, message: string, value?: unknown) =>
    issues.push({
      row,
      field,
      code,
      message,
      value: value === undefined ? undefined : String(value),
    });

  // -- Name --
  const name = String(raw.name ?? '').trim();
  if (!name) {
    push('name', 'NAME_MISSING', 'Teacher name is required.');
  } else if (looksLikeBinary(name)) {
    push(
      'name',
      'NAME_NOT_TEXT',
      'Name contains unreadable characters - the file was probably not parsed as the format it actually is.',
      name.slice(0, 20)
    );
  } else if (looksLikeEmail(name)) {
    push(
      'name',
      'NAME_LOOKS_LIKE_EMAIL',
      `"${name}" is an email address, not a name. The columns look shifted.`,
      name
    );
  } else if (name.length < 2) {
    push('name', 'NAME_TOO_SHORT', 'Teacher name must be at least 2 characters.', name);
  }

  // -- Email (optional, but must be a real address when present) --
  const email = normalizeEmail(raw.email);
  if (email && !EMAIL_PATTERN.test(email)) {
    push('email', 'EMAIL_INVALID', `"${email}" is not a valid email address.`, email);
  }

  // -- Employee ID (optional) --
  const employeeId = normalizeEmployeeId(raw.employeeId);
  if (employeeId && !/^[A-Z0-9][A-Z0-9._/-]{0,31}$/.test(employeeId)) {
    push('employeeId', 'EMPLOYEE_ID_INVALID', `"${employeeId}" is not a valid employee ID.`, employeeId);
  }

  // -- Subjects: the column most often misaligned --
  const subjects = parseList(raw.subjects);
  if (!subjects.length) {
    push('subjects', 'SUBJECT_MISSING', 'At least one subject is required.');
  }
  for (const subject of subjects) {
    if (looksLikeEmail(subject)) {
      push(
        'subjects',
        'SUBJECT_LOOKS_LIKE_EMAIL',
        `"${subject}" is an email address, not a subject. Check the column order.`,
        subject
      );
    } else if (looksLikeBinary(subject)) {
      push('subjects', 'SUBJECT_NOT_TEXT', 'Subject contains unreadable characters.', subject.slice(0, 20));
    } else if (/^\d+$/.test(subject)) {
      push('subjects', 'SUBJECT_LOOKS_NUMERIC', `"${subject}" is a number, not a subject name.`, subject);
    }
  }

  // -- Grades --
  const grades: string[] = [];
  for (const candidate of parseList(raw.grades)) {
    const normalized = normalizeGrade(candidate);
    if (normalized) grades.push(normalized);
    else push('grades', 'GRADE_INVALID', `"${candidate}" is not a recognisable grade.`, candidate);
  }

  const sections = parseList(raw.sections);

  if (issues.length) return { ok: false, issues };

  return {
    ok: true,
    issues: [],
    record: {
      name,
      email,
      employeeId,
      phone: String(raw.phone ?? '').trim() || null,
      subjects: [...new Set(subjects)],
      grades: [...new Set(grades)],
      sections: [...new Set(sections)],
    },
  };
}

export interface ExistingFaculty {
  id: string;
  name: string;
  email: string | null;
  employeeId?: string | null;
}

export interface DuplicateMatch {
  id: string;
  name: string;
  matchedOn: 'employeeId' | 'email' | 'name';
}

/**
 * Find the existing faculty member this record refers to.
 *
 * Priority: employee ID, then email, then normalised name within the school.
 * A match is not an error in itself - it means "edit that person instead of
 * creating a second row for them".
 */
export function findDuplicate(
  record: Pick<FacultyRecord, 'name' | 'email' | 'employeeId'>,
  existing: ExistingFaculty[]
): DuplicateMatch | null {
  if (record.employeeId) {
    const byId = existing.find(
      (e) => e.employeeId && normalizeEmployeeId(e.employeeId) === record.employeeId
    );
    if (byId) return { id: byId.id, name: byId.name, matchedOn: 'employeeId' };
  }

  if (record.email) {
    const byEmail = existing.find((e) => normalizeEmail(e.email) === record.email);
    if (byEmail) return { id: byEmail.id, name: byEmail.name, matchedOn: 'email' };
  }

  const key = normalizeName(record.name);
  if (key) {
    const byName = existing.find((e) => normalizeName(e.name) === key);
    if (byName) return { id: byName.id, name: byName.name, matchedOn: 'name' };
  }

  return null;
}

export const DUPLICATE_MESSAGE =
  'Faculty already exists. Edit the existing faculty profile to add more grades or subjects.';

/** Merge incoming subjects/grades into an existing list without losing any. */
export function mergeLists(existing: string[], incoming: string[]): string[] {
  const seen = new Map<string, string>();
  for (const value of [...existing, ...incoming]) {
    const key = value.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, value.trim());
  }
  return [...seen.values()];
}

/** Tolerant read of the JSON-string list columns on Teacher. */
export function readList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  const text = String(value ?? '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
  } catch {
    // Fall through to delimiter parsing for legacy plain-text values.
  }
  return parseList(text);
}
