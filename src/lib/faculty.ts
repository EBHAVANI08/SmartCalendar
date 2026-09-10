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

/** Expand grade ranges like "Grade 1 to Grade 5", "Grade 6 to 12", "1-5" into individual grades. */
export function expandGradeRange(value: unknown): string[] | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/^(?:grade|class|std\.?|standard)?\s*(\d{1,2})\s*(?:to|-)\s*(?:grade|class|std\.?|standard)?\s*(\d{1,2})$/i);
  if (match) {
    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);
    if (start <= end && start >= 1 && end <= 12) {
      const grades: string[] = [];
      for (let i = start; i <= end; i++) {
        grades.push(`Grade ${i}`);
      }
      return grades;
    }
  }
  return null;
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
 * Parse any teacher sections input string (human formatted, bracketed, colon separated, or raw list)
 * into a normalized list of section strings suitable for storage and parsing.
 *
 * Supported formats:
 * - Simple: "A, B" -> ["A", "B"]
 * - Grade-wise: "Grade 1 (A, B); Grade 2 (A)" or "Grade 1: A, B; Grade 2: A" -> ["Grade 1:A", "Grade 1:B", "Grade 2:A"]
 * - Subject-wise: "Mathematics: Grade 9 (A, B); Science: Grade 10 (A, C)" -> ["Mathematics::Grade 9:A", "Mathematics::Grade 9:B", "Science::Grade 10:A", "Science::Grade 10:C"]
 * - Serialized: "Mathematics::Grade 9:A, Mathematics::Grade 9:B" -> unchanged
 */
export function parseSectionsInput(raw: unknown, subjects: string[] = [], fallbackGrades: string[] = []): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  const str = String(raw).trim();
  if (!str) return [];

  // If JSON array string
  if (str.startsWith('[') && str.endsWith(']')) {
    try {
      const arr = JSON.parse(str);
      if (Array.isArray(arr)) {
        return arr.map((s) => String(s).trim()).filter(Boolean);
      }
    } catch {}
  }

  // If already serialized with '::'
  if (str.includes('::')) {
    return str
      .split(/[;,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const result: string[] = [];
  const cleanSubjects = subjects && subjects.length > 0 ? subjects : ['General'];
  const semicolonBlocks = str.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);

  let parsedAnyStructured = false;

  for (const block of semicolonBlocks) {
    let targetSubj: string | null = null;
    let content = block;

    for (const subj of cleanSubjects) {
      const escaped = subj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const prefixRegex = new RegExp('^' + escaped + '\\s*:\\s*', 'i');
      if (prefixRegex.test(content)) {
        targetSubj = subj;
        content = content.replace(prefixRegex, '').trim();
        break;
      }
    }

    const gradeBracketRegex = /(?:(Grade\s*\d{1,2}|Class\s*\d{1,2}|[A-Za-z0-9\s.-]+?)\s*\(([^)]+)\))/gi;
    let m: RegExpExecArray | null;
    let foundInBlock = false;
    while ((m = gradeBracketRegex.exec(content)) !== null) {
      foundInBlock = true;
      parsedAnyStructured = true;
      const rawG = m[1].trim();
      const gNorm = normalizeGrade(rawG) || rawG.replace(/^(grade|class|std\.?|standard)\s*/i, 'Grade ');
      const secs = m[2]
        .split(/[;,]+/)
        .map((s) => s.trim().toUpperCase().replace(/^SECTION\s*/i, ''))
        .filter(Boolean);
      for (const sec of secs) {
        if (targetSubj) {
          result.push(`${targetSubj}::${gNorm}:${sec}`);
        } else {
          result.push(`${gNorm}:${sec}`);
        }
      }
    }
    if (foundInBlock) {
      continue;
    }

    const colonMatch = content.match(/^(Grade\s*\d{1,2}|Class\s*\d{1,2})\s*:\s*([A-Za-z0-9,\s]+)$/i);
    if (colonMatch) {
      parsedAnyStructured = true;
      const gNorm = normalizeGrade(colonMatch[1]) || colonMatch[1].trim().replace(/^(grade|class|std\.?|standard)\s*/i, 'Grade ');
      const secs = colonMatch[2]
        .split(/[;,]+/)
        .map((s) => s.trim().toUpperCase().replace(/^SECTION\s*/i, ''))
        .filter(Boolean);
      for (const sec of secs) {
        if (targetSubj) {
          result.push(`${targetSubj}::${gNorm}:${sec}`);
        } else {
          result.push(`${gNorm}:${sec}`);
        }
      }
      continue;
    }
  }

  if (!parsedAnyStructured) {
    return str
      .split(/[;,]+/)
      .map((s) => s.trim().toUpperCase().replace(/^SECTION\s*/i, ''))
      .filter(Boolean);
  }

  return result;
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
    const range = expandGradeRange(candidate);
    if (range) {
      grades.push(...range);
      continue;
    }
    const normalized = normalizeGrade(candidate);
    if (normalized) grades.push(normalized);
    else push('grades', 'GRADE_INVALID', `"${candidate}" is not a recognisable grade.`, candidate);
  }

  const sections = parseSectionsInput(raw.sections, subjects, grades);

  if (issues.length) return { ok: false, issues };

  return {
    ok: true,
    issues: [],
    record: {
      name,
      email,
      employeeId,
      phone: String(raw.phone ?? '').trim() || null,
      subjects: Array.from(new Set(subjects)),
      grades: Array.from(new Set(grades)),
      sections: Array.from(new Set(sections)),
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
    if (parsed && typeof parsed === 'object') {
      const res: string[] = [];
      for (const [grade, secs] of Object.entries(parsed)) {
        const secList = Array.isArray(secs) ? secs : [secs];
        for (const s of secList) {
          const cleanSec = String(s).trim().toUpperCase().replace(/^SECTION\s*/i, '');
          if (cleanSec) res.push(`${grade.trim()}:${cleanSec}`);
        }
      }
      return res;
    }
  } catch {
    // Fall through to delimiter parsing for legacy plain-text values.
  }
  return parseList(text);
}

