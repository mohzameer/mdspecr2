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
