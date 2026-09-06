import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireCapability(request, 'lessonplan.write');
  if (denied) return denied;

  try {
    const { id } = await params;
    await db.curriculumDocument.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting curriculum document:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
