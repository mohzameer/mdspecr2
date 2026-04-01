import { Job } from 'bullmq'
import { createWorkerSupabaseClient } from '../lib/supabase.js'
import { buildPrompt } from '../lib/promptBuilder.js'
import { callLLM } from '../lib/llmClient.js'
import { publishQueue } from '../lib/queue.js'

interface RunAgentJobData {
  spec_id: string
  spec_publish_target_id: string
  integration_id: string
  project_id: string
  template_id: string
  trigger: 'folder_mapping' | 'frontmatter'
  raw_content: string
  target_integration_type: string
  agent_run_id: string
}

export async function agentProcessor(job: Job<RunAgentJobData>): Promise<void> {
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
  } = job.data

  const supabase = createWorkerSupabaseClient()

  // Mark run as in-progress
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
    const message = (err as Error).message
    await supabase
      .from('agent_runs')
      .update({
        status: 'failed',
        error: message,
        duration_ms: Date.now() - startMs,
        completed_at: new Date().toISOString(),
      })
      .eq('id', agent_run_id)
    throw err
  }

  const durationMs = Date.now() - startMs

  // Mark run complete
  await supabase
    .from('agent_runs')
    .update({
      status: 'completed',
      transformed_content: transformedContent,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    })
    .eq('id', agent_run_id)

  // Fetch the spec row we need for the downstream publish job
  const { data: spec } = await supabase
    .from('specs')
    .select('path, frontmatter')
    .eq('id', spec_id)
    .single()

  // Enqueue publish job with the transformed content
  await publishQueue.add(`publish-agent:${spec_id}:${integration_id}`, {
    spec_id,
    spec_publish_target_id,
    integration_id,
    target_type: target_integration_type,
    project_id,
    content: transformedContent,
    path: spec?.path ?? '',
    frontmatter: (spec?.frontmatter as Record<string, unknown>) ?? {},
    attempt: 0,
  })

  console.log(`[agent] ✓ ${trigger} — spec ${spec_id} transformed in ${durationMs}ms → publish enqueued`)
}
