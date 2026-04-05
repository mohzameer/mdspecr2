/**
 * Assembles the final LLM prompt from a template's instructions,
 * the raw spec content, and the target integration name.
 *
 * {{target_integration}} in the instructions is replaced with the
 * integration type string. All other text is passed through as-is.
 */
export function buildPrompt(
  templateInstructions: string,
  specContent: string,
  targetIntegration: string
): string {
  const resolved = templateInstructions.replace(/\{\{target_integration\}\}/g, targetIntegration)

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
