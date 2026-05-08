# ClickUp — Integration Setup

This guide walks you through getting the two values required to connect mdspec to ClickUp.

**Fields required by the mdspec connect form:**
- Personal API token
- Workspace URL

---

## Step 1 — Generate your Personal API token

1. Sign in to [ClickUp](https://app.clickup.com).
2. Click your **avatar** (profile photo) in the upper-right corner.
3. Select **Settings**.
4. In the left sidebar, scroll down and click **Apps**.
5. Under **API Token**, click **Generate** (or **Regenerate** if you already have one).
6. Click the copy icon to copy your token. It starts with `pk_`.

> Your personal token grants the same access your account has in the browser — it covers all workspaces your account belongs to.

---

## Step 2 — Find your Workspace URL

1. While logged in to ClickUp, look at the URL in your browser. It will look like:
   ```
   https://app.clickup.com/90181844797/v/l/...
   ```
2. Copy the full URL from the address bar. mdspec automatically extracts the numeric workspace ID (e.g. `90181844797`) from it.

Alternatively, navigate to any view inside your workspace — the URL will always contain the workspace ID after `app.clickup.com/`.

---

## Step 3 — Connect in mdspec

Go to **Dashboard → Integrations → ClickUp → Connect** and fill in:

| Field | Value |
|---|---|
| Personal API token | The `pk_...` token from step 1 |
| Workspace URL | The full `https://app.clickup.com/...` URL from step 2 |

mdspec will parse the workspace ID from the URL automatically and display it below the field for confirmation before saving.

---

## Step 4 — Select a publish target

After connecting, when you configure a folder mapping you will be asked to pick where published docs land. mdspec will list your ClickUp Docs and task lists. Select the Doc or list that should receive published specs.

---

## Troubleshooting

| Error | Likely cause |
|---|---|
| `Could not find a workspace ID in that URL` | Paste the full URL including the numeric ID segment |
| `401 Unauthorized` | Token was regenerated — generate a new one and reconnect |
| `403 Forbidden` | Your account does not have access to the selected workspace or Doc |
