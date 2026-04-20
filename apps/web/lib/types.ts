// ---------------------------------------------------------------------------
// Shared payload types — used by web API routes and imported by worker
// ---------------------------------------------------------------------------

export type OrgRole = 'owner' | 'admin' | 'member'
export type ProjectRole = 'admin' | 'member' | 'viewer'
export type IntegrationType = 'notion' | 'confluence' | 'clickup'
export type IntegrationStatus = 'connected' | 'unhealthy' | 'disconnected'
export type PublishStatus = 'queued' | 'published' | 'failed'
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

// ---------------------------------------------------------------------------
// .mdspecmap config — parsed by CLI, sent in publish payload
// ---------------------------------------------------------------------------

export interface MdspecMapMapping {
  folder?: string                    // repo-relative path; absent = scope root of the owning .mdspecmap file
  integration?: string
  target?: 'document' | 'task'
  parent?: string                    // alias:<name> | id:<nativeId> | bare
  skip?: string[]
  depth?: number                     // max folder depth to sync (1 = direct children only)
  list_id?: string                   // id:<clickupListId> — task_list mode
  parent_doc?: string                // id:<clickupDocId> — specs publish as pages inside this doc
  space_id?: string                  // id:<clickupSpaceOrFolderId> — target space/folder (omit for workspace root)
  custom_task_ids?: boolean          // use ClickUp custom task IDs
  agent?: string                     // agent template name
}

export interface MdspecMapSpecEntry {
  title?: string
  agent?: string                     // template name or 'none'
  id?: string                        // native ID in the target tool to adopt on first publish
}

export interface MdspecMapDefault {
  integration?: string
  parent?: string
  target?: 'document' | 'task'
  agent?: string
}

export interface MdspecMapConfig {
  version: 1
  sync_all_on_first_run?: boolean    // default false
  sub_folders?: boolean              // default true — false restricts scope to immediate folder only
  default?: MdspecMapDefault         // fallback for mappings missing integration/parent
  mappings: MdspecMapMapping[]
  specs?: Record<string, MdspecMapSpecEntry>   // keyed by file path
}

// ---------------------------------------------------------------------------
// CLI → API publish payload
// ---------------------------------------------------------------------------

export interface SpecArtifact {
  path: string
  previous_path?: string             // set on rename (git R status)
  hash: string
  title: string                      // resolved by CLI: specs[path].title > H1 > filename
  id_ref?: string                    // resolved from specs[path].id
  agent?: string                     // resolved from specs[path].agent or folder mapping
  content: string
}

export interface PublishPayload {
  project_id: string
  repo_name: string
  branch: string
  commit_sha: string
  commit_timestamp: number           // unix timestamp from git log
  specs: SpecArtifact[]
  config: MdspecMapConfig            // parsed .mdspecmap — always required
}

// ---------------------------------------------------------------------------
// QStash job data shapes
// ---------------------------------------------------------------------------

// A single spec inside a group job. The group carries shared context
// (integration, project, target_type) at the top level.
export interface PublishGroupSpec {
  spec_id: string
  spec_publish_target_id: string
  path: string
  title: string
  id_ref?: string
  content: string
  content_hash: string
  frontmatter: Record<string, unknown>
}

// All specs in a group share the same (integration_id, immediateParent).
// The worker resolves folder-mapping state once and processes specs sequentially,
// eliminating cross-worker races on shared ClickUp folder docs.
export interface PublishGroupJobData {
  project_id: string
  integration_id: string
  target_type: IntegrationType
  specs: PublishGroupSpec[]
  clickup_mode?: 'doc' | 'task_list'
  matched_folder?: string  // the folder path that was matched for this group (longest-prefix)
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
  spec_dirs: string[]
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
  credentials: string
  config: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface Spec {
  id: string
  project_id: string
  repo: string
  path: string
  mdspec_id: string | null
  commit_sha: string
  content_hash: string
  title: string
  frontmatter: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface SpecPublishTarget {
  id: string
  spec_id: string
  integration_id: string
  target_type: IntegrationType
  external_page_id: string | null
  external_url: string | null
  status: PublishStatus
  retry_count: number
  last_error: string | null
  published_at: string | null
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

export interface FolderMapping {
  id: string
  project_id: string
  folder_path: string
  integration_id: string
  template_id: string | null
  skip_patterns: string[]
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
export type AgentRunTrigger = 'folder_mapping' | 'frontmatter'

export interface AgentRun {
  id: string
  spec_id: string
  template_id: string | null
  trigger: AgentRunTrigger
  raw_content: string
  transformed_content: string | null
  status: AgentRunStatus
  error: string | null
  duration_ms: number | null
  created_at: string
  completed_at: string | null
}
