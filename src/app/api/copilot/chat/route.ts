import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { messages, date: dateParam } = await request.json();
    const today = dateParam || new Date().toISOString().split('T')[0];

    const zai = await ZAI.create();

    const systemPrompt = `You are an AI Co-Pilot for SmartCalendar school substitution management system.
Current date: ${today}. Answer questions about schedules, absences, and substitutions using school data.`;

    const chatMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    const response = await zai.chat.completions.create({
      messages: chatMessages,
    });

    const finalContent = response.choices[0]?.message?.content || 'I could not process that request.';

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
