import { createTimetableTemplate } from '@/lib/timetable-import';

export const dynamic = 'force-dynamic';

export async function GET() {
  const workbook = createTimetableTemplate();
  return new Response(new Uint8Array(workbook), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="SmartCalendar_Timetable_Import.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
