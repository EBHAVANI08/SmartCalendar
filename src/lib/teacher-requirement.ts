/**
 * Whether a subject's lessons need a teacher (GradeSubjectConfig.teacherRequirement).
 * "required": every lesson has a teacher; "optional": a qualified free teacher
 * if there is one, otherwise none; "none": never a teacher and no room (e.g. a
 * free period).
 */
export type TeacherRequirement = 'required' | 'optional' | 'none';

/** GradeSubjectConfig.teacherRequirement as stored; anything unknown or unset means "required". */
export function teacherRequirementOf(value: string | null | undefined): TeacherRequirement {
  return value === 'optional' || value === 'none' ? value : 'required';
}
