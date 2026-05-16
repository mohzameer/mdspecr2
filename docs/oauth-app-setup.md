# OAuth App Setup — Developer Guide

This guide covers how to register an OAuth app on each integration platform so mdspec can implement one-click authorization flows. Once configured, users click **Connect**, are redirected to the provider's consent screen, approve permissions, and land back in mdspec with credentials stored automatically — no manual token copying required.

---

## How OAuth works in mdspec (overview)

1. User clicks **Connect** on the Integrations page.
2. mdspec redirects the user to the provider's authorization URL with the app's `client_id`, requested scopes, and a `redirect_uri` pointing back to mdspec (e.g. `https://app.mdspec.io/api/integrations/notion/callback`).
3. The user approves permissions on the provider's site.
4. The provider redirects the user to `redirect_uri` with a short-lived `code`.
5. mdspec's callback route exchanges `code` for an `access_token` (and optional `refresh_token`) using the app's `client_secret`.
6. The token is stored in Supabase Vault via `storeCredentials()` and the integration row is saved — same as today, just no form.

---

## Environment variables (add to `.env`)

| Variable | Description |
|---|---|
| `NOTION_CLIENT_ID` | Notion public integration client ID |
| `NOTION_CLIENT_SECRET` | Notion public integration client secret |
| `ATLASSIAN_CLIENT_ID` | Atlassian OAuth app client ID |
| `ATLASSIAN_CLIENT_SECRET` | Atlassian OAuth app client secret |
| `CLICKUP_CLIENT_ID` | ClickUp OAuth app client ID |
| `CLICKUP_CLIENT_SECRET` | ClickUp OAuth app client secret |

Your production redirect base is `https://app.mdspec.io`. For local dev use `http://localhost:3000`.

---

## Notion

**OAuth docs:** https://developers.notion.com/docs/authorization

