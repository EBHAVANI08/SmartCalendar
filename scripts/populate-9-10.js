const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function populate9and10() {
  const schoolIds = ['60d5ecb8b5c9c22340000001', '6a90282671483239cb9b9cfe'];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  for (const schoolId of schoolIds) {
    const teachers = await db.teacher.findMany({ where: { schoolId, role: { not: 'inactive' } } });
    if (teachers.length === 0) continue;

    const findT = (nameSubstr, subjSubstr) => {
      let t = teachers.find(x => x.name.toLowerCase().includes(nameSubstr.toLowerCase()));
      if (!t && subjSubstr) {
        t = teachers.find(x => (x.subject || '').toLowerCase().includes(subjSubstr.toLowerCase()) || (x.subjects || '').toLowerCase().includes(subjSubstr.toLowerCase()));
      }
      return t || teachers[0];
    };

    const mathT = findT('Archana', 'Math');
    const engT = findT('Kranti', 'English');
    const sciT = findT('Raviraj', 'Science');
    const sstT = findT('Hemlata', 'Social');
    const hindiT = findT('Jayashri', 'Hindi');
    const compT = findT('Amit', 'Computer');
    const peT = findT('Vaishali', 'Physical');
    const marathiT = findT('Dipali', 'Marathi');

    const classes = [
      { grade: 'Grade 9', section: 'A' },
      { grade: 'Grade 9', section: 'B' },
      { grade: 'Grade 10', section: 'A' },
      { grade: 'Grade 10', section: 'B' },
    ];

    const curriculum = [
      { subject: 'Mathematics', teacher: mathT },
      { subject: 'Science', teacher: sciT },
      { subject: 'English', teacher: engT },
      { subject: 'Social Science', teacher: sstT },
      { subject: 'Hindi', teacher: hindiT },
      { subject: 'Computer Science', teacher: compT },
      { subject: 'Marathi', teacher: marathiT },
      { subject: 'Physical Education', teacher: peT },
    ];

    // Find all versions for this school
    const versions = await db.timetableVersion.findMany({ where: { schoolId } });
    const versionIds = [null, ...versions.map(v => v.id)];

    for (const vId of versionIds) {
      for (let cIdx = 0; cIdx < classes.length; cIdx++) {
        const { grade, section } = classes[cIdx];
        await db.schedule.deleteMany({
          where: {
            schoolId,
            grade,
            section,
            ...(vId ? { timetableVersionId: vId } : { OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] })
          }
        });

        const records = [];
        for (let dIdx = 0; dIdx < days.length; dIdx++) {
          const day = days[dIdx];
          const pCount = day === 'Saturday' ? 5 : 8;

          for (let p = 1; p <= pCount; p++) {
            const itemIdx = (cIdx * 2 + dIdx + p - 1) % curriculum.length;
            const { subject, teacher } = curriculum[itemIdx];

            records.push({
              schoolId,
              timetableVersionId: vId,
              grade,
              section,
              day,
              period: p,
              subject,
              teacherId: teacher ? teacher.id : null,
              startTime: p === 1 ? '08:00' : p === 2 ? '08:40' : p === 3 ? '09:35' : p === 4 ? '10:15' : p === 5 ? '11:25' : p === 6 ? '12:05' : p === 7 ? '12:45' : '13:25',
              endTime: p === 1 ? '08:40' : p === 2 ? '09:20' : p === 3 ? '10:15' : p === 4 ? '10:55' : p === 5 ? '12:05' : p === 6 ? '12:45' : p === 7 ? '13:25' : '14:05',
              roomId: subject === 'Science' ? 'Lab-1' : subject === 'Computer Science' ? 'CS-Lab' : subject === 'Physical Education' ? 'Ground' : 'R-' + grade.replace('Grade ', '') + section,
            });
          }
        }

        await db.schedule.createMany({ data: records });
        console.log(`Created ${records.length} slots for ${grade} ${section} (versionId: ${vId}) in school ${schoolId}`);
      }
    }
  }

  console.log('Successfully populated 9th and 10th timetable schedules across all versions!');
  process.exit(0);
}

populate9and10().catch(e => { console.error(e); process.exit(1); });

