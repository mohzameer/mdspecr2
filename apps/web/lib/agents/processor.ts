import type { SupabaseClient } from '@supabase/supabase-js'
import { buildPrompt } from './prompt'
import { callLLM } from './llm'
import type { IntegrationType } from '@/lib/types'

// Runs the agent inline (no QStash hop). Inserts an agent_runs row, calls the
// LLM, persists the transformed content, and returns it to the caller so the
// same worker invocation can continue straight into the publish step.
export async function runAgentInline(
  supabase: SupabaseClient,
  specId: string,
  templateId: string,
  rawContent: string,
  targetIntegrationType: IntegrationType
): Promise<string> {
  const { data: agentRun, error: insertError } = await supabase
    .from('agent_runs')
    .insert({
      spec_id: specId,
      template_id: templateId,
      raw_content: rawContent,
      status: 'running',
    })
    .select('id')
    .single()

  if (insertError || !agentRun) {
    throw new Error(`Failed to create agent_run record: ${insertError?.message ?? 'unknown'}`)
  }

  const startMs = Date.now()

  try {
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select('instructions')
      .eq('id', templateId)
      .single()

    if (templateError || !template) {
      throw new Error(`Template ${templateId} not found`)
    }

    const prompt = buildPrompt(template.instructions, rawContent, targetIntegrationType)
    const transformed = await callLLM(prompt)

    await supabase
      .from('agent_runs')
      .update({
        status: 'completed',
        transformed_content: transformed,
        duration_ms: Date.now() - startMs,
        completed_at: new Date().toISOString(),
      })
      .eq('id', agentRun.id)

    console.log(`[agent] ok — spec ${specId} transformed in ${Date.now() - startMs}ms`)
    return transformed
  } catch (err) {
    await supabase
      .from('agent_runs')
      .update({
        status: 'failed',
        error: (err as Error).message,
        duration_ms: Date.now() - startMs,
        completed_at: new Date().toISOString(),
      })
      .eq('id', agentRun.id)
    throw err
  }
}
