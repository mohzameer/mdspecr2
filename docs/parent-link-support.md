# Parent Link Support in `.mdspecmap`

Developers editing `.mdspecmap` in their editor can now use a full browser URL as the `parent` value instead of a raw ID or alias name. The CLI extracts the native ID from the URL at publish time.

---

## Prefix System

The `parent` field supports three explicit prefixes and one bare fallback:

| Syntax | Meaning |
|---|---|
| `alias:eng-docs` | Resolve via the org's alias registry (existing) |
| `id:90181844797` | Use as raw native ID directly (existing) |
| `link:https://...` | Extract native ID from URL at publish time (new) |
| `eng-docs` | Bare value — treated as alias (existing, unchanged) |

---

## Usage

```yaml
mappings:
  # alias — existing, unchanged
  - folder: docs/specs
    integration: notion
    parent: alias:eng-docs

  # raw id — existing, unchanged
  - folder: docs/tasks
    integration: clickup
    parent: id:90181844797

  # link — new: paste the browser URL directly
  - folder: docs/api
    integration: notion
    parent: link:https://www.notion.so/my-workspace/Engineering-Docs-abc123def456abc123def456abc12345

  - folder: docs/confluence
    integration: confluence
    parent: link:https://acme.atlassian.net/wiki/spaces/ENG/pages/123456/Platform+Docs

  - folder: docs/tasks
    integration: clickup
    parent: link:https://app.clickup.com/90181234/v/s/90181844797
```

---

## Extraction Rules

### Notion

URL shape: `https://www.notion.so/[workspace/]<title>-<id>` or `https://www.notion.so/<id>`

The ID is always the last path segment. It is either a 32-char hex string (`abc123...`) or a UUID with hyphens (`abc123de-f456-...`). Both forms are normalised to the 32-char hex before use.

```
https://notion.so/my-workspace/Engineering-Docs-abc123def456abc123def456abc12345
                                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  extracted
https://notion.so/abc123def456abc123def456abc12345
                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  extracted
```

**Does not extract from**: Notion database view URLs that contain a `?v=` query param pointing to a view ID — the page ID is still in the path segment before the query string and is extracted correctly.

---

### Confluence Cloud

URL shape: `https://<domain>.atlassian.net/wiki/spaces/<SPACEKEY>/pages/<pageId>/...`

The numeric `pageId` is extracted from the fixed fourth path segment after `/wiki/`.

```
https://acme.atlassian.net/wiki/spaces/ENG/pages/123456/Platform+Docs
                                                  ^^^^^^  extracted
```

**Does not extract from**: Confluence Data Center URLs (`/display/SPACEKEY/Page+Title`). These contain no page ID in the URL. The CLI will hard-fail with a message directing the user to use `id:` instead (see Failure Behaviour below).

---

### ClickUp

Three supported URL patterns:

| Pattern | URL shape | Extracted segment |
|---|---|---|
| Space | `.../v/s/<spaceId>` | `<spaceId>` |
| List | `.../li/<listId>` | `<listId>` |
| Doc | `.../docs/<docId>` | `<docId>` |

```
https://app.clickup.com/90181234/v/s/90181844797   →  90181844797  (space)
https://app.clickup.com/90181234/li/901812098656   →  901812098656 (list)
https://app.clickup.com/90181234/docs/abc123xyz    →  abc123xyz    (doc)
```

Patterns are matched in the order above. First match wins.

---

## Failure Behaviour

If a `link:` value is provided but the CLI cannot extract an ID from it, the publish is **hard-blocked** — no specs are sent. The error is logged with the specific URL, the reason extraction failed, and the corrective action.

### Example: Confluence Data Center URL

```
✗ Error   Cannot extract a page ID from:
          link:https://acme.atlassian.net/display/ENG/Auth+Flow

          Confluence Data Center URLs (/display/...) do not contain a page ID.
          Go to the page → ··· → Page Information and copy the numeric Page ID
          from the URL bar, then use:
          parent: id:<pageId>
```

### Example: Unrecognised URL shape

```
✗ Error   Cannot extract a native ID from:
          link:https://notion.so/some/unexpected/path

          The URL did not match any known Notion page pattern.
          Paste the URL directly from the page in your browser, or use:
          parent: id:<nativeId>
```

No partial publishes. Fix the `parent` value, push again.

---

## What Is Not Supported

- **S3** — S3 parents are plain key prefixes (e.g. `docs/specs/`), not opaque IDs. The user types the prefix directly; there is no URL to extract from. `link:` is not applicable to S3 mappings.
- **Short links** (`notion.so/xyz`, ClickUp share links) — these redirect to the real URL but the ID is not in the short-link path. The CLI does not follow redirects. Use the full browser URL.
- **Mobile app URLs** — URL shapes from mobile clients may differ. Use the desktop browser URL.
- **Confluence Data Center** `/display/` URLs — no page ID is present (see above).

