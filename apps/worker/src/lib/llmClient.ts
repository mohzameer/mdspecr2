import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_BASE_URL ?? undefined,
  timeout: 30_000,
})

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'

/**
 * Calls the LLM with the assembled prompt and returns the transformed markdown.
 * Throws on timeout or API error — BullMQ will handle retries.
 */
export async function callLLM(prompt: string): Promise<string> {
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are a technical documentation agent. Follow the instructions exactly. Output clean markdown only — no code fences around the entire output, no commentary outside the document.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.2,
  })

  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('LLM returned empty response')
  return content
}
