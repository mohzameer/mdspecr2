# Amazon S3 — Integration Setup

This guide walks you through getting the four credentials required to connect mdspec to an S3 bucket.

**Fields required by the mdspec connect form:**
- Access Key ID
- Secret Access Key
- Bucket name
- Region

---

## Step 1 — Create or identify an S3 bucket

1. Sign in to the [AWS Console](https://console.aws.amazon.com).
2. Open **S3** and click **Create bucket** (or note the name of an existing bucket).
3. Choose a **Region** (e.g. `us-east-1`). You will enter this exact region code in mdspec.
4. Leave all other settings at their defaults for now. Click **Create bucket**.

---

## Step 2 — Create an IAM user with scoped permissions

AWS best practice is to create a dedicated IAM user for programmatic access rather than using your root account or personal credentials.

1. Go to **IAM → Users → Create user**.
2. Enter a username (e.g. `mdspec-s3-publisher`).
3. Select **Programmatic access** (API keys, not Console access).
4. On the **Permissions** step, choose **Attach policies directly** and click **Create policy**.
5. Switch to the **JSON** editor and paste the following, replacing `YOUR-BUCKET-NAME`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME"
    }
  ]
}
```

6. Give the policy a name (e.g. `mdspec-s3-policy`) and save it.
7. Attach that policy to the new user and complete the user creation.

---

## Step 3 — Generate the access key

1. Open the newly created user in **IAM → Users**.
2. Click the **Security credentials** tab.
3. Under **Access keys**, click **Create access key**.
4. Select **Application running outside AWS** as the use case.
5. Click **Create access key**.
6. **Copy both values immediately** — the Secret Access Key is shown only once:
   - **Access key ID** — looks like `AKIAIOSFODNN7EXAMPLE`
   - **Secret access key** — a long random string

Store them in a password manager before closing the dialog.

---

## Step 4 — Connect in mdspec

Go to **Dashboard → Integrations → Amazon S3 → Connect** and fill in:

| Field | Value |
|---|---|
| Access key ID | The `AKIA...` key from step 3 |
| Secret access key | The secret from step 3 |
| Bucket | The bucket name from step 1 |
| Region | The region code, e.g. `us-east-1` |

mdspec will run a health-check (PutObject + DeleteObject on a sentinel key) before saving. If it fails, double-check the IAM policy and that the region matches the bucket's actual region.

---

## Troubleshooting

| Error | Likely cause |
|---|---|
| `Access Denied` | IAM policy missing `s3:PutObject` or `s3:DeleteObject` |
| `NoSuchBucket` | Bucket name or region is wrong |
| `InvalidAccessKeyId` | Copied the wrong key or it was regenerated |
| `SignatureDoesNotMatch` | Secret access key was copied incorrectly (trailing space, missing chars) |
