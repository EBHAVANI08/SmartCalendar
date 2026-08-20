import { createTimetableTemplate, createTeacherAllotmentTemplate } from '@/lib/timetable-import';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'complete';
  const format = searchParams.get('format') || 'xlsx';

  if (type === 'teacher' && format === 'csv') {
    const csvContent = createTeacherAllotmentTemplate('csv') as string;
    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="Teacher_Allotment_Template.csv"',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (type === 'teacher') {
    const workbook = createTeacherAllotmentTemplate('xlsx') as Buffer;
    return new Response(new Uint8Array(workbook), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Teacher_Allotment_Template.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  }

  const workbook = createTimetableTemplate();
  return new Response(new Uint8Array(workbook), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Complete_Timetable_Setup_Template.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
