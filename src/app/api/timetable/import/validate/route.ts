import { validateTimetableWorkbook } from '@/lib/timetable-import';
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'An .xlsx file is required.' }, { status: 400 });
    if (!file.name.toLowerCase().endsWith('.xlsx')) return NextResponse.json({ error: 'Only .xlsx workbooks are accepted for complete timetable import.' }, { status: 415 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'Workbook exceeds the 15 MB limit.' }, { status: 413 });
    const schoolId = String(form.get('schoolId') || ''); const createdBy = String(form.get('createdBy') || schoolId || 'unknown'); const buffer = await file.arrayBuffer();
    const preview = validateTimetableWorkbook(buffer); let importBatchId: string | null = null;
    if (schoolId) { const batch = await db.importBatch.create({ data: { schoolId, fileName: file.name, fileHash: createHash('sha256').update(new Uint8Array(buffer)).digest('hex'), scope: 'complete_timetable', mode: 'validate_only', status: preview.blocking ? 'needs_correction' : 'ready', summary: preview.summary, errorReport: preview.issues, createdBy } }); importBatchId = batch.id; }
    return NextResponse.json({ success: true, importBatchId, fileName: file.name, fileSize: file.size, ...preview });
  } catch (error) {
    console.error('Timetable import validation failed:', error);
    return NextResponse.json({ error: 'The workbook could not be read. Check that it is a valid Excel file.' }, { status: 400 });
  }
}
