import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import ZAI from '@/lib/ollama';

/**
 * POST /api/copilot/chat
 * Conversational AI Co-Pilot for school admins.
 * Uses groq-sdk with tool-calling to answer questions about the school.
 * Streams responses via Server-Sent Events.
 *
 * Body: { messages: Array<{role, content}>, date?: string }
 */
export async function POST(request: NextRequest) {
  const { messages, date: dateParam } = await request.json();
  const today = dateParam || new Date().toISOString().split('T')[0];

  // â”€â”€ Tool Definitions â”€â”€
  const tools: any[] = [
    {
      type: 'function',
      function: {
        name: 'getTeacherSchedule',
        description: 'Get a teacher\'s schedule for a specific date. Provide teacher name or employee ID.',
        parameters: {
          type: 'object',
          properties: {
            teacherIdentifier: { type: 'string', description: 'Teacher name (partial match) or employee ID' },
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
            teacherIdentifier: { type: 'string', description: 'Teacher name or employee ID' },
          },
          required: ['teacherIdentifier'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'findFreeTeachers',
        description: 'Find teachers who are free (not teaching, not on leave) during a specific time slot on a date.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
            timeSlotName: { type: 'string', description: 'Period/time slot name (e.g., "Period 3", "Period 4")' },
          },
          required: ['date', 'timeSlotName'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'predictAbsences',
        description: 'Run the predictive absence engine for upcoming dates.',
        parameters: {
          type: 'object',
          properties: {
            baseDate: { type: 'string', description: 'Base date to predict from (YYYY-MM-DD)' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'getInsights',
        description: 'Get AI insights and analytics for a specific date including heatmap data, confidence metrics, and department breakdown.',
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
        description: 'Get details of a specific substitution request including assigned substitute, confidence, and reasoning.',
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

  // â”€â”€ Tool Execution â”€â”€
  async function executeTool(name: string, args: Record<string, any>): Promise<string> {
    try {
      switch (name) {
        case 'getTeacherSchedule': {
          const { teacherIdentifier, date } = args;
          const teacher = await db.teacher.findFirst({
            where: {
              OR: [
                { name: { contains: teacherIdentifier } },
                { employeeId: teacherIdentifier },
                { email: teacherIdentifier },
              ],
            },
            include: {
              schedules: {
                where: { dayOfWeek: new Date(date + 'T00:00:00').getDay() || 1 },
                include: { subject: true, grade: true, section: true, timeSlot: true },
                orderBy: { timeSlot: { order: 'asc' } },
              },
              leaves: { where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } } },
            },
          });
          if (!teacher) return `No teacher found matching "${teacherIdentifier}".`;
          const isAbsent = teacher.leaves.length > 0;
          const periods = teacher.schedules
            .filter(s => !s.timeSlot.isBreak)
            .map(s => `${s.timeSlot.name} (${s.timeSlot.startTime}-${s.timeSlot.endTime}): ${s.subject.name} for Grade ${s.grade.name} Sec ${s.section.name}`)
            .join('\n');
          return `Teacher: ${teacher.name} (${teacher.department || 'No dept'})${isAbsent ? ' â€” âš ï¸ ABSENT (on approved leave)' : ''}\nSchedule for ${date}:\n${periods || 'No classes scheduled'}`;
        }

        case 'getAbsencesForDate': {
          const { date } = args;
          const leaves = await db.leave.findMany({
            where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
            include: {
              teacher: {
                include: {
                  schedules: {
                    where: { dayOfWeek: new Date(date + 'T00:00:00').getDay() || 1 },
                    include: { subject: true, grade: true, section: true, timeSlot: true },
                  },
                },
              },
            },
          });
          if (leaves.length === 0) return `No approved absences for ${date}.`;
          return leaves.map(l => {
            const affectedClasses = l.teacher.schedules
              .filter(s => !s.timeSlot.isBreak)
              .map(s => `${s.subject.name} Gr ${s.grade.name} Sec ${s.section.name} (${s.timeSlot.name})`)
              .join(', ');
            return `${l.teacher.name} (${l.teacher.department}): ${l.reason}${affectedClasses ? `. Affected: ${affectedClasses}` : ''}`;
          }).join('\n');
        }

        case 'getPendingSubstitutions': {
          const { date: filterDate } = args;
          const where: any = { status: 'PENDING' };
          if (filterDate) where.date = filterDate;
          const pending = await db.substitutionRequest.findMany({
            where,
            include: { originalTeacher: true, subject: true, schedule: { include: { grade: true, section: true, timeSlot: true } } },
            take: 20,
            orderBy: { createdAt: 'desc' },
          });
          if (pending.length === 0) return 'No pending substitutions found.';
          return pending.map(p => `${p.subject.name} â€” Gr ${p.schedule.grade.name} Sec ${p.schedule.section.name} ${p.schedule.timeSlot.name} (${p.schedule.timeSlot.startTime}-${p.schedule.timeSlot.endTime}) â€” Original: ${p.originalTeacher.name} â€” Date: ${p.date}`).join('\n');
        }

        case 'getTeacherWorkload': {
          const { teacherIdentifier } = args;
          const teacher = await db.teacher.findFirst({
            where: { OR: [{ name: { contains: teacherIdentifier } }, { employeeId: teacherIdentifier }] },
            include: {
              substitutionsAsSubstitute: {
                where: { status: 'ACCEPTED' },
                include: {
                  substitutionRequest: {
                    include: {
                      subject: true,
                      schedule: { include: { grade: true, section: true, timeSlot: true } },
                    },
                  },
                },
              },
            },
          });
          if (!teacher) return `No teacher found matching "${teacherIdentifier}".`;
          const weekStart = new Date();
          const day = weekStart.getDay();
          const diff = day === 0 ? 6 : day - 1;
          weekStart.setDate(weekStart.getDate() - diff);
          const weekStartStr = weekStart.toISOString().split('T')[0];
          const weekSubs = teacher.substitutionsAsSubstitute.filter(s => s.createdAt >= new Date(weekStartStr));
          return `Teacher: ${teacher.name} (${teacher.department})\nSubstitutions this week: ${weekSubs.length}\n${weekSubs.map(s => `- ${s.substitutionRequest.subject.name} Gr ${s.substitutionRequest.schedule.grade.name} on ${s.substitutionRequest.date}`).join('\n') || 'No substitutions this week'}`;
        }

        case 'findFreeTeachers': {
          const { date: fDate, timeSlotName } = args;
          const timeSlot = await db.timeSlot.findFirst({ where: { name: { contains: timeSlotName } } });
          if (!timeSlot) {
            const allSlots = await db.timeSlot.findMany({ orderBy: { order: 'asc' } });
            return `Time slot "${timeSlotName}" not found. Available: ${allSlots.map(s => s.name).join(', ')}`;
          }
          const dayOfWeek = new Date(fDate + 'T00:00:00').getDay();
          const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;
          const busyTeacherIds = await db.schedule.findMany({
            where: { timeSlotId: timeSlot.id, dayOfWeek: scheduleDay },
            select: { teacherId: true },
          });
          const busyIds = new Set(busyTeacherIds.map(s => s.teacherId));
          const onLeaveTeacherIds = await db.leave.findMany({
            where: { status: 'APPROVED', startDate: { lte: fDate }, endDate: { gte: fDate } },
            select: { teacherId: true },
          });
          const leaveIds = new Set(onLeaveTeacherIds.map(l => l.teacherId));
          const freeTeachers = await db.teacher.findMany({
            where: {
              isActive: true,
              id: { notIn: [...busyIds, ...leaveIds] },
            },
            include: { teacherSubjects: { include: { subject: true } } },
            take: 15,
          });
          if (freeTeachers.length === 0) return `No free teachers found for ${timeSlotName} on ${fDate}.`;
          return freeTeachers.map(t => `${t.name} (${t.department || 'No dept'}) â€” Teaches: ${t.teacherSubjects.map(ts => ts.subject.name).join(', ') || 'General'}`).join('\n');
        }

        case 'predictAbsences': {
          const { baseDate } = args;
          const { runPredictionEngine } = await import('@/lib/services/prediction-engine');
          const predictions = await runPredictionEngine(baseDate || today);
          if (predictions.length === 0) return 'No absence predictions found for upcoming days.';
          return predictions.map(p => `${p.teacherName} (${p.department || 'No dept'}) â€” Risk: ${p.riskScore}/100 on ${p.predictedDate} â€” Signals: ${p.signalsList?.map((s: any) => s.description).join('; ') || 'Various'}`).join('\n');
        }

        case 'getInsights': {
          const { date: iDate } = args;
          const insightsRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/substitutions/insights?date=${iDate}`);
          const insightsJson = await insightsRes.json();
          if (!insightsJson.success) return 'Failed to fetch insights.';
          const d = insightsJson.data;
          return `AI Confidence: ${d.aiConfidenceMetrics?.average || 'N/A'}% (${d.aiConfidenceMetrics?.total || 0} assignments)\nPeriod Heatmap: ${d.periodHeatmap?.map((p: any) => `${p.periodName}: ${p.absenceCount} absences`).join(', ') || 'No data'}\nTeachers at Risk: ${d.teachersAtRisk?.map((t: any) => t.teacherName).join(', ') || 'None'}\nDepartment Breakdown: ${d.departmentBreakdown?.map((dept: any) => `${dept.department}: ${dept.absentCount}/${dept.totalTeachers} absent`).join(', ') || 'No data'}`;
        }

        case 'getSubstitutionDetails': {
          const { requestId } = args;
          const sub = await db.substitutionRequest.findUnique({
            where: { id: requestId },
            include: {
              originalTeacher: true,
              subject: true,
              schedule: { include: { grade: true, section: true, timeSlot: true } },
              assignments: { include: { substituteTeacher: true } },
            },
          });
          if (!sub) return `Substitution request ${requestId} not found.`;
          const assignment = sub.assignments[0];
          return `Subject: ${sub.subject.name} | Grade: ${sub.schedule.grade.name} Sec ${sub.schedule.section.name}\nTime: ${sub.schedule.timeSlot.name} (${sub.schedule.timeSlot.startTime}-${sub.schedule.timeSlot.endTime}) on ${sub.date}\nOriginal: ${sub.originalTeacher.name} | Status: ${sub.status}\n${assignment ? `Substitute: ${assignment.substituteTeacher.name} (${assignment.substituteTeacher.department}) | Confidence: ${assignment.aiConfidence}% | Reasons: ${assignment.reasons || 'N/A'}` : 'No substitute assigned yet.'}`;
        }

        default:
          return `Unknown tool: ${name}`;
      }
    } catch (err: any) {
      return `Error executing ${name}: ${err.message}`;
    }
  }

  // â”€â”€ Main Chat Logic â”€â”€
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
5. If you don't have enough information, ask clarifying questions.
6. Show confidence levels when discussing AI recommendations.`;

    const chatMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    // First call - may include tool calls
    let response = await zai.chat.completions.create({
      messages: chatMessages,
      tools,
      tool_choice: 'auto',
    });

    let maxIterations = 5;
    while (maxIterations-- > 0) {
      const choice = response.choices[0];
      if (!choice) break;

      // If no tool calls, we're done
      if (!choice.message?.tool_calls || choice.message.tool_calls.length === 0) {
        break;
      }

      // Add assistant message with tool calls to chat history
      chatMessages.push(choice.message);

      // Execute each tool call
      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments || '{}');
        const result = await executeTool(toolCall.function.name, args);
        chatMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // Call again with tool results
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