export type SubjectGradeMapping = Record<string, {
  grades: string[];
  sections: Record<string, string[]>;
}>;

/**
 * Check if a teacher's assigned sections include a specific (grade, section, subject?).
 *
 * Supports:
 * 1. Subject-and-grade-specific entries: "Subject::Grade:Section" (e.g. "Mathematics::Grade 9:A")
 * 2. Grade-specific section entries: "Grade 1:A", "Grade 2:B" (applies to all subjects)
 * 3. Unscoped generic section entries: "A", "B" (applies to all grades of teacher)
 * 4. JSON grade-map object: { "Grade 1": ["A", "B"], "Grade 2": ["A"] }
 * 5. Empty/null sections: teacher is not restricted by section, can teach all sections.
 */
export function teacherTeachesSection(
  rawSections: unknown,
  grade: string,
  section: string,
  subject?: string
): boolean {
  if (!rawSections) return true;

  const targetGrade = grade.trim().toLowerCase();
  const targetGradeNum = targetGrade.replace(/[^0-9]/g, '');
  const targetSec = section.trim().toUpperCase().replace(/^SECTION\s*/i, '');
  const targetSubject = subject ? subject.trim().toLowerCase() : undefined;

  // 1. If it's a JSON object format directly
  if (typeof rawSections === 'object' && !Array.isArray(rawSections)) {
    const map = rawSections as Record<string, unknown>;
    for (const [gKey, val] of Object.entries(map)) {
      const cleanG = gKey.trim().toLowerCase();
      const gNum = cleanG.replace(/[^0-9]/g, '');
      if (cleanG === targetGrade || (targetGradeNum && gNum === targetGradeNum)) {
        const secList = Array.isArray(val) ? val : [val];
        return secList.some((s) => String(s).trim().toUpperCase().replace(/^SECTION\s*/i, '') === targetSec);
      }
    }
    return Object.keys(map).length === 0;
  }

  // 2. Parse into list
  const list = readList(rawSections);
  if (list.length === 0) return true;

  let hasSubjectScopedEntries = false;
  let hasSubjectEntriesForTargetSubject = false;
  let hasSubjectGradeEntriesForTarget = false;

  let hasGradeSpecificEntriesForThisGrade = false;
  let hasAnyGradeSpecificEntries = false;

  for (const item of list) {
    const trimmed = String(item).trim();
    if (trimmed.includes('::')) {
      hasSubjectScopedEntries = true;
      const [subjPart, rest] = trimmed.split('::');
      const cleanSubj = subjPart.trim().toLowerCase();
      const isSubjMatch =
        targetSubject &&
        (cleanSubj === targetSubject || cleanSubj.replace(/\s+/g, '') === targetSubject.replace(/\s+/g, ''));

      if (isSubjMatch) {
        hasSubjectEntriesForTargetSubject = true;
        if (rest && rest.includes(':')) {
          const [gPart, sPart] = rest.split(':');
          const cleanG = gPart.trim().toLowerCase();
          const gNum = cleanG.replace(/[^0-9]/g, '');
          if (cleanG === targetGrade || (targetGradeNum && gNum === targetGradeNum)) {
            hasSubjectGradeEntriesForTarget = true;
            const cleanS = sPart.trim().toUpperCase().replace(/^SECTION\s*/i, '');
            if (cleanS === targetSec) return true;
          }
        }
      } else if (!targetSubject) {
        // If no subject was specified, check if teacher teaches this grade & section in ANY subject
        if (rest && rest.includes(':')) {
          const [gPart, sPart] = rest.split(':');
          const cleanG = gPart.trim().toLowerCase();
          const gNum = cleanG.replace(/[^0-9]/g, '');
          if (cleanG === targetGrade || (targetGradeNum && gNum === targetGradeNum)) {
            const cleanS = sPart.trim().toUpperCase().replace(/^SECTION\s*/i, '');
            if (cleanS === targetSec) return true;
          }
        }
      }
    } else if (trimmed.includes(':')) {
      // Legacy Grade-specific entry: "Grade:Section"
      hasAnyGradeSpecificEntries = true;
      const [gPart, sPart] = trimmed.split(':');
      const cleanG = gPart.trim().toLowerCase();
      const gNum = cleanG.replace(/[^0-9]/g, '');
      if (cleanG === targetGrade || (targetGradeNum && gNum === targetGradeNum)) {
        hasGradeSpecificEntriesForThisGrade = true;
        const cleanS = sPart.trim().toUpperCase().replace(/^SECTION\s*/i, '');
        if (cleanS === targetSec) return true;
      }
    } else {
      // Unscoped section (e.g. "A", "B")
      const cleanS = trimmed.toUpperCase().replace(/^SECTION\s*/i, '');
      if (cleanS === targetSec) return true;
    }
  }

  // If subject was provided and teacher has subject-scoped entries:
  if (targetSubject && hasSubjectScopedEntries) {
    if (hasSubjectGradeEntriesForTarget) {
      return false; // specified section did not match
    }
    if (hasSubjectEntriesForTargetSubject) {
      return false; // teacher has this subject, but not for this grade
    }
    // teacher has subject-scoped entries for other subjects, but not for targetSubject
    return false;
  }

  if (hasGradeSpecificEntriesForThisGrade) {
    return false;
  }

  if (hasAnyGradeSpecificEntries) {
    return false;
  }

  return false;
}

