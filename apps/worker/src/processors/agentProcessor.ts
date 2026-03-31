import { Job } from 'bullmq'
import { createWorkerSupabaseClient } from '../lib/supabase.js'

interface RunAgentJobData {
  spec_id: string
  project_id: string
  template: 'full_publish' | 'task_summary' | 'release_notes'
}

interface TaskSummaryJobData {
  spec_id: string
  task_id: string
  target_type: string
}

type AgentJobData = RunAgentJobData | TaskSummaryJobData

function isRunAgentJob(data: AgentJobData): data is RunAgentJobData {
  return 'template' in data
}

export async function agentProcessor(job: Job<AgentJobData>): Promise<void> {
  if (isRunAgentJob(job.data)) {
    await runAgentTemplate(job.data)
  } else {
    await runTaskSummary(job.data)
  }
}

async function runAgentTemplate(data: RunAgentJobData): Promise<void> {
  const { spec_id, project_id, template } = data
  const supabase = createWorkerSupabaseClient()

  const { data: spec } = await supabase
    .from('specs')
    .select('content, path, frontmatter')
    .eq('id', spec_id)
    .single()

  if (!spec) {
    console.error(`[agent] spec ${spec_id} not found`)
    return
  }

  switch (template) {
    case 'full_publish':
      // Passthrough — the spec was already published via the publish queue
      console.log(`[agent] full_publish passthrough for spec ${spec_id}`)
      break

    case 'task_summary': {
      const summary = generateSummary(spec.content)
      console.log(`[agent] task_summary for spec ${spec_id}:\n${summary}`)
      // In a full implementation, this would post the summary to the linked task
      break
    }

    case 'release_notes': {
      const notes = generateReleaseNotes(spec.content, spec.path)
      console.log(`[agent] release_notes for spec ${spec_id}:\n${notes}`)
      // In a full implementation, this would be published to a release notes page
      break
    }
  }
}

async function runTaskSummary(data: TaskSummaryJobData): Promise<void> {
  const { spec_id, task_id, target_type } = data
  const supabase = createWorkerSupabaseClient()

  const { data: spec } = await supabase
    .from('specs')
    .select('content, path')
    .eq('id', spec_id)
    .single()

  if (!spec) return

  const summary = generateSummary(spec.content)
  console.log(`[agent] task_summary for task ${task_id} (${target_type}): ${summary}`)
  // Future: post summary as task comment via target integration API
}

function generateSummary(content: string): string {
  // Extract headings as bullet points + first paragraph
  const lines = content.split('\n').filter((l) => l.trim())
  const headings = lines.filter((l) => l.startsWith('#')).map((l) => l.replace(/^#+\s+/, '• '))
  const firstPara = lines.find((l) => !l.startsWith('#') && l.trim().length > 20) ?? ''

  const parts: string[] = []
  if (firstPara) parts.push(firstPara.slice(0, 300))
  if (headings.length) parts.push('\nKey sections:\n' + headings.slice(0, 8).join('\n'))

  return parts.join('\n\n')
}

function generateReleaseNotes(content: string, path: string): string {
  const lines = content.split('\n')
  const title = path.split('/').pop()?.replace(/\.md$/, '').replace(/[-_]/g, ' ') ?? 'Release Notes'
  const h2Sections = lines.filter((l) => l.startsWith('## ')).map((l) => `- ${l.slice(3)}`)

  return `## ${title}\n\n${h2Sections.join('\n')}`
}
