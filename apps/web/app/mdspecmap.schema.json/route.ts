import { NextResponse } from 'next/server'

const SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://mdspec.dev/mdspecmap.schema.json',
  title: '.mdspecmap',
  description:
    'mdspec configuration file. Governs the folder it lives in and all subfolders. Place one in any folder you want to sync.',
  type: 'object',
  required: ['version', 'mappings'],
  additionalProperties: false,
  properties: {
    version: {
      type: 'integer',
      const: 1,
      description: 'Schema version. Must always be 1.',
    },
    sync_all_on_first_run: {
      type: 'boolean',
      default: true,
      description:
        'Whether to publish all spec files on the very first run (before a ledger entry exists). Default true. Set false to publish only the files changed in the triggering commit on first run.',
    },
    sub_folders: {
      oneOf: [
        { type: 'boolean' },
        { type: 'array', items: { type: 'string' }, minItems: 1 },
      ],
      description:
        'Controls subfolder recursion. true or omitted = recursive; false = direct children only; string[] = recurse only into subfolders matching any listed glob.',
    },
    default: {
      type: 'object',
      description:
        'Fallback values applied to any mapping that omits the corresponding field.',
      additionalProperties: false,
      properties: {
        integration: {
          type: 'string',
          enum: ['notion', 'confluence', 'clickup', 's3', 'jira'],
          description: 'Fallback integration type.',
        },
        parent: {
          type: 'string',
          description:
            'Fallback parent. Four forms: alias:<name>, id:<nativeId>, link:<url>, or bare value.',
        },
        target: {
          type: 'string',
          enum: ['document', 'task'],
          description: 'Fallback ClickUp publish mode.',
        },
        agent: {
          type: 'string',
          description: 'Fallback agent template name.',
        },
      },
    },
    mappings: {
      type: 'array',
      description: 'Routes spec files in this folder to integrations.',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          integration: {
            type: 'string',
            enum: ['notion', 'confluence', 'clickup', 's3', 'jira'],
            description: 'Target integration.',
          },
          parent: {
            type: 'string',
            description:
              'Target container. Four forms: alias:<name>, id:<nativeId>, link:<url>, or bare value.',
          },
          target: {
            type: 'string',
            enum: ['document', 'task'],
            description: 'ClickUp publish mode. document (default) or task.',
          },
          depth: {
            type: 'integer',
            minimum: 1,
            description:
              'Max subfolder depth. 1 = direct children only. Omit for unlimited.',
          },
          maintain_hierarchy: {
            type: 'boolean',
            default: false,
            description:
              'S3 only. true preserves subfolder paths under the alias prefix. false (default) flattens to basename.',
          },
          skip: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Glob patterns for files to exclude. Matched against filename and path relative to this file.',
          },
          list_id: {
            type: 'string',
            description:
              'ClickUp list ID. Use id:<listId> prefix. Required when target: task.',
          },
          parent_doc: {
            type: 'string',
            description:
              'ClickUp doc that specs publish into as pages. Use id:<docId> prefix.',
          },
          space_id: {
            type: 'string',
            description: 'ClickUp space or folder ID. Use id:<spaceId> prefix.',
          },
          custom_task_ids: {
            type: 'boolean',
            description:
              'true to use ClickUp custom task IDs. task mode only.',
          },
          agent: {
            type: 'string',
            description:
              'Agent template name to apply before publishing. Must match a template in Dashboard → Map → Templates.',
          },
          frontmatter_map: {
            type: 'object',
            description:
              'Rename the frontmatter keys mdspec reads for id and title.',
            additionalProperties: false,
            properties: {
              id: {
                type: 'string',
                description: 'Frontmatter key to read as the native ID (default: "id").',
              },
              title: {
                type: 'string',
                description: 'Frontmatter key to read as the title (default: "title").',
              },
            },
          },
        },
      },
    },
    specs: {
      type: 'object',
      description:
        'Per-spec config keyed by repo-relative file path. Add an entry only when you need to override title, set an agent, or bind an existing remote record.',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: {
            type: 'string',
            description:
              'Page title in the target tool. Overrides H1 heading and filename derivation.',
          },
          agent: {
            type: 'string',
            description:
              'Agent template name for this spec only. Set to "none" to opt out of a folder-level agent.',
          },
          id: {
            type: 'string',
            description:
              'Native ID of an existing page, doc, or task. On first publish, mdspec adopts that record rather than creating a new one.',
          },
        },
      },
    },
  },
}

export function GET() {
  return new NextResponse(JSON.stringify(SCHEMA, null, 2), {
    headers: {
      'Content-Type': 'application/schema+json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
