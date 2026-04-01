import { POOL_ITEMS } from './poolItems.js'

/**
 * Assembles the final LLM prompt from a template's instructions, the raw spec
 * content, and the target integration name.
 *
 * Pool item tokens like {{acceptance_criteria}} are replaced with their full
 * descriptions so the LLM understands what each section should contain.
 *
 * {{target_integration}} is replaced with the integration type string.
 */
export function buildPrompt(
  templateInstructions: string,
  specContent: string,
  targetIntegration: string
): string {
  // Resolve {{pool_item_id}} tokens
  let resolved = templateInstructions.replace(/\{\{(\w+)\}\}/g, (match, id) => {
    if (id === 'target_integration') return targetIntegration
    const item = POOL_ITEMS[id]
    return item ? item.label : match
  })

  // Safety: replace any remaining {{target_integration}} that weren't caught above
  resolved = resolved.replace(/\{\{target_integration\}\}/g, targetIntegration)

  return [
    resolved.trim(),
    '',
    '---',
    '',
    '## Spec Content',
    '',
    specContent.trim(),
  ].join('\n')
}
