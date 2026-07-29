import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const board = searchParams.get('board');
    const grade = searchParams.get('grade');

    const where: Record<string, string> = {};
    if (board) where.board = board;
    if (grade) where.grade = grade;

    const topics = await db.curriculumTopic.findMany({
      where,
      orderBy: [{ grade: 'asc' }, { subject: 'asc' }, { sequenceOrder: 'asc' }],
    });

    return NextResponse.json(topics);
  } catch (error) {
    console.error('Error fetching curriculum:', error);
    return NextResponse.json({ error: 'Failed to fetch curriculum' }, { status: 500 });
  }
}
