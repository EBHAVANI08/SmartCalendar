import { db } from '@/lib/db';
import { generateCandidates } from '@/lib/timetable-generator';
import { can } from '@/lib/timetable-permissions';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { schoolId, timetableVersionId, createdBy, role, solveTimeSeconds = 60, alternatives = 3, allowPartial = false } = await request.json();
  if (!can(role, 'generate')) return NextResponse.json({ error: 'You do not have permission to generate timetables.' }, { status: 403 });
  const version = await db.timetableVersion.findFirst({ where: { id: timetableVersionId, schoolId } }); if (!version || version.status !== 'draft') return NextResponse.json({ error: 'A draft timetable version is required.' }, { status: 409 });
  const job = await db.generationJob.create({ data: { schoolId, timetableVersionId, createdBy, solveTimeSeconds, alternatives: Math.min(5, Math.max(1, alternatives)), allowPartial } });
  try { await generateCandidates(job.id); return NextResponse.json({ success: true, job: await db.generationJob.findUnique({ where: { id: job.id } }), candidates: await db.timetableCandidate.findMany({ where: { generationJobId: job.id }, orderBy: [{ recommended: 'desc' }, { preferenceScore: 'desc' }] }) }, { status: 201 }); }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isConfig = msg.includes('requirements') || msg.includes('not configured') || msg.includes('not found');
    await db.generationJob.update({ where: { id: job.id }, data: { status: 'failed', stage: 'failed', error: msg, completedAt: new Date() } });
    return NextResponse.json({ error: msg, jobId: job.id, hint: isConfig ? 'Use the AI Timetable Wizard (Create Timetable button) to generate your timetable. The governance engine requires subject requirements to be pre-configured.' : undefined }, { status: isConfig ? 400 : 500 });
  }
}
