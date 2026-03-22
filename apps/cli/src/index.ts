#!/usr/bin/env node
/**
 * mdspec CLI — npx mdspec publish --project <project_id>
 *
 * Responsibilities:
 *   1. Detect changed .md files via git diff (fallback: SHA256 hash compare)
 *   2. Parse frontmatter and compute content hashes
 *   3. POST artifact payload to /api/publish
 *   4. Print per-spec publish/skip/fail output to stdout
 *   5. Exit 0 on success or no-op, non-zero on hard failure
 *
 * Required env:
 *   MDSPEC_TOKEN   — project-scoped CI token (mds_<id>_<hex32>)
 * Optional env:
 *   MDSPEC_API_URL — override API base URL (defaults to https://mdspec.app)
 */

// TODO: implement publish command
console.log('mdspec cli — not yet implemented')