---

## Testing

### Unit tests — `apps/cli/src/__tests__/readMdspecMap.test.ts`

The existing `parseParent` unit tests cover `alias:` and `id:` prefixes. Extend that file with:

| Scenario | What it verifies |
|---|---|
| `link:` with a valid Notion page URL | `parseParent` returns `{ type: 'link', value: '<url>' }` |
| `link:` with a valid Confluence Cloud URL | Same — type is `link`, value is the full URL |
| `link:` with a valid ClickUp space URL | Same |
| `link:` with a valid ClickUp list URL | Same |
| `link:` with a valid ClickUp doc URL | Same |
| `link:` with a bare path (no `http`) | Hard exit with clear message |

### Unit tests — `apps/cli/src/__tests__/extractLinkId.test.ts` (new file)

Isolate the extraction algorithm in its own test file. Cover every pattern variant:

**Notion**

| Scenario | Input | Expected ID |
|---|---|---|
| Title-prefixed page | `https://notion.so/ws/Eng-Docs-abc123def456abc123def456abc12345` | `abc123def456abc123def456abc12345` |
| Bare UUID | `https://notion.so/abc123def456abc123def456abc12345` | `abc123def456abc123def456abc12345` |
| Hyphenated UUID | `https://notion.so/ws/abc123de-f456-7890-abcd-ef1234567890` | `abc123def4567890abcdef1234567890` |
| Database with view param | `https://notion.so/ws/My-DB-abc123def456abc123def456abc12345?v=viewid` | `abc123def456abc123def456abc12345` |
| No recognisable ID segment | `https://notion.so/` | hard fail |

**Confluence Cloud**

| Scenario | Input | Expected ID |
|---|---|---|
| Standard cloud page URL | `https://acme.atlassian.net/wiki/spaces/ENG/pages/123456/Title` | `123456` |
| Trailing slash | `https://acme.atlassian.net/wiki/spaces/ENG/pages/123456/` | `123456` |
| No title segment | `https://acme.atlassian.net/wiki/spaces/ENG/pages/123456` | `123456` |
| Data Center `/display/` URL | `https://acme.atlassian.net/display/ENG/Auth+Flow` | hard fail with Data Center message |
| Missing page ID segment | `https://acme.atlassian.net/wiki/spaces/ENG/pages/` | hard fail |

**ClickUp**

| Scenario | Input | Expected ID |
|---|---|---|
| Space URL | `https://app.clickup.com/90181234/v/s/90181844797` | `90181844797` |
| List URL | `https://app.clickup.com/90181234/li/901812098656` | `901812098656` |
| Doc URL | `https://app.clickup.com/90181234/docs/abc123xyz` | `abc123xyz` |
| No matching pattern | `https://app.clickup.com/90181234/home` | hard fail |

**General**

| Scenario | Input | Expected |
|---|---|---|
| Not a URL (no `http`) | `link:just-an-id` | hard fail — suggest `id:` prefix instead |
| Short link (no recognisable path) | `https://notion.so/abc` | hard fail |

### Unit tests — `apps/cli/src/__tests__/readMdspecMap.test.ts` (existing file, extend)

Add cases to the `parent:` parsing section alongside the existing `alias:` and `id:` cases:

| Scenario | What it verifies |
|---|---|
| Mapping with `parent: link:https://...notion...` | `parseParent` returns correct `type` and `value` |
| Mapping with `parent: link:https://...atlassian...` | Same |
| CLI exits cleanly when `link:` extraction succeeds | `publishCommand` does not hard-exit for a valid link parent |
| CLI exits with error when `link:` URL is unrecognisable | Exit code 1, error message contains the URL and suggests `id:` |

### End-to-end tests — `/Users/mfmz/testmdspecdocs`

Add scenarios to the live integration test repo that publish using `link:` parents for each integration:

| Scenario | Integration | Verifies |
|---|---|---|
| Notion folder mapped with `link:` parent URL | Notion | Spec appears under the correct page |
| Confluence folder mapped with `link:` parent URL | Confluence | Spec appears under the correct page |
| ClickUp folder mapped with `link:` space URL | ClickUp | Spec appears in the correct space |
| Invalid `link:` URL causes clean publish failure | Any | CI exits non-zero, error output contains the URL and corrective hint |

These run on every push to that repo and validate the full round-trip against live integrations.

---

---

## API Docs

The public API reference at `apps/web/app/docs/api-reference/page.tsx` documents this feature in:

- **NAV sidebar** — `parent: link: prefix` entry linking to `#parent-link`
- **mappings: field table** — `parent` row updated to list all four forms including `link:`
- **New `#parent-link` section** — extraction rules per platform, unsupported cases, failure output examples
- **Agent prompt** — updated to list `link:` as the third `parent:` form

---

*End of Parent Link Support Specification*
