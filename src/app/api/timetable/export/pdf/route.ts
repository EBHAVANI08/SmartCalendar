import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveSchoolId } from '@/lib/school-helper';

/**
 * GET /api/timetable/export/pdf
 * Generates an ultra-crisp, printer-ready HTML/PDF printable view for Classrooms and Faculty.
 * Query: ?grade=Grade 10&section=A&schoolId=DPS2025 (or ?teacherId=... or ?type=master)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const grade = searchParams.get('grade') || 'Grade 10';
    const section = searchParams.get('section') || 'A';
    const teacherId = searchParams.get('teacherId');
    const rawSchoolId = searchParams.get('schoolId');
    const schoolId = await resolveSchoolId(rawSchoolId);

    const school = schoolId ? await db.school.findUnique({ where: { id: schoolId } }) : await db.school.findFirst();
    const schoolName = school?.name || 'Delhi Public School';
    const schoolCode = school?.code || 'DPS2025';

    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

    // Fetch schedules
    let schedules: any[] = [];
    let title = '';
    let subtitle = '';

    if (teacherId) {
      const teacher = await db.teacher.findUnique({ where: { id: teacherId } });
      schedules = await db.schedule.findMany({
        where: { teacherId, ...(schoolId ? { schoolId } : {}) },
        include: { teacher: true },
        orderBy: [{ day: 'asc' }, { period: 'asc' }],
      });
      title = `Faculty Master Schedule: ${teacher?.name || 'Teacher'}`;
      subtitle = `Department: ${teacher?.subject || 'All Subjects'} | Academic Year 2025–2026`;
    } else {
      schedules = await db.schedule.findMany({
        where: {
          grade: { in: [grade, grade.replace('Grade ', '')] },
          section: { equals: section, mode: 'insensitive' },
          ...(schoolId ? { schoolId } : {}),
        },
        include: { teacher: true },
        orderBy: [{ day: 'asc' }, { period: 'asc' }],
      });
      title = `Class Timetable: ${grade} - Section ${section}`;
      subtitle = `Affiliated with CBSE / NEP Framework | Academic Year 2025–2026`;
    }

    // Build schedule matrix: day -> period -> schedule item
    const matrix: Record<string, Record<number, any>> = {};
    for (const d of DAYS) {
      matrix[d] = {};
    }

    for (const s of schedules) {
      if (matrix[s.day]) {
        matrix[s.day][s.period] = s;
      }
    }

    // Generate Printer-Ready HTML
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${schoolName}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 12mm 15mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1a202c;
      background: #ffffff;
      margin: 0;
      padding: 20px;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #0f766e;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .school-name {
      font-size: 24px;
      font-weight: 800;
      color: #0f766e;
      letter-spacing: 0.5px;
      margin: 0 0 4px 0;
      text-transform: uppercase;
    }
    .title {
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 4px 0;
    }
    .subtitle {
      font-size: 12px;
      color: #64748b;
      margin: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      text-align: center;
      padding: 8px 6px;
    }
    th {
      background-color: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      font-size: 12px;
      text-transform: uppercase;
    }
    .day-col {
      background-color: #f8fafc;
      font-weight: 700;
      font-size: 12px;
      width: 110px;
      color: #0f766e;
    }
    .period-cell {
      height: 65px;
      font-size: 11px;
      vertical-align: middle;
      background: #ffffff;
    }
    .subject {
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 3px;
      font-size: 12px;
    }
    .teacher {
      font-size: 10px;
      color: #0d9488;
      font-weight: 600;
    }
    .timings {
      font-size: 9px;
      color: #94a3b8;
      font-weight: 500;
    }
    .free-period {
      color: #cbd5e1;
      font-style: italic;
      font-size: 11px;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 30px;
      padding-top: 15px;
      font-size: 11px;
      color: #475569;
    }
    .signature-box {
      border-top: 1px dashed #94a3b8;
      padding-top: 5px;
      width: 180px;
      text-align: center;
      font-weight: 600;
    }
    .no-print {
      margin-bottom: 15px;
      display: flex;
      gap: 10px;
    }
    .btn-print {
      background: #0f766e;
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
    }
    @media print {
      .no-print { display: none; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>

  <div class="header">
    <div class="school-name">${schoolName} (${schoolCode})</div>
    <div class="title">${title}</div>
    <div class="subtitle">${subtitle}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="day-col">Day / Time</th>
        ${PERIODS.map(p => `<th>Period ${p}<br><span style="font-size:9px;font-weight:normal;color:#64748b;">${p <= 2 ? '09:30-10:15' : p <= 4 ? '10:30-11:15' : '12:00-12:45'}</span></th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${DAYS.map(day => `
        <tr>
          <td class="day-col">${day}</td>
          ${PERIODS.map(period => {
            const slot = matrix[day]?.[period];
            if (!slot) return `<td class="period-cell"><span class="free-period">Free / Study</span></td>`;
            return `
              <td class="period-cell">
                <div class="subject">${slot.subject}</div>
                <div class="teacher">${slot.teacher?.name || (teacherId ? `${slot.grade} ${slot.section}` : 'Unassigned')}</div>
                ${slot.startTime && slot.endTime ? `<div class="timings">${slot.startTime}–${slot.endTime}</div>` : ''}
              </td>
            `;
          }).join('')}
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    <div>Generated via <strong>AI Smart Calendar SaaS Platform</strong> &middot; Validated Schedule</div>
    <div class="signature-box">Timetable In-Charge</div>
    <div class="signature-box">Principal Signature</div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error: any) {
    console.error('[TIMETABLE_PDF_EXPORT_ERROR]', error);
    return NextResponse.json({ error: 'Failed to generate timetable PDF: ' + error.message }, { status: 500 });
  }
}