/**
 * Parse raw teacher sections into a per-subject-and-grade map.
 */
export function parseSubjectGradeSectionsMap(
  rawSections: unknown,
  subjects: string[],
  fallbackGrades: string[] = [],
  defaultSectionsMap?: Record<string, string[]>
): SubjectGradeMapping {
  const result: SubjectGradeMapping = {};

  for (const subj of subjects) {
    result[subj] = {
      grades: [],
      sections: {},
    };
  }

  if (subjects.length === 0) {
    return result;
  }

  const list = parseSectionsInput(rawSections, subjects, fallbackGrades);
  let hasAnySubjectScoped = false;
  let hasAnyGradeScoped = false;

  for (const item of list) {
    const trimmed = String(item).trim();
    if (!trimmed) continue;

    if (trimmed.includes('::')) {
      hasAnySubjectScoped = true;
      const [subjPart, rest] = trimmed.split('::');
      const cleanSubj = subjPart.trim();
      const targetSubj = subjects.find(
        (s) => s.toLowerCase() === cleanSubj.toLowerCase() || s.replace(/\s+/g, '') === cleanSubj.replace(/\s+/g, '')
      );
      if (targetSubj && rest && rest.includes(':')) {
        const [gPart, sPart] = rest.split(':');
        const cleanG = gPart.trim();
        const cleanS = sPart.trim().toUpperCase().replace(/^SECTION\s*/i, '');
        if (!result[targetSubj].grades.includes(cleanG)) {
          result[targetSubj].grades.push(cleanG);
        }
        if (!result[targetSubj].sections[cleanG]) {
          result[targetSubj].sections[cleanG] = [];
        }
        if (cleanS && !result[targetSubj].sections[cleanG].includes(cleanS)) {
          result[targetSubj].sections[cleanG].push(cleanS);
        }
      }
    } else if (trimmed.includes(':')) {
      hasAnyGradeScoped = true;
      const [gPart, sPart] = trimmed.split(':');
      const cleanG = gPart.trim();
      const cleanS = sPart.trim().toUpperCase().replace(/^SECTION\s*/i, '');
      for (const subj of subjects) {
        if (!result[subj].grades.includes(cleanG)) {
          result[subj].grades.push(cleanG);
        }
        if (!result[subj].sections[cleanG]) {
          result[subj].sections[cleanG] = [];
        }
        if (cleanS && !result[subj].sections[cleanG].includes(cleanS)) {
          result[subj].sections[cleanG].push(cleanS);
        }
      }
    }
  }

  // If no subject-scoped or grade-scoped entries found, initialize with fallbackGrades
  if (!hasAnySubjectScoped && !hasAnyGradeScoped) {
    const unscopedSecs = list
      .map((s) => s.trim().toUpperCase().replace(/^SECTION\s*/i, ''))
      .filter((s) => s && !s.includes(':'));

    const effectiveGrades = fallbackGrades.length > 0 ? fallbackGrades : ['Grade 1'];
    for (const subj of subjects) {
      result[subj].grades = [...effectiveGrades];
      for (const g of effectiveGrades) {
        const defaultSecs = defaultSectionsMap?.[g] || ['A'];
        result[subj].sections[g] = unscopedSecs.length > 0 ? [...unscopedSecs] : [...defaultSecs];
      }
    }
  }

  // Sort grades and default missing sections for all configured grades
  for (const subj of subjects) {
    result[subj].grades.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
      if (numA !== numB) return numA - numB;
      return a.localeCompare(b);
    });
    for (const g of result[subj].grades) {
      if (!result[subj].sections[g] || result[subj].sections[g].length === 0) {
        result[subj].sections[g] = defaultSectionsMap?.[g] ? [...defaultSectionsMap[g]] : ['A'];
      }
    }
  }

  return result;
}

