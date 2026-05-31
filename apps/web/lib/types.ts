// ---------------------------------------------------------------------------
// Shared payload types — used by web API routes and imported by worker
// ---------------------------------------------------------------------------

export type OrgRole = 'owner' | 'admin' | 'member'
export type ProjectRole = 'admin' | 'member' | 'viewer'
export type IntegrationType = 'notion' | 'confluence' | 'clickup' | 's3' | 'jira'
export type IntegrationStatus = 'connected' | 'unhealthy' | 'disconnected'
export type PublishStatus = 'queued' | 'published' | 'failed'
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

// ---------------------------------------------------------------------------
// CLI → API publish payload + QStash job data shapes
// (rewritten in step 3a/3b/3c — placeholders here so other files keep their imports)
// ---------------------------------------------------------------------------

export interface SpecArtifact {
  path: string
  id: string                         // frontmatter.id or file path (per spec §6.4)
  type: string | null                // null = use project default_type
  integration: string | null         // null = use project default_integration
  parent: string | null              // alias, native ID, URL, or null
  content: string
  hash: string
  frontmatter: Record<string, unknown>
}

export interface PublishPayload {
  project_id: string
  repo_name: string
  branch: string
  commit_sha: string
  commit_timestamp: number
  specs: SpecArtifact[]
}

// Replaces PublishGroupJobData. Each spec is a self-contained job — no per-folder
// grouping (no shared ClickUp section doc concept after the pivot).
export interface PublishJobData {
  project_id: string
  integration_id: string
  target_type: IntegrationType
  spec_id: string
  spec_path: string
  spec_native_id: string
  spec_type: string
  content: string
  content_hash: string
  parent_id: string | null
  agent_template: string | null
  commit_sha: string
  sync_run_id?: string
}

// ---------------------------------------------------------------------------
// Database row types (mirrors Supabase schema exactly)
// ---------------------------------------------------------------------------

export interface Organization {
  id: string
  name: string
  created_at: string
}

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  created_at: string
}

export interface OrgInvite {
  id: string
  org_id: string
  invited_by: string
  email: string
  role: Exclude<OrgRole, 'owner'>
  token_hash: string
  status: InviteStatus
  expires_at: string
  created_at: string
}

export interface Project {
  id: string
  org_id: string
  name: string
  description: string | null
  registered_repo: string | null
  default_integration: IntegrationType | null
  default_type: 'wiki' | 'task'
  publish_count: number
  created_at: string
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: ProjectRole
  created_at: string
}

export interface ProjectToken {
  id: string
  project_id: string
  token_hash: string
  token_hint: string
  revoked: boolean
  created_by: string
  created_at: string
  revoked_at: string | null
}

export interface Integration {
  id: string
  org_id: string
  type: IntegrationType
  status: IntegrationStatus
  credentials_secret_id: string | null
  config: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface Spec {
  id: string
  project_id: string
  path: string
  spec_id: string                  // frontmatter.id or file path
  type: string                     // 'wiki' | 'task' (v1)
  commit_sha: string
  content_hash: string
  frontmatter: Record<string, unknown> | null
  deleted_from_repo: boolean
  created_at: string
  updated_at: string
}

export interface SpecPublishTarget {
  id: string
  spec_id: string
  integration_id: string
  external_id: string | null
  external_page_id: string | null
  external_url: string | null
  status: PublishStatus
  retry_count: number
  last_error: string | null
  content_hash: string | null
  published_at: string | null
  updated_at: string
}

export type OrgPlan = 'free' | 'pro'
export type BillingPeriod = 'monthly' | 'yearly'
export type SubscriptionStatus = 'active' | 'cancelled' | 'payment_failed'

export interface Subscription {
  id: string
  user_id: string
  plan: OrgPlan
  billing_period: BillingPeriod | null
  paddle_subscription_id: string | null
  paddle_customer_id: string | null
  status: SubscriptionStatus
  current_period_start: string | null
  current_period_end: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export interface BillingEvent {
  id: string
  user_id: string
  event_type: string
  paddle_event_id: string
  payload: Record<string, unknown>
  created_at: string
}

export interface Template {
  id: string
  project_id: string
  name: string
  description: string | null
  instructions: string
  is_default: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Alias {
  id: string
  org_id: string
  integration_id: string
  name: string
  native_id: string
  native_url: string | null
  display_name: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type AgentRunStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface AgentRun {
  id: string
  spec_id: string
  template_id: string | null
  raw_content: string
  transformed_content: string | null
  status: AgentRunStatus
  error: string | null
  duration_ms: number | null
  created_at: string
  completed_at: string | null
}
