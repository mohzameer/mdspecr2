// Per-type template presets. v1 ships with two types: `wiki` (no transformation)
// and `task` (task template). Additional types in spec §3.2 are deferred.

export interface TemplatePreset {
  type: 'wiki' | 'task'
  name: string
  description: string
  instructions: string | null    // null = publish as-is (no agent transformation)
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    type: 'wiki',
    name: 'None (publish as-is)',
    description: 'Markdown is published unchanged. No agent transformation.',
    instructions: null,
  },
  {
    type: 'task',
    name: 'Task Template',
    description: 'Transforms a raw spec into a structured task document with acceptance criteria, dependencies, and open questions.',
    instructions: `You are a technical documentation agent. Transform the provided engineering spec into a structured task document.

Extract or generate the following sections from the spec:

## Background
Summarise the context and motivation for this task. Why is it being built? What problem does it solve?

## Acceptance Criteria
List clear, testable conditions that must be met for this task to be considered complete.

## Non-Functional Requirements
Extract any performance, scalability, security, or reliability constraints. If none are explicit, infer reasonable ones from context.

## Dependencies
List all external services, APIs, teams, or libraries this task depends on.

## Error Handling
Describe how errors should be handled — what fails, how it is surfaced, and how it recovers.

## Testing Plan
Describe how this task should be tested. Include unit tests, integration tests, and any manual verification steps needed to confirm the acceptance criteria are met.

## Open Questions
List any unresolved questions, ambiguities, or decisions not yet made.

Output clean markdown suitable for publishing to {{target_integration}}.`,
  },
]

export function getPresetForType(type: string): TemplatePreset | null {
  return TEMPLATE_PRESETS.find((p) => p.type === type) ?? null
}
