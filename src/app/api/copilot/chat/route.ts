import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import ZAI from '@/lib/ollama';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * POST /api/copilot/chat
 * Conversational AI Co-Pilot for school admins.
 * Uses groq-sdk with tool-calling to answer questions about the school.
 *
 * Body: { messages: Array<{role, content}>, date?: string }
 */
export async function POST(request: NextRequest) {
  const { messages, date: dateParam } = await request.json();
  const today = dateParam || new Date().toISOString().split('T')[0];

  // ── Tool Definitions ──
  const tools: any[] = [
    {
      type: 'function',
      function: {
        name: 'getTeacherSchedule',
        description: 'Get a teacher\'s schedule for a specific date. Provide teacher name.',
        parameters: {
          type: 'object',
          properties: {
            teacherIdentifier: { type: 'string', description: 'Teacher name (partial match) or email' },
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          },
          required: ['teacherIdentifier', 'date'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getAbsencesForDate',
        description: 'Get all approved absences (teachers on leave) for a specific date.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          },
          required: ['date'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getPendingSubstitutions',
        description: 'Get all pending substitution requests that need admin action.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format (optional)' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getTeacherWorkload',
        description: 'Get a teacher\'s substitution workload for the current week.',
        parameters: {
          type: 'object',
          properties: {
            teacherIdentifier: { type: 'string', description: 'Teacher name or email' },
          },
          required: ['teacherIdentifier'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'findFreeTeachers',
        description: 'Find teachers who are free (not teaching, not on leave) during a specific period on a date.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
            period: { type: 'number', description: 'Period number (1-8)' },
          },
          required: ['date', 'period'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getInsights',
        description: 'Get AI insights and analytics for a specific date including heatmap data and subject breakdown.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          },
          required: ['date'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getSubstitutionDetails',
        description: 'Get details of a specific substitution request including assigned substitute.',
        parameters: {
          type: 'object',
          properties: {
            requestId: { type: 'string', description: 'The substitution request ID' },
          },
          required: ['requestId'],
        },
      },
    },
  ];

  // ── Tool Execution ──
  async function executeTool(name: string, args: Record<string, any>): Promise<string> {
    try {
      switch (name) {
        case 'getTeacherSchedule': {
          const { teacherIdentifier, date } = args;
          const teacher = await db.teacher.findFirst({
            where: { OR: [{ name: { contains: teacherIdentifier } }, { email: { contains: teacherIdentifier } }] },
          });
          if (!teacher) return `No teacher found matching "${teacherIdentifier}".`;

          const dayName = DAY_NAMES[new Date(date + 'T00:00:00').getDay()];
          const schedules = await db.schedule.findMany({ where: { teacherId: teacher.id, day: dayName }, orderBy: { period: 'asc' } });
          const isAbsent = await db.leaveApplication.count({
            where: { teacherId: teacher.id, status: 'approved', startDate: { lte: date }, endDate: { gte: date } },
          }) > 0;

          const periods = schedules.map(s => `Period ${s.period} (${s.startTime}-${s.endTime}): ${s.subject} for ${s.grade} Sec ${s.section}`).join('\n');
          return `Teacher: ${teacher.name} (${teacher.subject})${isAbsent ? ' — ⚠️ ABSENT (on approved leave)' : ''}\nSchedule for ${date}:\n${periods || 'No classes scheduled'}`;
        }

        case 'getAbsencesForDate': {
          const { date } = args;
          const leaves = await db.leaveApplication.findMany({
            where: { status: 'approved', startDate: { lte: date }, endDate: { gte: date } },
            include: { teacher: true },
          });
          if (leaves.length === 0) return `No approved absences for ${date}.`;
          const dayName = DAY_NAMES[new Date(date + 'T00:00:00').getDay()];
          const results = await Promise.all(leaves.map(async (l) => {
            const schedules = await db.schedule.findMany({ where: { teacherId: l.teacherId, day: dayName } });
            const affected = schedules.map(s => `${s.subject} ${s.grade} Sec ${s.section} (Period ${s.period})`).join(', ');
            return `${l.teacher.name} (${l.teacher.subject}): ${l.reason}${affected ? `. Affected: ${affected}` : ''}`;
          }));
          return results.join('\n');
        }

        case 'getPendingSubstitutions': {
          const { date: filterDate } = args;
          const where: any = { status: 'pending' };
          if (filterDate) where.date = filterDate;
          const pending = await db.substitution.findMany({
            where,
            include: { absentTeacher: true },
            take: 20,
            orderBy: { createdAt: 'desc' },
          });
          if (pending.length === 0) return 'No pending substitutions found.';
          return pending.map(p => `${p.subject} — ${p.grade} Sec ${p.section} Period ${p.period} — Original: ${p.absentTeacher.name} — Date: ${p.date}`).join('\n');
        }

        case 'getTeacherWorkload': {
          const { teacherIdentifier } = args;
          const teacher = await db.teacher.findFirst({
            where: { OR: [{ name: { contains: teacherIdentifier } }, { email: { contains: teacherIdentifier } }] },
          });
          if (!teacher) return `No teacher found matching "${teacherIdentifier}".`;

          const weekStart = new Date();
          const day = weekStart.getDay();
          const diff = day === 0 ? 6 : day - 1;
          weekStart.setDate(weekStart.getDate() - diff);
          const weekStartStr = weekStart.toISOString().split('T')[0];

          const weekSubs = await db.substitution.findMany({
            where: { substituteId: teacher.id, status: { in: ['assigned', 'completed'] }, date: { gte: weekStartStr } },
          });
          return `Teacher: ${teacher.name} (${teacher.subject})\nSubstitutions this week: ${weekSubs.length}\n${weekSubs.map(s => `- ${s.subject} ${s.grade} on ${s.date}`).join('\n') || 'No substitutions this week'}`;
        }

        case 'findFreeTeachers': {
          const { date: fDate, period } = args;
          const dayOfWeek = new Date(fDate + 'T00:00:00').getDay();
          const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;
          const dayName = DAY_NAMES[scheduleDay];

          const busyTeacherIds = await db.schedule.findMany({ where: { day: dayName, period }, select: { teacherId: true } });
          const busyIds = new Set(busyTeacherIds.map(s => s.teacherId).filter((id): id is string => !!id));
          const onLeave = await db.leaveApplication.findMany({
            where: { status: 'approved', startDate: { lte: fDate }, endDate: { gte: fDate } },
            select: { teacherId: true },
          });
          onLeave.forEach(l => busyIds.add(l.teacherId));

          const freeTeachers = await db.teacher.findMany({ where: { id: { notIn: Array.from(busyIds) } }, take: 15 });
          if (freeTeachers.length === 0) return `No free teachers found for Period ${period} on ${fDate}.`;
          return freeTeachers.map(t => `${t.name} (${t.subject})`).join('\n');
        }

        case 'getInsights': {
          const { date: iDate } = args;
          const insightsRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/substitutions/insights?date=${iDate}`);
          const insightsJson = await insightsRes.json();
          if (!insightsJson.success) return 'Failed to fetch insights.';
          const d = insightsJson.data;
          return `AI Auto-assigned: ${d.aiConfidenceMetrics?.total || 0}\nPeriod Heatmap: ${d.periodHeatmap?.map((p: any) => `${p.periodName}: ${p.absenceCount} absences`).join(', ') || 'No data'}\nTeachers at Risk: ${d.teachersAtRisk?.map((t: any) => t.teacherName).join(', ') || 'None'}\nSubject Breakdown: ${d.departmentBreakdown?.map((dept: any) => `${dept.department}: ${dept.absentCount}/${dept.totalTeachers} absent`).join(', ') || 'No data'}`;
        }

        case 'getSubstitutionDetails': {
          const { requestId } = args;
          const sub = await db.substitution.findUnique({
            where: { id: requestId },
            include: { absentTeacher: true, substitute: true },
          });
          if (!sub) return `Substitution request ${requestId} not found.`;
          return `Subject: ${sub.subject} | Grade: ${sub.grade} Sec ${sub.section}\nPeriod: ${sub.period} on ${sub.date}\nOriginal: ${sub.absentTeacher.name} | Status: ${sub.status}\n${sub.substitute ? `Substitute: ${sub.substitute.name} (${sub.substitute.subject})` : 'No substitute assigned yet.'}`;
        }

        default:
          return `Unknown tool: ${name}`;
      }
    } catch (err: any) {
      return `Error executing ${name}: ${err.message}`;
    }
  }

  // ── Main Chat Logic ──
  try {
    const zai = await ZAI.create();

    const systemPrompt = `You are an AI Co-Pilot for a school substitution management system. You help administrators manage teacher absences, find substitutes, and make data-driven decisions.

Current date: ${today}
Your role: Answer questions about the school's schedule, absences, substitutions, and teacher availability. Use the provided tools to fetch real data.

Rules:
1. Always use tools to fetch real data before answering. Never make up information.
2. When recommending substitute teachers, explain your reasoning clearly.
3. For destructive actions (assigning, reassigning), always ask for confirmation.
4. Be concise but thorough. Use bullet points for lists.
5. If you don't have enough information, ask clarifying questions.`;

    const chatMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    let response = await zai.chat.completions.create({
      messages: chatMessages,
      tools,
      tool_choice: 'auto',
    });

    let maxIterations = 5;
    while (maxIterations-- > 0) {
      const choice = response.choices[0];
      if (!choice) break;

      if (!choice.message?.tool_calls || choice.message.tool_calls.length === 0) {
        break;
      }

      chatMessages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments || '{}');
        const result = await executeTool(toolCall.function.name, args);
        chatMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      response = await zai.chat.completions.create({
        messages: chatMessages,
        tools,
        tool_choice: 'auto',
      });
    }

    const finalContent = response.choices[0]?.message?.content || 'I apologize, I could not process that request.';

    return new Response(JSON.stringify({
      success: true,
      content: finalContent,
      role: 'assistant',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Copilot chat error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      content: 'Sorry, I encountered an error. Please try again.',
      role: 'assistant',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
