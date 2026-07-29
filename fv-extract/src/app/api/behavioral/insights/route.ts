import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sectionId = searchParams.get('sectionId');

    // Handle "all" - return insights across all sections
    if (sectionId === 'all') {
      const allInsights = await db.behavioralInsight.findMany({
        where: { isActive: true },
        include: { section: { include: { grade: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      if (allInsights.length > 0) {
        const mapped = allInsights.map(i => ({
          ...i,
          strategies: JSON.parse(i.strategies || '[]'),
          dataPoints: JSON.parse(i.dataPoints || '{}'),
        }));
        return NextResponse.json({ success: true, data: mapped });
      }

      // Generate insights for a few sections if none exist
      const sections = await db.section.findMany({ take: 5, include: { grade: true } });
      const generated = [];
      for (const sec of sections) {
        const studentCount = await db.student.count({ where: { sectionId: sec.id } });
        const zai = await ZAI.create();
        try {
          const completion = await zai.chat.completions.create({
            messages: [
              { role: 'system', content: 'You are an expert educational behavioral analyst. You produce ONLY valid JSON arrays, no markdown, no code fences. Generate actionable insights for substitute teachers.' },
              { role: 'user', content: `Analyze classroom dynamics for Grade ${sec.grade.level} Section ${sec.name} (${studentCount} students). Generate 2 behavioral insights as JSON array: [{"insightType":"ATTENTION"|"DISRUPTION"|"ENGAGEMENT"|"PARTICIPATION"|"SOCIAL_DYNAMICS"|"LEARNING_PACE","description":"observation","severity":"LOW"|"MEDIUM"|"HIGH","strategies":["strategy1","strategy2","strategy3"],"dataPoints":{"metric":"value"}}]. Make insights realistic and actionable for substitute teachers.` }
            ],
            temperature: 0.7,
            max_tokens: 2000,
          });
          const content = completion.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const insights = JSON.parse(jsonMatch[0]);
            for (const insight of insights) {
              const record = await db.behavioralInsight.create({
                data: {
                  sectionId: sec.id,
                  subjectId: null,
                  insightType: (insight.insightType as string) || 'ENGAGEMENT',
                  description: (insight.description as string) || 'Class dynamics observation',
                  severity: (insight.severity as string) || 'LOW',
                  strategies: JSON.stringify(insight.strategies || []),
                  dataPoints: JSON.stringify(insight.dataPoints || {}),
                  isActive: true,
                },
              });
              generated.push({
                ...record,
                strategies: JSON.parse(record.strategies || '[]'),
                dataPoints: JSON.parse(record.dataPoints || '{}'),
                section: { name: sec.name, grade: { name: sec.grade.name, level: sec.grade.level } },
              });
            }
          }
        } catch (aiError) {
          console.error('[BEHAVIORAL_INSIGHTS_AI_ERROR]', aiError);
          // Fallback insight
          const record = await db.behavioralInsight.create({
            data: {
              sectionId: sec.id,
              subjectId: null,
              insightType: 'ENGAGEMENT',
              description: `Grade ${sec.grade.level} Section ${sec.name} typically shows moderate engagement. Students respond well to interactive activities.`,
              severity: 'LOW',
              strategies: JSON.stringify(['Use pair-share activities', 'Incorporate visual aids', 'Allow brief movement breaks']),
              dataPoints: JSON.stringify({ studentCount, gradeLevel: sec.grade.level }),
              isActive: true,
            },
          });
          generated.push({
            ...record,
            strategies: JSON.parse(record.strategies || '[]'),
            dataPoints: JSON.parse(record.dataPoints || '{}'),
            section: { name: sec.name, grade: { name: sec.grade.name, level: sec.grade.level } },
          });
        }
      }
      return NextResponse.json({ success: true, data: generated });
    }

    const section = await db.section.findUnique({
      where: { id: sectionId },
      include: { grade: true },
    });

    if (!section) {
      return NextResponse.json(
        { success: false, error: 'Section not found' },
        { status: 404 },
      );
    }

    // Fetch existing insights for this section
    const existingInsights = await db.behavioralInsight.findMany({
      where: { sectionId, isActive: true },
      include: { section: { include: { grade: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (existingInsights.length > 0) {
      const mapped = existingInsights.map(i => ({
        ...i,
        strategies: JSON.parse(i.strategies || '[]'),
        dataPoints: JSON.parse(i.dataPoints || '{}'),
      }));
      return NextResponse.json({ success: true, data: mapped });
    }

    // No insights exist — generate them on the fly
    const studentCount = await db.student.count({ where: { sectionId } });
    const schedules = await db.schedule.findMany({
      where: { sectionId },
      include: { subject: true, teacher: true },
    });

    const substitutionHistory = await db.substitutionRequest.findMany({
      where: {
        schedule: { sectionId },
        status: 'RESOLVED',
      },
      include: { assignments: { where: { status: 'ACCEPTED' } } },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    const zai = await ZAI.create();

    const systemPrompt = `You are an expert educational behavioral analyst. You produce ONLY valid JSON arrays, no markdown, no code fences. Generate actionable insights for substitute teachers and school administrators.`;

    const userPrompt = `Analyze classroom dynamics and generate behavioral insights for:
Grade: ${section.grade.level}, Section: ${section.name}, Students: ${studentCount}
Subjects taught: ${schedules.map(s => `${s.subject.name} (by ${s.teacher.name})`).join(', ') || 'No schedule data'}
Recent substitutions: ${substitutionHistory.length} (subjects: ${substitutionHistory.map(s => s.subjectId).join(', ') || 'none'})

Generate a JSON array of 3-5 behavioral insights:
[{
  "insightType": "ATTENTION" | "DISRUPTION" | "ENGAGEMENT" | "PARTICIPATION" | "SOCIAL_DYNAMICS" | "LEARNING_PACE",
  "description": "Specific observation about class dynamics with evidence-based reasoning",
  "severity": "LOW" | "MEDIUM" | "HIGH",
  "strategies": ["strategy1", "strategy2", "strategy3"] (practical classroom management strategies for substitute teachers),
  "dataPoints": {"metric": "value"} (relevant data that supports this insight)
}]

Make insights realistic, specific to this grade level, and actionable for substitute teachers.`;

    let insights: Array<Record<string, unknown>> = [];
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 3000,
      });
      const content = completion.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        insights = JSON.parse(jsonMatch[0]);
      }
    } catch (aiError) {
      console.error('[BEHAVIORAL_INSIGHTS_AI_ERROR]', aiError);
      // Provide fallback insights
      insights = [
        {
          insightType: 'ENGAGEMENT',
          description: `Grade ${section.grade.level} Section ${section.name} typically shows moderate engagement levels. Students respond well to interactive activities.`,
          severity: 'LOW',
          strategies: ['Use pair-share activities every 10 minutes', 'Incorporate visual aids and real-world examples', 'Allow brief movement breaks between topics'],
          dataPoints: { studentCount, gradeLevel: section.grade.level },
        },
        {
          insightType: 'PARTICIPATION',
          description: `Participation tends to be uneven with ~60% of students actively contributing. Some students may need direct prompting.`,
          severity: 'MEDIUM',
          strategies: ['Call on students by name after think-pair-share', 'Use thumbs-up/thumbs-down for quick comprehension checks', 'Provide written response options before verbal sharing'],
          dataPoints: { estimatedActiveParticipation: '60%' },
        },
      ];
    }

    // Save generated insights to the database
    const saved = [];
    for (const insight of insights) {
      try {
        const record = await db.behavioralInsight.create({
          data: {
            sectionId,
            subjectId: null,
            insightType: (insight.insightType as string) || 'ENGAGEMENT',
            description: (insight.description as string) || 'Class dynamics observation',
            severity: (insight.severity as string) || 'LOW',
            strategies: JSON.stringify(insight.strategies || []),
            dataPoints: JSON.stringify(insight.dataPoints || {}),
            isActive: true,
          },
        });
        saved.push({
          ...record,
          strategies: JSON.parse(record.strategies || '[]'),
          dataPoints: JSON.parse(record.dataPoints || '{}'),
        });
      } catch (dbError) {
        console.error('[BEHAVIORAL_INSIGHTS_SAVE_ERROR]', dbError);
      }
    }

    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    console.error('[BEHAVIORAL_INSIGHTS_GET_ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch behavioral insights' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sectionId, subjectId } = body as { sectionId: string; subjectId?: string };

    if (!sectionId) {
      return NextResponse.json(
        { success: false, error: 'sectionId is required' },
        { status: 400 },
      );
    }

    const section = await db.section.findUnique({
      where: { id: sectionId },
      include: {
        grade: true,
        students: true,
        schedules: {
          where: subjectId ? { subjectId } : {},
          include: { subject: true, teacher: true },
        },
      },
    });

    if (!section) {
      return NextResponse.json(
        { success: false, error: 'Section not found' },
        { status: 404 },
      );
    }

    const subjectContext = subjectId
      ? await db.subject.findUnique({ where: { id: subjectId } })
      : null;

    // Get historical substitution data for this section+subject
    const substitutionHistory = await db.substitutionRequest.findMany({
      where: {
        schedule: { sectionId },
        ...(subjectId ? { subjectId } : {}),
      },
      include: {
        assignments: { where: { status: 'ACCEPTED' } },
        schedule: { include: { subject: true } },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    // Get behavioral insight history
    const previousInsights = await db.behavioralInsight.findMany({
      where: { sectionId, subjectId: subjectId || null },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const zai = await ZAI.create();

    const systemPrompt = `You are an expert educational behavioral analyst specializing in subject-specific classroom dynamics. You produce ONLY valid JSON arrays, no markdown, no code fences. Your insights must be specific to the subject context and actionable for substitute teachers.`;

    const userPrompt = `Generate detailed behavioral insights for a specific class and subject combination:

CLASS CONTEXT:
- Grade: ${section.grade.level}, Section: ${section.name}
- Number of Students: ${section.students.length}
- Subject: ${subjectContext?.name || 'General'} ${subjectId ? `(Code: ${subjectContext?.code})` : ''}

SCHEDULE CONTEXT:
${section.schedules.map(s => `- ${s.subject.name}: taught by ${s.teacher.name}`).join('\n') || 'No schedule data available'}

SUBSTITUTION HISTORY:
- Total recent substitutions: ${substitutionHistory.length}
${substitutionHistory.length > 0 ? substitutionHistory.map(s => `  - ${s.schedule?.subject?.name || 'Unknown'} on ${s.date}: ${s.reason} (assigned to ${s.assignments[0]?.substituteTeacherId || 'unassigned'})`).join('\n') : '  - No recent substitutions'}

PREVIOUS INSIGHTS:
${previousInsights.length > 0 ? previousInsights.map(pi => `  - [${pi.insightType}/${pi.severity}] ${pi.description}`).join('\n') : '  - No previous insights recorded'}

Generate a JSON array of 3-5 behavioral insights SPECIFIC to this section${subjectContext ? ' and subject' : ''}:
[{
  "insightType": "ATTENTION" | "DISRUPTION" | "ENGAGEMENT" | "PARTICIPATION" | "SOCIAL_DYNAMICS" | "LEARNING_PACE" | "SUBSTITUTE_VULNERABILITY",
  "description": "Specific, evidence-based observation about class dynamics for this subject",
  "severity": "LOW" | "MEDIUM" | "HIGH",
  "strategies": ["3-5 specific strategies for substitute teachers to manage this dynamic"],
  "dataPoints": {"metric": "value"} (relevant supporting data)
}]

Focus on patterns that a SUBSTITUTE teacher would need to know. Include at least one insight about substitute vulnerability (how the class typically responds to teacher absence).`;

    let insights: Array<Record<string, unknown>> = [];
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      });
      const content = completion.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        insights = JSON.parse(jsonMatch[0]);
      }
    } catch (aiError) {
      console.error('[BEHAVIORAL_INSIGHTS_POST_AI_ERROR]', aiError);
      insights = [
        {
          insightType: 'SUBSTITUTE_VULNERABILITY',
          description: `This section has had ${substitutionHistory.length} recent substitutions. Students may test boundaries with new teachers, especially during ${subjectContext?.name || 'core'} periods.`,
          severity: substitutionHistory.length > 3 ? 'HIGH' : 'MEDIUM',
          strategies: ['Establish authority in the first 2 minutes', 'Use the seating chart strictly', 'Keep students busy with structured activities', 'Avoid open-ended free time'],
          dataPoints: { recentSubstitutions: substitutionHistory.length },
        },
      ];
    }

    // Deactivate previous insights for this section+subject so only the latest are active
    await db.behavioralInsight.updateMany({
      where: { sectionId, subjectId: subjectId || null, isActive: true },
      data: { isActive: false },
    });

    // Save new insights
    const saved = [];
    for (const insight of insights) {
      try {
        const record = await db.behavioralInsight.create({
          data: {
            sectionId,
            subjectId: subjectId || null,
            insightType: (insight.insightType as string) || 'ENGAGEMENT',
            description: (insight.description as string) || 'Class dynamics observation',
            severity: (insight.severity as string) || 'LOW',
            strategies: JSON.stringify(insight.strategies || []),
            dataPoints: JSON.stringify(insight.dataPoints || {}),
            isActive: true,
          },
        });
        saved.push({
          ...record,
          strategies: JSON.parse(record.strategies || '[]'),
          dataPoints: JSON.parse(record.dataPoints || '{}'),
        });
      } catch (dbError) {
        console.error('[BEHAVIORAL_INSIGHTS_SAVE_ERROR]', dbError);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        sectionId,
        subjectId: subjectId || null,
        totalInsights: saved.length,
        insights: saved,
      },
    });
  } catch (error) {
    console.error('[BEHAVIORAL_INSIGHTS_POST_ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to generate behavioral insights' },
      { status: 500 },
    );
  }
}
