import { createSupabaseServiceClient } from '@/lib/db-server'
import { buildPrompt } from './prompt'
import { callLLM } from './llm'
import type { RunAgentJobData } from '@/lib/types'

export async function runAgentJob(
  data: RunAgentJobData,
  enqueuePublishJob: (jobData: object) => Promise<void>
): Promise<void> {
  const {
    spec_id,
    spec_publish_target_id,
    integration_id,
    project_id,
    template_id,
    trigger,
    raw_content,
    target_integration_type,
    agent_run_id,
  } = data

  const supabase = createSupabaseServiceClient()

  await supabase
    .from('agent_runs')
    .update({ status: 'running' })
    .eq('id', agent_run_id)

  let templateInstructions: string
  try {
    const { data: template, error } = await supabase
      .from('templates')
      .select('instructions')
      .eq('id', template_id)
      .single()

    if (error || !template) throw new Error(`Template ${template_id} not found`)
    templateInstructions = template.instructions
  } catch (err) {
    await supabase
      .from('agent_runs')
      .update({ status: 'failed', error: (err as Error).message, completed_at: new Date().toISOString() })
      .eq('id', agent_run_id)
    throw err
  }

  const prompt = buildPrompt(templateInstructions, raw_content, target_integration_type)
  const startMs = Date.now()

  let transformedContent: string
  try {
    transformedContent = await callLLM(prompt)
  } catch (err) {
    await supabase
      .from('agent_runs')
      .update({
        status: 'failed',
        error: (err as Error).message,
        duration_ms: Date.now() - startMs,
        completed_at: new Date().toISOString(),
      })
      .eq('id', agent_run_id)
    throw err
  }

  const durationMs = Date.now() - startMs

  await supabase
    .from('agent_runs')
    .update({
      status: 'completed',
      transformed_content: transformedContent,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    })
    .eq('id', agent_run_id)

  const { data: spec } = await supabase
    .from('specs')
    .select('path, frontmatter')
    .eq('id', spec_id)
    .single()

  await enqueuePublishJob({
    spec_id,
    spec_publish_target_id,
    integration_id,
    target_type: target_integration_type,
    project_id,
    content: transformedContent,
    path: spec?.path ?? '',
    frontmatter: { ...((spec?.frontmatter as Record<string, unknown>) ?? {}), _agent_processed: true },
    attempt: 0,
  })

  console.log(`[agent] ✓ ${trigger} — spec ${spec_id} transformed in ${durationMs}ms → publish enqueued`)
}
