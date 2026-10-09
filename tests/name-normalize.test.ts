// npm run test:setup  (node --import tsx --test tests/*.test.ts)
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSubjects, findSameGrade, gradeKey, parseRoman, subjectKey } from '../src/lib/name-normalize';

test('grade keys ignore prefix, case, spacing and numeral style', () => {
  assert.equal(gradeKey('Grade I'), gradeKey('Grade 1'));
  assert.equal(gradeKey('class XII'), gradeKey('12'));
  assert.equal(gradeKey(' grade 10 '), gradeKey('Grade 10'));
  assert.equal(gradeKey('U.K.G.'), gradeKey('ukg'));
  assert.notEqual(gradeKey('Grade 1'), gradeKey('Grade 11'));
  assert.equal(findSameGrade('Grade I', ['Grade 2', 'Grade 1']), 'Grade 1');
});

test('roman parsing is strict', () => {
  assert.equal(parseRoman('IV'), 4);
  assert.equal(parseRoman('IIII'), null);
  assert.equal(parseRoman('VX'), null);
  assert.equal(parseRoman('Art'), null);
});

test('subject comparison classes', () => {
  assert.equal(subjectKey('computer Science'), subjectKey('Computer  Science'));
  assert.equal(compareSubjects('computer Science', 'Computer Science'), 'exact');
  assert.equal(compareSubjects('Maths & Stats', 'Maths and Stats'), 'exact');
  assert.equal(compareSubjects('EVS', 'Environmental Studies (EVS)'), 'alias');
  assert.equal(compareSubjects('Art', 'Art & Craft'), 'similar');
  // A descriptive bracket stays part of the name: related, never the same subject.
  assert.equal(compareSubjects('Science', 'Science (Practical)'), 'similar');
  assert.equal(compareSubjects('Physics', 'Chemistry'), null);
  // A shared last word does not make two subjects related.
  assert.equal(compareSubjects('Science', 'Social Science'), null);
  assert.equal(compareSubjects('Science', 'Computer Science'), null);
  // Initials and one-letter spelling variants are suggestions, never automatic.
  assert.equal(compareSubjects('VE', 'Value Education'), 'alias');
  assert.equal(compareSubjects('Ve', 'Value Education'), null);
  assert.equal(compareSubjects('Kaushal Bodh', 'Koushal Bodh'), 'spelling');
  assert.equal(compareSubjects('Biology', 'Geology'), null);
  assert.equal(compareSubjects('Music', 'Magic'), null);
});

test('section scoping matches Roman and Arabic grade names', async () => {
  const { teacherTeachesSection } = await import('../src/lib/faculty');
  const sections = JSON.stringify(['English::Grade I:SECTION-X', 'Maths::Grade 2:SECTION-Y']);
  assert.equal(teacherTeachesSection(sections, 'Grade 1', 'SECTION-X', 'English'), true);
  assert.equal(teacherTeachesSection(sections, 'Grade II', 'SECTION-Y', 'Maths'), true);
  assert.equal(teacherTeachesSection(sections, 'Grade 1', 'SECTION-Y', 'English'), false);
  assert.equal(teacherTeachesSection(sections, 'Grade 11', 'SECTION-X', 'English'), false);
});
