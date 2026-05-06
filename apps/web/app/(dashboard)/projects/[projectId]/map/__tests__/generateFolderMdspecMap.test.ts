/**
 * Section 4.3 — Per-row .mdspecmap generator (client-side)
 * Used by the per-row download button in FolderMappingsTab.
 *
 * The matrix here mirrors the server-side generator's matrix in
 * config/__tests__/route.test.ts §2.4 — both must agree on the field
 * name used for `target_id` for each integration type.
 */
import { describe, it, expect } from 'vitest'
import {
  generateFolderMdspecMap,
  type FolderMappingForMap,
  type TemplateForMap,
} from '../generateFolderMdspecMap.js'

const NO_TEMPLATES: TemplateForMap[] = []

function baseMapping(overrides: Partial<FolderMappingForMap> = {}): FolderMappingForMap {
  return {
    folder_path: 'docs',
    integration_id: 'int1',
    template_id: null,
    target_id: null,
    clickup_mode: null,
    clickup_list_id: null,
    clickup_doc_id: null,
    clickup_use_custom_task_ids: null,
    skip_patterns: [],
    integrations: { type: 'clickup' },
    ...overrides,
  }
}

describe('4.3 generateFolderMdspecMap — header & integration line', () => {
  it('4.3.1 always emits version: 1 and mappings: header', () => {
    const out = generateFolderMdspecMap(baseMapping(), NO_TEMPLATES)
    expect(out).toMatch(/^version: 1$/m)
    expect(out).toMatch(/^mappings:$/m)
  })

  it('4.3.2 emits integration: <type> when integration is set', () => {
    const out = generateFolderMdspecMap(
      baseMapping({ integrations: { type: 'notion' } }),
      NO_TEMPLATES
    )
    expect(out).toContain('  - integration: notion')
  })

  it('4.3.3 emits a bare list dash when integration is missing', () => {
    const out = generateFolderMdspecMap(
      baseMapping({ integrations: null }),
      NO_TEMPLATES
    )
    expect(out).toMatch(/^  -$/m)
    expect(out).not.toContain('integration:')
  })
})

describe('4.3 generateFolderMdspecMap — target_id field name per integration', () => {
  it('4.3.4 ClickUp emits space_id: id:<target> for target_id', () => {
    const out = generateFolderMdspecMap(
      baseMapping({
        integrations: { type: 'clickup' },
        clickup_mode: 'doc',
        target_id: 'space:90187244544',
      }),
      NO_TEMPLATES
    )
    expect(out).toContain('    space_id: id:space:90187244544')
    expect(out).not.toContain('parent: id:')
    expect(out).not.toContain('parent_dir:')
  })

  it('4.3.5 Notion emits parent: id:<target> (NOT space_id) for target_id', () => {
    const out = generateFolderMdspecMap(
      baseMapping({
        integrations: { type: 'notion' },
        target_id: 'cc69bd0f-98d7-4d6e-8701-72d92a920cf5',
      }),
      NO_TEMPLATES
    )
    expect(out).toContain('    parent: id:cc69bd0f-98d7-4d6e-8701-72d92a920cf5')
    expect(out).not.toContain('space_id:')
    expect(out).not.toContain('parent_dir:')
  })

  it('4.3.6 Confluence emits parent: id:<target> for target_id', () => {
    const out = generateFolderMdspecMap(
      baseMapping({
        integrations: { type: 'confluence' },
        target_id: '12345',
      }),
      NO_TEMPLATES
    )
    expect(out).toContain('    parent: id:12345')
    expect(out).not.toContain('space_id:')
    expect(out).not.toContain('parent_dir:')
  })

  it('4.3.7 S3 emits parent_dir: <target> (no id: prefix) for target_id', () => {
    const out = generateFolderMdspecMap(
      baseMapping({
        integrations: { type: 's3' },
        target_id: 'eng-specs',
      }),
      NO_TEMPLATES
    )
    expect(out).toContain('    parent_dir: eng-specs')
    expect(out).not.toContain('space_id:')
    expect(out).not.toContain('parent: id:')
  })

  it('4.3.8 null target_id emits no target_id-style field for any integration', () => {
    for (const type of ['clickup', 'notion', 'confluence', 's3']) {
      const out = generateFolderMdspecMap(
        baseMapping({ integrations: { type }, target_id: null }),
        NO_TEMPLATES
      )
      expect(out, `${type} should not emit space_id`).not.toContain('space_id:')
      expect(out, `${type} should not emit parent_dir`).not.toContain('parent_dir:')
      expect(out, `${type} should not emit parent: id:`).not.toContain('parent: id:')
    }
  })
})

