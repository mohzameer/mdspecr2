export interface TemplatePreset {
  id: string
  name: string
  description: string
  bestFor: string
  instructions: string
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: 'task_template',
    name: 'Task Template',
    description: 'Transforms a raw spec into a structured task-ready document with acceptance criteria, dependencies, open questions.',
    bestFor: 'Jira/ClickUp task descriptions, sprint planning',
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
  {
    id: 'adr_template',
    name: 'ADR Template',
    description: 'Transforms a spec or RFC into a formal Architecture Decision Record — context, decision, consequences, alternatives considered.',
    bestFor: 'Architecture wikis, Confluence, Notion',
    instructions: `You are a technical documentation agent. Transform the provided spec into a formal Architecture Decision Record (ADR).

## Status
Proposed

## Context
Summarise the problem or situation that necessitates this decision. What forces are at play?

## Decision
State the decision that was made or is being proposed. Be direct and specific.

## Acceptance Criteria
List the criteria that must be met for this decision to be considered successfully implemented.

## Consequences
Describe the resulting context after applying the decision — both positive and negative outcomes.

## Alternatives Considered
List the alternatives that were evaluated and why each was rejected.

## Security Considerations
Extract or infer any security implications of this decision — auth, data handling, encryption, threat model.

## Open Questions
List any unresolved questions that reviewers should focus on.

Output clean markdown suitable for publishing to {{target_integration}}.`,
  },
  {
    id: 'api_reference_template',
    name: 'API Reference Template',
    description: 'Extracts and structures all API-related content — endpoints, request/response shapes, auth, error codes, rate limits.',
    bestFor: 'Developer portals, Notion, Confluence',
    instructions: `You are a technical documentation agent. Transform the provided spec into a clean, structured API reference document.

## Overview
One paragraph describing what this API does and who it is for.

## Endpoints
For each endpoint, document:
- Method and path
- Description
- Request headers
- Request body with field names, types, and whether required
- Response body with field names and types
- Status codes and their meanings
- Example request and response

## Authentication
Describe the authentication mechanism, token format, and how to include credentials in requests.

## Error Handling
List all error codes this API can return, their meaning, and how callers should handle them.

## Rate Limits
Document any rate limiting — requests per second or minute, retry behaviour, backoff strategy.

## Performance Expectations
Document latency SLAs, throughput targets, and availability guarantees.

Output clean markdown suitable for publishing to {{target_integration}}.`,
  },
  {
    id: 'rfc_template',
    name: 'RFC Template',
    description: 'Structures a raw spec as a formal RFC — problem statement, proposed solution, alternatives, security implications, open questions, stakeholder sign-off.',
    bestFor: 'Engineering review processes',
    instructions: `You are a technical documentation agent. Transform the provided spec into a formal Request for Comments (RFC) document.

## Summary
One paragraph executive summary of what is being proposed and why.

## Problem Statement
Describe the problem being solved. What is the current state? What pain does this address?

## Proposed Solution
Describe the proposed solution in detail. Include architecture decisions, data flows, and implementation approach.

## API Surface
If applicable, document the API endpoints or interfaces this proposal introduces or modifies.

## Sequence Flow
Describe the step-by-step flow of the proposed system or process.

## Alternatives Considered
List alternatives that were evaluated. For each, explain why it was not chosen.

## Security Considerations
Describe authentication, authorisation, data handling, and threat model implications.

## Non-Functional Requirements
Performance, scalability, reliability, and operational requirements.

## Dependencies
List all teams, services, and systems this proposal depends on or affects.

## Open Questions
List unresolved questions that reviewers should focus on.

## Stakeholder Sign-off
| Stakeholder | Role | Status |
|-------------|------|--------|
| | | Pending |

Output clean markdown suitable for publishing to {{target_integration}}.`,
  },
  {
    id: 'onboarding_doc_template',
    name: 'Onboarding Doc Template',
    description: 'Rewrites a technical spec as a human-readable onboarding document for new engineers. Strips jargon, adds context, explains the why not just the what.',
    bestFor: 'Team wikis, Notion',
    instructions: `You are a technical documentation agent. Rewrite the provided spec as a friendly, clear onboarding document for a new engineer joining the team.

Use plain language. Avoid unnecessary jargon. Explain the "why" behind decisions, not just the "what". Assume the reader is a competent engineer but unfamiliar with this codebase or domain.

## What Is This?
A plain English explanation of what this system, feature, or service does and why it exists.

## Why It Was Built This Way
The key design decisions and the reasoning behind them.

## How It Works
A walkthrough of the main flow or process.

## Key Concepts
Define any domain-specific terms, abbreviations, or concepts a new engineer needs to know.

## External Dependencies
What external systems, services, or teams does this interact with? What should a new engineer know about each?

## Common Tasks
List the most common things an engineer working on this will need to do — deploy, debug, add a feature.

## Gotchas
Known quirks, footguns, or non-obvious behaviour to be aware of.

## Open Questions
Known gaps or things still being figured out.

Output clean markdown suitable for publishing to {{target_integration}}.`,
  },
  {
    id: 'security_review_template',
    name: 'Security Review Template',
    description: 'Focuses entirely on the security surface — auth flows, data handling, encryption, threat vectors, compliance considerations.',
    bestFor: 'Security team review, compliance audits',
    instructions: `You are a technical documentation agent specialising in security. Transform the provided spec into a structured security review document.

## Executive Summary
A brief summary of the feature or system being reviewed and its overall security risk level — Low, Medium, or High.

## Authentication and Authorisation
How are users or services authenticated? What authorisation model is used? Are there privilege escalation risks?

## API Security
Document all API endpoints from a security perspective — which are authenticated, which are public, what data they expose.

## Data Handling
What data is collected, stored, and transmitted? Is any data PII or subject to compliance requirements such as GDPR or SOC2? How long is data retained?

## Encryption
Is data encrypted in transit with TLS? Is data encrypted at rest? How are encryption keys managed?

## Threat Model
List the main threat vectors — what could an attacker do and how is each mitigated?

## Error Handling
Are errors handled in a way that avoids leaking sensitive information?

## Compliance Considerations
List any regulatory or compliance requirements relevant to this spec and whether they are addressed.

## Recommendations
List specific security improvements or issues that must be addressed before shipping.

Output clean markdown suitable for publishing to {{target_integration}}.`,
  },
  {
    id: 'release_notes_template',
    name: 'Release Notes Template',
    description: 'Transforms a spec into customer or internal release notes — what changed, why it changed, impact, migration steps if any.',
    bestFor: 'Changelog, ClickUp docs, Notion',
    instructions: `You are a technical documentation agent. Transform the provided spec into clear, well-structured release notes. Write for both internal engineering teams and external customers or stakeholders.

## Summary
One sentence: what shipped and why it matters.

## What Changed
A bulleted list of the specific changes introduced. Be concrete — name the features, endpoints, or behaviours that changed.

## Why It Changed
Brief context on the motivation — user feedback, technical debt, compliance, performance improvement.

## Impact
Who is affected? Is this a breaking change? Are there any behaviour changes users or integrators need to be aware of?

## Migration Steps
If this is a breaking change or requires action from users, list the exact steps they need to take. If no migration is needed, state: "No action required."

## Performance Improvements
Note any performance, reliability, or scalability improvements included in this release.

## Known Issues
List any known limitations or issues in this release that will be addressed in a follow-up.

Output clean markdown suitable for publishing to {{target_integration}}.`,
  },
  {
    id: 'sprint_brief_template',
    name: 'Sprint Brief Template',
    description: 'Condenses a full spec into a short sprint brief — one paragraph summary, key deliverables, definition of done, blockers.',
    bestFor: 'Sprint ceremonies, team standup context',
    instructions: `You are a technical documentation agent. Condense the provided spec into a concise sprint brief. This document should be readable in under two minutes.

## What We're Building
One paragraph. Plain language. What is the deliverable this sprint?

## Key Deliverables
A short bulleted list of 3 to 6 concrete outputs expected by end of sprint.

## Acceptance Criteria
The specific, testable criteria that define done for this sprint's work.

## Definition of Done
- [ ] Code reviewed and merged
- [ ] Tests passing
- [ ] Deployed to staging
- [ ] Acceptance criteria verified
- [ ] Documentation updated

## Dependencies
What do we need from other teams or systems before we can complete this sprint?

## Blockers and Risks
List anything that could prevent completion. Flag items that need immediate resolution.

## Open Questions
Questions that need answers before or during the sprint.

Output clean markdown suitable for publishing to {{target_integration}}.`,
  },
  {
    id: 'data_model_template',
    name: 'Data Model Template',
    description: 'Extracts and structures all data-related content — entities, relationships, field definitions, constraints, indexes.',
    bestFor: 'Database documentation, schema wikis',
    instructions: `You are a technical documentation agent. Transform the provided spec into a structured data model reference document.

## Overview
What data does this system manage? What is the high-level domain model?

## Entities
For each entity or table, document:
- Name and purpose
- Fields: name, type, nullable, default, description
- Primary key
- Unique constraints
- Check constraints

## Relationships
Describe the relationships between entities — one-to-many, many-to-many, one-to-one. Include foreign key constraints and cascade behaviour on delete and update.

## Indexes
List all indexes beyond the primary key — fields indexed, index type, and the query pattern it supports.

## Data Volume and Retention
Document expected data volume, retention policies, and archival strategy.

## Security and Access Control
Which fields contain sensitive or PII data? How is access controlled at the data layer?

## Migration Notes
If this is a change to an existing schema, describe the migration strategy — backward compatibility, zero-downtime approach, rollback plan.

## Open Questions
Unresolved schema decisions or areas needing further design.

Output clean markdown suitable for publishing to {{target_integration}}.`,
  },
]