/**
 * Serialize a per-subject-and-grade mapping into array of "Subject::Grade:Section" strings.
 */
export function serializeSubjectGradeSectionsMap(mapping: SubjectGradeMapping): string[] {
  const result: string[] = [];
  for (const [subj, data] of Object.entries(mapping)) {
    const cleanSubj = subj.trim();
    if (!cleanSubj || !data || !Array.isArray(data.grades)) continue;
    for (const grade of data.grades) {
      const cleanGrade = grade.trim();
      const secs = data.sections[grade] || [];
      for (const sec of secs) {
        const cleanSec = String(sec).trim().toUpperCase().replace(/^SECTION\s*/i, '');
        if (cleanSec) {
          result.push(`${cleanSubj}::${cleanGrade}:${cleanSec}`);
        }
      }
    }
  }
  return result;
}

/**
 * Cleanly format teacher qualifications (subject-wise grades & sections) for UI cards and summaries.
 */
export function formatTeacherQualifications(
  gradesJson?: string,
  sectionsJson?: string,
  subjectsJson?: string,
  defaultSubj?: string
): string {
  const subs = readList(subjectsJson || defaultSubj);
  const grs = readList(gradesJson);
  if (grs.length === 0) return 'All Grades';
  if (!sectionsJson) return grs.join(', ');

  const map = parseSubjectGradeSectionsMap(sectionsJson, subs.length > 0 ? subs : ['General'], grs);
  const parts: string[] = [];

  for (const [subj, data] of Object.entries(map)) {
    if (!data.grades || data.grades.length === 0) continue;
    const gradeParts = data.grades.map((g) => {
      const secs = data.sections[g];
      return secs && secs.length > 0 ? `${g} (${secs.join(', ')})` : g;
    });
    if (subs.length > 1) {
      parts.push(`${subj}: ${gradeParts.join(', ')}`);
    } else {
      parts.push(gradeParts.join(', '));
    }
  }

  if (parts.length > 0) return parts.join(' • ');
  return grs.join(', ');
}

