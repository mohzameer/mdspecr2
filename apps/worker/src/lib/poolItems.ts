export interface PoolItem {
  id: string
  label: string
  description: string
}

export const POOL_ITEMS: Record<string, PoolItem> = {
  acceptance_criteria: {
    id: 'acceptance_criteria',
    label: 'Acceptance Criteria',
    description: 'Conditions that must be met for the spec to be considered complete. List as clear, testable statements.',
  },
  non_functional_requirements: {
    id: 'non_functional_requirements',
    label: 'Non-Functional Requirements',
    description: 'Performance, scalability, security, and reliability constraints. Quantify where possible (latency targets, uptime SLAs, throughput).',
  },
  api_contract: {
    id: 'api_contract',
    label: 'API Contract',
    description: 'Endpoint definitions including HTTP method, path, request body shape, response shape, and relevant status codes.',
  },
  sequence_flow: {
    id: 'sequence_flow',
    label: 'Sequence Flow',
    description: 'Step-by-step interaction or process flow describing how components, services, or actors interact in order.',
  },
  error_handling: {
    id: 'error_handling',
    label: 'Error Handling',
    description: 'How errors are caught, surfaced to callers, logged, and recovered from. Include retry behaviour and fallback strategies.',
  },
  security_considerations: {
    id: 'security_considerations',
    label: 'Security Considerations',
    description: 'Authentication, authorisation, encryption, data handling, and any known threats or mitigations relevant to this spec.',
  },
  performance_benchmarks: {
    id: 'performance_benchmarks',
    label: 'Performance Benchmarks',
    description: 'Latency targets, throughput expectations, and SLA thresholds this implementation must meet.',
  },
  dependencies: {
    id: 'dependencies',
    label: 'Dependencies',
    description: 'External services, internal APIs, libraries, teams, or infrastructure this spec relies on to function.',
  },
  open_questions: {
    id: 'open_questions',
    label: 'Open Questions',
    description: 'Unresolved decisions, ambiguities, or items requiring further clarification before or during implementation.',
  },
}
