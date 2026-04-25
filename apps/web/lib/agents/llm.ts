import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const MODEL = 'claude-haiku-4-5-20251001'

export async function callLLM(prompt: string): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system:
      'You are a technical documentation agent. Follow the instructions exactly. Output clean markdown only — no code fences around the entire output, no commentary outside the document.',
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text' || !content.text) throw new Error('LLM returned empty response')
  return content.text
}
