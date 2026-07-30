import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teacherId, topic, subjectId, gradeLevel } = body as {
      teacherId: string;
      topic: string;
      subjectId: string;
      gradeLevel?: number;
    };

    if (!teacherId || !topic) {
      return NextResponse.json(
        { success: false, error: 'teacherId and topic are required' },
        { status: 400 },
      );
    }

    const teacher = await db.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      return NextResponse.json({ success: false, error: 'Teacher not found' }, { status: 404 });
    }

    let material: Record<string, unknown> = {};
    try {
      const zai = await ZAI.create();
      const prompt = `Generate study material for teacher ${teacher.name} on topic: ${topic}. Output JSON.`;
      const completion = await zai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
      });
      const content = completion.choices?.[0]?.message?.content || '';
      const match = content.match(/\{[\s\S]*\}/);
      if (match) material = JSON.parse(match[0]);
    } catch (e) {
      console.error('[TEACHER_MATERIAL_AI_ERROR]', e);
    }

    return NextResponse.json({
      success: true,
      data: {
        teacher: { id: teacher.id, name: teacher.name },
        topic,
        gradeLevel: gradeLevel || null,
        material,
      },
    });
  } catch (error) {
    console.error('[TEACHER_GENERATE_MATERIAL_ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to generate study material' },
      { status: 500 },
    );
  }
}