### Register the OAuth app

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and sign in as the mdspec workspace owner.
2. Click **+ New integration**.
3. Fill in:
   - **Name:** `mdspec`
   - **Associated workspace:** your mdspec developer workspace (doesn't matter — users connect their own)
   - **Integration type:** **Public** (this is what enables OAuth; "Internal" is token-only)
4. Under **Capabilities**, check: **Read content**, **Update content**, **Insert content**, **Read user information including email**.
5. Click **Save**.

### Configure OAuth settings

After saving, click **Distribution** in the left sidebar:

1. **Toggle distribution on.**
2. Set **Redirect URIs**:
   - `https://app.mdspec.io/api/integrations/notion/callback`
   - `http://localhost:3000/api/integrations/notion/callback` (for local dev)
3. Copy **OAuth client ID** → `NOTION_CLIENT_ID`
4. Click **Show** next to **OAuth client secret** → `NOTION_CLIENT_SECRET`

### Authorization URL

```
https://api.notion.com/v1/oauth/authorize
  ?client_id=NOTION_CLIENT_ID
  &response_type=code
  &owner=user
  &redirect_uri=https://app.mdspec.io/api/integrations/notion/callback
```

### Token exchange (callback route)

```
POST https://api.notion.com/v1/oauth/token
Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "<code from callback>",
  "redirect_uri": "https://app.mdspec.io/api/integrations/notion/callback"
}
```

**Response** includes `access_token` (use as the `token` credential field), `workspace_id`, `workspace_name`, and `bot_id`. Store `access_token` in Vault.

> Notion tokens do **not** expire — no refresh token is needed.

### What changes in credentials

The existing `NotionCredentials.token` field stays the same. The OAuth flow just fills it automatically. `root_page_id` / `database_id` still need to be picked after connection (show a page picker using `POST /search` with the returned token).

---

## Confluence (Atlassian)

**OAuth docs:** https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/

Atlassian uses **3LO (three-legged OAuth 2.0)**. One app covers Confluence, Jira, and all other Atlassian Cloud products.

### Register the OAuth app

1. Go to [developer.atlassian.com](https://developer.atlassian.com) and sign in.
2. Click your avatar → **Developer console**.
3. Click **Create** → **OAuth 2.0 integration**.
4. Name it `mdspec` and accept the terms.

### Configure the app

In the app dashboard:

**Authorization tab:**
1. Click **Add** next to Callback URL.
2. Add:
   - `https://app.mdspec.io/api/integrations/confluence/callback`
   - `http://localhost:3000/api/integrations/confluence/callback`

**Permissions tab — add these scopes:**

| Scope | Purpose |
|---|---|
| `read:confluence-content.all` | Read pages and spaces |
| `write:confluence-content` | Create and update pages |
| `read:confluence-space.summary` | List spaces |
| `offline_access` | Get a refresh token (required for long-lived access) |

**Settings tab:**
- Copy **Client ID** → `ATLASSIAN_CLIENT_ID`
- Copy **Secret** → `ATLASSIAN_CLIENT_SECRET`

### Authorization URL

```
https://auth.atlassian.com/authorize
  ?audience=api.atlassian.com
  &client_id=ATLASSIAN_CLIENT_ID
  &scope=read:confluence-content.all%20write:confluence-content%20read:confluence-space.summary%20offline_access
  &redirect_uri=https://app.mdspec.io/api/integrations/confluence/callback
  &state=<random_state>
  &response_type=code
  &prompt=consent
```

### Token exchange (callback route)

```
POST https://auth.atlassian.com/oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "client_id": "ATLASSIAN_CLIENT_ID",
  "client_secret": "ATLASSIAN_CLIENT_SECRET",
  "code": "<code from callback>",
  "redirect_uri": "https://app.mdspec.io/api/integrations/confluence/callback"
}
```

**Response** includes `access_token`, `refresh_token`, and `expires_in` (seconds).

### Get the accessible cloud sites

After exchanging the code, call:

```
GET https://api.atlassian.com/oauth/token/accessible-resources
Authorization: Bearer <access_token>
```

Returns an array of sites the user can access. Each entry has `id` (the `cloudId`) and `url` (e.g. `https://mycompany.atlassian.net`). If the user has multiple sites, show a picker. Store:

- `base_url` = the site's `url` (e.g. `https://mycompany.atlassian.net`)
- `cloud_id` = the site's `id` (needed for the v2 Confluence API; current adapter uses REST v1 and only needs `base_url`)
- `access_token` replaces the `token` field (used as Bearer instead of Basic auth — **requires updating the adapter**)
- `refresh_token` for re-auth when the token expires (1 hour TTL)

Then show a space picker: call `GET /wiki/rest/api/space?limit=50` with the token to let the user pick `space_key`.

> **Adapter change required:** The current confluence adapter uses HTTP Basic auth (`{ username: email, password: token }`). With OAuth, switch to `Authorization: Bearer <access_token>`. The `email` field is no longer needed.

### Token refresh

Atlassian access tokens expire after **1 hour**. Before each publish, check expiry and refresh:

```
POST https://auth.atlassian.com/oauth/token
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "client_id": "ATLASSIAN_CLIENT_ID",
  "client_secret": "ATLASSIAN_CLIENT_SECRET",
  "refresh_token": "<stored_refresh_token>"
}
```

---

## ClickUp

**OAuth docs:** https://clickup.com/api/developer-portal/authentication

### Register the OAuth app

1. Sign in to [ClickUp](https://app.clickup.com) as a workspace admin.
2. Click your **avatar** → **Settings** → **ClickUp API** (left sidebar, under Integrations).
3. Click **+ Create an App**.
4. Fill in:
   - **App name:** `mdspec`
   - **Redirect URL:** `https://app.mdspec.io/api/integrations/clickup/callback`
5. Click **Create App**.
6. Copy **Client ID** → `CLICKUP_CLIENT_ID`
7. Copy **Client Secret** → `CLICKUP_CLIENT_SECRET`

> ClickUp only allows one redirect URL per app. For local dev, create a separate app named `mdspec (dev)` with `http://localhost:3000/api/integrations/clickup/callback`.

### Authorization URL

```
https://app.clickup.com/api
  ?client_id=CLICKUP_CLIENT_ID
  &redirect_uri=https://app.mdspec.io/api/integrations/clickup/callback
```

No scope parameter — ClickUp grants access to all workspaces the user belongs to.

### Token exchange (callback route)

```
POST https://api.clickup.com/api/v2/oauth/token
Content-Type: application/json

{
  "client_id": "CLICKUP_CLIENT_ID",
  "client_secret": "CLICKUP_CLIENT_SECRET",
  "code": "<code from callback>"
}
```

**Response** includes `access_token`. Store it as `api_token` in credentials.

After getting the token, call `GET https://api.clickup.com/api/v2/team` (with `Authorization: <access_token>`) to list workspaces. Show a picker if the user belongs to multiple. Store the selected `workspace_id`.

> ClickUp OAuth tokens do **not** expire — no refresh token is needed.

### What changes in credentials

`ClickUpCredentials.api_token` is populated from OAuth instead of user input. `workspace_id` is picked from the returned team list. The adapter is unchanged.

---

## Amazon S3

S3 does not support user-facing OAuth. IAM credentials (`access_key_id` + `secret_access_key`) remain the only option for programmatic bucket access. The manual setup flow stays as-is.

If you later want to reduce friction for AWS users, consider:
- **AWS SSO / IAM Identity Center** — complex, requires the user to be in a specific AWS Organization.
- **Bucket-level pre-signed URL delegation** — not applicable for long-lived publishing access.

For now, the existing manual IAM setup (see [setup-s3.md](setup-s3.md)) is the right approach for S3.

---

## Callback routes to implement

| Integration | Route |
|---|---|
| Notion | `GET /api/integrations/notion/callback` |
| Confluence | `GET /api/integrations/confluence/callback` |
| ClickUp | `GET /api/integrations/clickup/callback` |

Each callback route should:

1. Validate the `state` parameter (if used) against a value stored in session/cookie to prevent CSRF.
2. Exchange `code` for tokens using the provider's token endpoint.
3. Fetch any extra data needed (accessible sites for Atlassian, workspace list for ClickUp).
4. If a picker is needed (e.g. Confluence space, ClickUp workspace), redirect to a picker page or return JSON for a modal.
5. Call `storeCredentials()` with the final credential JSON.
6. Call `POST /api/integrations/connect` with `type` and `secret_id`.
7. Redirect to `/integrations` with a success or error query param.

---

## Security checklist

- Generate a random `state` value per OAuth initiation, store it in an HTTP-only cookie or server session, and verify it matches on callback.
- Store `client_secret` values only in server-side environment variables — never expose them to the browser.
- Store tokens in Supabase Vault (existing `storeCredentials()`) — not in plain columns.
- For Atlassian: encrypt and store `refresh_token` alongside `access_token`; refresh before each publish job in the worker.
- Redirect URIs must exactly match what is registered with each provider (including protocol and trailing slashes).