/**
 * Parse raw teacher sections into a per-grade map { [grade]: string[] } (legacy/unscoped view).
 */
export function parseGradeSectionsMap(
  rawSections: unknown,
  grades: string[],
  defaultSectionsMap?: Record<string, string[]>
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const g of grades) {
    result[g] = [];
  }

  if (!rawSections) {
    for (const g of grades) {
      result[g] = defaultSectionsMap?.[g] ? [...defaultSectionsMap[g]] : ['A'];
    }
    return result;
  }

  // 1. If it's a JSON object
  let parsedObj: Record<string, unknown> | null = null;
  if (typeof rawSections === 'object' && !Array.isArray(rawSections)) {
    parsedObj = rawSections as Record<string, unknown>;
  } else if (typeof rawSections === 'string' && rawSections.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawSections);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsedObj = parsed;
      }
    } catch {}
  }

  if (parsedObj) {
    for (const g of grades) {
      const targetG = g.trim().toLowerCase();
      let matchedList: string[] = [];
      for (const [key, val] of Object.entries(parsedObj)) {
        if (key.trim().toLowerCase() === targetG || key.replace(/\D/g, '') === targetG.replace(/\D/g, '')) {
          matchedList = Array.isArray(val) ? val.map(String) : [String(val)];
          break;
        }
      }
      result[g] = matchedList.map((s) => s.trim().toUpperCase().replace(/^SECTION\s*/i, '')).filter(Boolean);
    }
    return result;
  }

  // 2. If it's an array or string list
  const list = readList(rawSections);
  let hasAnyScoped = false;
  for (const item of list) {
    let cleanItem = String(item).trim();
    // If it has Subject::Grade:Section, strip Subject:: for grade-level parsing
    if (cleanItem.includes('::')) {
      cleanItem = cleanItem.split('::')[1] || '';
    }
    if (cleanItem.includes(':')) {
      hasAnyScoped = true;
      const [gPart, sPart] = cleanItem.split(':');
      const cleanG = gPart.trim();
      const cleanGNum = cleanG.replace(/\D/g, '');
      const sec = sPart.trim().toUpperCase().replace(/^SECTION\s*/i, '');
      for (const g of grades) {
        if (g.toLowerCase() === cleanG.toLowerCase() || (cleanGNum && g.replace(/\D/g, '') === cleanGNum)) {
          if (!result[g].includes(sec)) {
            result[g].push(sec);
          }
        }
      }
    }
  }

  if (!hasAnyScoped && list.length > 0) {
    const cleanSecs = list.map((s) => s.trim().toUpperCase().replace(/^SECTION\s*/i, '')).filter(Boolean);
    for (const g of grades) {
      result[g] = [...cleanSecs];
    }
  }

  // If a grade had no sections populated, default to available sections
  for (const g of grades) {
    if (result[g].length === 0) {
      result[g] = defaultSectionsMap?.[g] ? [...defaultSectionsMap[g]] : ['A'];
    }
  }

  return result;
}

/**
 * Serialize a per-grade sections map { [grade]: string[] } into an array of "Grade:Section" strings.
 */
export function serializeGradeSectionsMap(map: Record<string, string[]>): string[] {
  const result: string[] = [];
  for (const [grade, secs] of Object.entries(map)) {
    if (!Array.isArray(secs)) continue;
    for (const s of secs) {
      const cleanSec = String(s).trim().toUpperCase().replace(/^SECTION\s*/i, '');
      if (cleanSec) {
        result.push(`${grade.trim()}:${cleanSec}`);
      }
    }
  }
  return result;
}

