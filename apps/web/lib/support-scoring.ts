import Anthropic from '@anthropic-ai/sdk'
import type { CriticalityLabel } from '@/lib/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

interface ScoringResult {
  score: number
  label: CriticalityLabel
  reasoning: string
}

const SYSTEM_PROMPT = `You are a support ticket triage assistant. Given a support ticket, assign a criticality score from 1–10 and a label.

Scoring guidelines:
- 9–10 (critical): Data loss, corruption, complete platform outage
- 7–8 (high): Account/access lockout, billing issues, core feature completely broken with no workaround
- 4–6 (medium): Core feature degraded but workaround exists, performance issues affecting work
- 1–3 (low): UI/cosmetic issues, minor bugs, feature requests, questions

Respond with valid JSON only, no markdown, no extra text:
{"score": <integer 1-10>, "label": "<low|medium|high|critical>", "reasoning": "<1-2 sentences>"}`

export async function scoreTicket(
  title: string,
  category: string,
  body: string
): Promise<ScoringResult> {
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Title: ${title}\nCategory: ${category}\nDescription: ${body}`,
        },
      ],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('unexpected response type')

    const parsed = JSON.parse(content.text) as ScoringResult
    const score = Math.min(10, Math.max(1, Math.round(parsed.score)))
    const label = parsedLabel(score)

    return { score, label, reasoning: parsed.reasoning ?? '' }
  } catch {
    return { score: 5, label: 'medium', reasoning: '' }
  }
}

function parsedLabel(score: number): CriticalityLabel {
  if (score >= 9) return 'critical'
  if (score >= 7) return 'high'
  if (score >= 4) return 'medium'
  return 'low'
}
