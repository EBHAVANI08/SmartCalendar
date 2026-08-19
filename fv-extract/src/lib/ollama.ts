import Groq from 'groq-sdk';

const MODEL = 'llama-3.3-70b-versatile';

const ZAI = {
  async create() {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return {
      chat: {
        completions: {
          async create(options: Parameters<typeof client.chat.completions.create>[0]) {
            return client.chat.completions.create({
              model: MODEL,
              ...options,
              max_tokens: Math.min((options.max_tokens as number) ?? 4096, 32768),
            });
          },
        },
      },
    };
  },
};

export default ZAI;
