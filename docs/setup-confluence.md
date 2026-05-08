# Confluence — Integration Setup

This guide walks you through generating an Atlassian API token and finding your Confluence space key.

**Fields required by the mdspec connect form:**
- Base URL
- Email
- API token
- Space key

---

## Step 1 — Generate an Atlassian API token

API tokens are tied to your Atlassian account and work across all Atlassian products (Confluence, Jira, etc.).

1. Go to [id.atlassian.com/manage/api-tokens](https://id.atlassian.com/manage/api-tokens) and sign in.
2. Click **Create API token**.
3. Give it a label (e.g. `mdspec`).
4. Set an expiry date (default is 1 year; note it so you can renew before it expires).
5. Click **Create**.
6. Click **Copy to clipboard** immediately — the token is shown only once.

Store the token in a password manager. If you lose it, you must create a new one.

---

## Step 2 — Find your Confluence Base URL

Your base URL is the root of your Atlassian Cloud domain, without any trailing path:

```
https://yourcompany.atlassian.net
```

You can find it in the browser when you open any Confluence page — copy everything up to and including `.atlassian.net`.

> **Note:** Do not include `/wiki` or any path after the domain. mdspec appends `/wiki/rest/api/...` automatically.

---

## Step 3 — Find your Space key

1. In Confluence, navigate to the space where you want mdspec to publish.
2. Click **Space settings** in the left sidebar.
3. The **Space key** is shown under **Space details** — it is a short uppercase string, e.g. `ENG`, `DOCS`, or `PLATFRM`.

Alternatively, look at the URL when browsing a space:
```
https://yourcompany.atlassian.net/wiki/spaces/ENG/...
```
The segment after `/spaces/` is the space key (`ENG` in this example).

---

## Step 4 — Connect in mdspec

Go to **Dashboard → Integrations → Confluence → Connect** and fill in:

| Field | Example value |
|---|---|
| Base URL | `https://yourcompany.atlassian.net` |
| Email | The email address on your Atlassian account |
| API token | The token copied in step 1 |
| Space key | `ENG` |

mdspec validates the credentials against the Confluence REST API before saving. It checks that the space key exists and that your token has read access to it.

---

## Step 5 — Select a parent page

After connecting, when configuring a folder mapping you will pick the parent page under which mdspec creates spec pages. mdspec will list the top-level pages in your space for selection.

---

## IAM / Permissions note

The Atlassian account whose token you use must have **Space permission: Create and edit pages** on the target space. A viewer-only account will fail validation.

To verify:
1. In Confluence, go to **Space settings → Permissions**.
2. Confirm your user (or their group) has at minimum: **Add pages**, **Edit pages**.

---

## Troubleshooting

| Error | Likely cause |
|---|---|
| `Invalid credentials` | Wrong email, expired token, or token copied with extra whitespace |
| `Space "XYZ" not found` | Space key is incorrect or the account has no visibility of that space |
| `Could not reach Confluence` | Base URL is wrong — check for trailing slashes or extra path segments |
| `403 Forbidden` | Account exists but lacks Create/Edit page permissions in the space |

---

## Token renewal

Atlassian API tokens expire. By default, they last **1 year**. When your token expires:

1. Return to [id.atlassian.com/manage/api-tokens](https://id.atlassian.com/manage/api-tokens).
2. Revoke the old token and create a new one.
3. In mdspec, go to **Dashboard → Integrations → Confluence → Disconnect**, then reconnect with the new token.