describe('4.3 generateFolderMdspecMap — ClickUp mode-specific fields', () => {
  it('4.3.9 doc mode with parent doc emits parent_doc: id:<id>', () => {
    const out = generateFolderMdspecMap(
      baseMapping({
        integrations: { type: 'clickup' },
        clickup_mode: 'doc',
        clickup_doc_id: '2kzm3ftx-5278',
      }),
      NO_TEMPLATES
    )
    expect(out).toContain('    parent_doc: id:2kzm3ftx-5278')
  })

  it('4.3.10 task_list mode emits target: task and list_id: id:<id>', () => {
    const out = generateFolderMdspecMap(
      baseMapping({
        integrations: { type: 'clickup' },
        clickup_mode: 'task_list',
        clickup_list_id: '901812098656',
      }),
      NO_TEMPLATES
    )
    expect(out).toContain('    target: task')
    expect(out).toContain('    list_id: id:901812098656')
  })

  it('4.3.11 custom_task_ids: true is emitted only when truthy', () => {
    const off = generateFolderMdspecMap(
      baseMapping({
        integrations: { type: 'clickup' },
        clickup_mode: 'task_list',
        clickup_use_custom_task_ids: false,
      }),
      NO_TEMPLATES
    )
    expect(off).not.toContain('custom_task_ids:')

    const on = generateFolderMdspecMap(
      baseMapping({
        integrations: { type: 'clickup' },
        clickup_mode: 'task_list',
        clickup_use_custom_task_ids: true,
      }),
      NO_TEMPLATES
    )
    expect(on).toContain('    custom_task_ids: true')
  })

  it('4.3.12 ClickUp-only fields are not emitted for non-ClickUp integrations', () => {
    const out = generateFolderMdspecMap(
      baseMapping({
        integrations: { type: 'notion' },
        clickup_mode: 'task_list',
        clickup_list_id: '901812098656',
        clickup_doc_id: '2kzm3ftx-5278',
        clickup_use_custom_task_ids: true,
      }),
      NO_TEMPLATES
    )
    expect(out).not.toContain('target: task')
    expect(out).not.toContain('list_id:')
    expect(out).not.toContain('parent_doc:')
    expect(out).not.toContain('custom_task_ids:')
  })
})

describe('4.3 generateFolderMdspecMap — agent template & skip patterns', () => {
  it('4.3.13 agent: <name> is emitted when template_id matches a template', () => {
    const out = generateFolderMdspecMap(
      baseMapping({ template_id: 'tpl1' }),
      [{ id: 'tpl1', name: 'Release Notes' }]
    )
    expect(out).toContain('    agent: Release Notes')
  })

  it('4.3.14 no agent line when template_id does not match', () => {
    const out = generateFolderMdspecMap(
      baseMapping({ template_id: 'unknown' }),
      [{ id: 'tpl1', name: 'Release Notes' }]
    )
    expect(out).not.toContain('agent:')
  })

  it('4.3.15 skip patterns are emitted as a bullet list', () => {
    const out = generateFolderMdspecMap(
      baseMapping({ skip_patterns: ['README.md', 'archive/*'] }),
      NO_TEMPLATES
    )
    expect(out).toContain('    skip:')
    expect(out).toContain('      - README.md')
    expect(out).toContain('      - archive/*')
  })

  it('4.3.16 empty skip patterns do not emit a skip block', () => {
    const out = generateFolderMdspecMap(
      baseMapping({ skip_patterns: [] }),
      NO_TEMPLATES
    )
    expect(out).not.toContain('skip:')
  })
})

describe('4.3 generateFolderMdspecMap — exact end-to-end snapshots', () => {
  it('4.3.17 Notion mapping with sub-page target produces clean YAML (regression)', () => {
    const out = generateFolderMdspecMap(
      baseMapping({
        folder_path: 'src/utils',
        integrations: { type: 'notion' },
        target_id: 'cc69bd0f-98d7-4d6e-8701-72d92a920cf5',
      }),
      NO_TEMPLATES
    )
    expect(out).toBe(
      'version: 1\n' +
      '\n' +
      'mappings:\n' +
      '  - integration: notion\n' +
      '    parent: id:cc69bd0f-98d7-4d6e-8701-72d92a920cf5\n'
    )
  })

  it('4.3.18 ClickUp task_list mapping with all fields', () => {
    const out = generateFolderMdspecMap(
      baseMapping({
        folder_path: 'src/utils',
        integrations: { type: 'clickup' },
        clickup_mode: 'task_list',
        clickup_list_id: '901812098656',
        target_id: 'space:90187244544',
        clickup_use_custom_task_ids: true,
        skip_patterns: ['archive/*'],
        template_id: 'tpl1',
      }),
      [{ id: 'tpl1', name: 'Task Template' }]
    )
    expect(out).toBe(
      'version: 1\n' +
      '\n' +
      'mappings:\n' +
      '  - integration: clickup\n' +
      '    target: task\n' +
      '    list_id: id:901812098656\n' +
      '    space_id: id:space:90187244544\n' +
      '    custom_task_ids: true\n' +
      '    agent: Task Template\n' +
      '    skip:\n' +
      '      - archive/*\n'
    )
  })

  it('4.3.19 S3 mapping with parent_dir', () => {
    const out = generateFolderMdspecMap(
      baseMapping({
        folder_path: 'src',
        integrations: { type: 's3' },
        target_id: 'eng-specs',
      }),
      NO_TEMPLATES
    )
    expect(out).toBe(
      'version: 1\n' +
      '\n' +
      'mappings:\n' +
      '  - integration: s3\n' +
      '    parent_dir: eng-specs\n'
    )
  })
})
