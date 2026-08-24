import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import Groq from 'groq-sdk';

export async function GET(request: Request) {
  try {
    const schoolId = await getTenantSchoolId(request);
    const todayStr = new Date().toISOString().split('T')[0];
    const dayName = new Date().toLocaleDateString('en-IN', { weekday: 'long' });

    const teacherWhere = schoolId ? { schoolId } : {};
    const subWhere = schoolId ? { absentTeacher: { schoolId } } : {};
    const leaveWhere = schoolId
      ? { teacher: { schoolId }, status: 'approved', startDate: { lte: todayStr }, endDate: { gte: todayStr } }
      : { status: 'approved', startDate: { lte: todayStr }, endDate: { gte: todayStr } };

    const [totalTeachers, absentToday, pendingSubs, resolvedToday, totalSchedules] = await Promise.all([
      db.teacher.count({ where: teacherWhere }),
      db.leaveApplication.count({ where: leaveWhere }),
      db.substitution.count({ where: { ...subWhere, status: 'pending' } }),
      db.substitution.count({ where: { ...subWhere, date: todayStr, status: 'completed' } }),
      db.schedule.count({ where: schoolId ? { schoolId } : {} }),
    ]);

    const coverageRate = totalSchedules > 0
      ? Math.round(((totalSchedules - pendingSubs) / totalSchedules) * 100)
      : 100;

    // Build the briefing
    let summary = '';
    const urgentAlerts: string[] = [];
    const recommendations: string[] = [];

    // Try AI generation with Groq if key available
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      try {
        const groq = new Groq({ apiKey: groqKey });
        const prompt = `You are an AI assistant for a school operations system. Generate a brief, professional daily operational briefing for the school principal. Today is ${dayName}. Facts: ${totalTeachers} total teachers, ${absentToday} on approved leave today, ${pendingSubs} substitution periods pending assignment, ${resolvedToday} substitutions resolved, ${coverageRate}% schedule coverage. Return valid JSON only: { "summary": "...", "urgentAlerts": ["..."], "recommendations": ["..."] }. All strings should be under 100 chars. Max 3 items in arrays.`;

        const chatCompletion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.3,
          max_tokens: 400,
          response_format: { type: 'json_object' },
        });

        const text = chatCompletion.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(text);
        summary = parsed.summary || '';
        if (Array.isArray(parsed.urgentAlerts)) urgentAlerts.push(...parsed.urgentAlerts);
        if (Array.isArray(parsed.recommendations)) recommendations.push(...parsed.recommendations);
      } catch {
        // Fall through to rule-based briefing
      }
    }

    // High-precision rule-based fallback
    if (!summary) {
      if (absentToday === 0 && pendingSubs === 0) {
        summary = `Excellent start to ${dayName}! All ${totalTeachers} teachers are present and schedule coverage is at ${coverageRate}%. No pending actions required — the system is operating at full capacity.`;
      } else if (absentToday > 0 && pendingSubs === 0) {
        summary = `Good morning! ${absentToday} teacher${absentToday !== 1 ? 's are' : ' is'} on approved leave today. All affected periods have been covered by AI auto-assignment. Coverage is at ${coverageRate}%.`;
      } else {
        summary = `Attention required: ${absentToday} teacher${absentToday !== 1 ? 's' : ''} absent today with ${pendingSubs} period${pendingSubs !== 1 ? 's' : ''} awaiting substitute assignment. ${resolvedToday} period${resolvedToday !== 1 ? 's have' : ' has'} already been resolved. Current coverage: ${coverageRate}%.`;
      }
    }

    if (!urgentAlerts.length) {
      if (pendingSubs > 0) urgentAlerts.push(`${pendingSubs} substitution period${pendingSubs !== 1 ? 's' : ''} need urgent assignment`);
      if (absentToday > 3) urgentAlerts.push(`High absence count (${absentToday}) detected — consider reaching out to relief teachers`);
    }

    if (!recommendations.length) {
      recommendations.push('Review biometric attendance for early absence detection', 'Check teacher workload analytics to ensure fair distribution');
      if (pendingSubs > 0) recommendations.push('Use AI Auto-Assign for fastest coverage resolution');
    }

    return NextResponse.json({
      success: true,
      briefing: {
        summary,
        urgentAlerts,
        recommendations,
        coverageRate,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[AI DAILY BRIEFING ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to generate briefing' }, { status: 500 });
  }
}
