# Notion — Integration Setup

This guide walks you through creating a Notion integration, getting its token, and sharing the target page or database with it.

**Fields required by the mdspec connect form:**
- Integration token
- Notion page or database link / ID

---

## Step 1 — Create a Notion integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and sign in with the account that owns the workspace.
2. Click **+ New integration**.
3. Enter a name, e.g. `mdspec`.
4. Under **Associated workspace**, select the workspace you want mdspec to publish into.
5. Under **Capabilities**, ensure **Read content**, **Update content**, and **Insert content** are all checked.
6. Click **Save**.

---

## Step 2 — Copy the integration token

1. After saving, stay on the integration's settings page.
2. Under **Secrets**, click **Show** next to **Internal Integration Secret**.
3. Click **Copy**. The token starts with `ntn_` (newer workspaces) or `secret_` (older workspaces).

Store this token securely — it grants API access to every page you share with the integration.

---

## Step 3 — Share your target page or database with the integration

Notion does not grant integrations automatic access to your workspace. You must explicitly share each page or database you want mdspec to write into.

**For a page:**
1. Open the page in Notion.
2. Click the **…** (More) menu in the top-right corner.
3. Click **Connections** (or **Add connections** in some versions).
4. Search for your integration by name (e.g. `mdspec`) and select it.

**For a database:**
1. Open the database.
2. Click **…** in the top-right.
3. Select **Connections → Add a connection** and pick your integration.

> Sub-pages and child databases of a shared page are automatically accessible — you only need to share the top-level parent.

---

## Step 4 — Get the page or database ID

The easiest way is to paste the page or database URL directly into mdspec — it will extract the ID automatically.

To find the URL:
- **Page**: Open the page and click **Share → Copy link**, or copy the URL from your browser.
- **Database**: Open the database as a full page and copy the URL from your browser. Database URLs contain a `?v=` parameter.

Example page URL:
```
https://www.notion.so/myworkspace/Engineering-Specs-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
```
The 32-character hex string at the end is the page ID.

---

## Step 5 — Connect in mdspec

Go to **Dashboard → Integrations → Notion → Connect** and fill in:

| Field | Value |
|---|---|
| Integration token | The `ntn_...` or `secret_...` token from step 2 |
| Notion link or ID | The URL or ID of the page/database from step 4 |

mdspec auto-detects whether you pasted a page or a database link and switches modes accordingly. After you enter both fields, it loads any sub-pages so you can optionally narrow the publish target.

---

## Step 6 — Optionally pick a sub-page

After entering the token and page link, mdspec fetches and lists sub-pages found under that parent. You can:

- Leave it at the default (**Use parent page**) to publish directly under the top-level page.
- Select a specific sub-page to publish under that instead.

---

## Troubleshooting

| Error | Likely cause |
|---|---|
| `Could not extract a Notion page ID` | The URL does not contain a valid 32-char hex ID — paste the full page URL |
| `401 / object not found` | The integration has not been shared with the page — repeat step 3 |
| `Could not load sub-pages` | The token is correct but the integration lacks Insert/Update capability |
| Token accepted but no pages visible | The workspace associated with the integration does not match the page |
