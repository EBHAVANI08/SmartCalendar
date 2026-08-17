import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) { const url = new URL(request.url); const schoolId = url.searchParams.get('schoolId'); const timetableVersionId = url.searchParams.get('versionId'); if (!schoolId) return NextResponse.json({ error: 'schoolId required' }, { status: 400 }); const issues = await db.validationIssue.findMany({ where: { schoolId, ...(timetableVersionId ? { timetableVersionId } : {}) }, orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }] }); return NextResponse.json({ success: true, issues }); }
