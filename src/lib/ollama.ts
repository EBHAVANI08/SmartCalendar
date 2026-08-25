import Groq from 'groq-sdk';

const MODEL = 'llama-3.3-70b-versatile';

export const callZAIModel = async (prompt: string, systemPrompt?: string) => {
  const zaiApiKey = process.env.ZAI_API_KEY || 'ad316b40259049a1a1c570693fa9bc27.2kIgKkpgAcHIFt3S';
  const zaiApiKeyId = process.env.ZAI_API_KEY_ID || 'ad316b40259049a1a1c570693fa9bc27';

  // 1. Try Primary Groq LLM if key exists
  if (process.env.GROQ_API_KEY) {
    try {
      const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
          { role: 'user' as const, content: prompt },
        ],
        max_tokens: 4096,
      });
      return response.choices[0]?.message?.content || '';
    } catch (err) {
      console.warn('Primary LLM call failed, attempting Z-AI Fallback:', err);
    }
  }

  // 2. Fallback to Z-AI Engine
  try {
    const res = await fetch('https://api.z-ai.io/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${zaiApiKey}`,
        'X-API-Key-Id': zaiApiKeyId,
      },
      body: JSON.stringify({
        model: 'z-ai-pro',
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }
  } catch (err) {
    console.error('Z-AI API Fallback error:', err);
  }

  return '';
};

const ZAI = {
  async create() {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY || 'dummy' });
    return {
      chat: {
        completions: {
          async create(options: Parameters<typeof client.chat.completions.create>[0]) {
            try {
              if (process.env.GROQ_API_KEY) {
                return await client.chat.completions.create({
                  ...options,
                  model: options?.model ?? MODEL,
                  max_tokens: Math.min((options.max_tokens as number) ?? 4096, 32768),
                });
              }
            } catch (e) {
              console.warn('Primary LLM failed, using Z-AI fallback', e);
            }

            const prompt = options.messages.map(m => m.content).join('\n');
            const resultText = await callZAIModel(prompt);
            return {
              choices: [
                {
                  message: {
                    content: resultText || 'Automated AI Response generated via Z-AI Fallback Engine.',
                    role: 'assistant',
                  },
                },
              ],
            };
          },
        },
      },
    };
  },
};

export default ZAI;
