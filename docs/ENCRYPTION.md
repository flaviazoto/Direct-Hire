# DirectHire — Encryption Operational Guide

Passport numbers and phone numbers are encrypted at rest using AES-256-GCM
envelope encryption. This document covers key provisioning, mode switching,
rotation procedures, and incident response.

---

## Architecture

**Two modes are supported, controlled by `ENCRYPTION_PROVIDER`:**

| Mode | Use case | Backing key |
|---|---|---|
| `local` | Development / CI | `ENCRYPTION_LOCAL_KEY` (32-byte hex in `.env`) |
| `kms` | Production | AWS KMS Customer Managed Key (CMK) |

**Envelope encryption (KMS mode):**  
AWS KMS never sees raw passport or phone data. For each field encryption:
1. `GenerateDataKey` is called → returns a one-time plaintext AES-256 data key and its KMS-encrypted copy.
2. The plaintext key encrypts the field value via AES-256-GCM.
3. The encrypted data key + IV + auth tag + ciphertext are stored together in the DB column.
4. On decrypt: the encrypted data key is passed to `KMS Decrypt` → plaintext key is recovered → field is decrypted locally.
5. The plaintext key is zeroed from memory immediately after use.

---

## a) AWS KMS Key Provisioning

### Create the CMK

In the AWS Console → KMS → Customer managed keys → Create key:

| Setting | Value |
|---|---|
| Key type | Symmetric |
| Key spec | `SYMMETRIC_DEFAULT` (AES-256) |
| Key usage | Encrypt and decrypt |
| Alias | `alias/directhire-field-encryption` |

Enable **automatic annual key rotation** during creation.

### Key policy — grant the ECS task role

Replace `ACCOUNT_ID` and `TASK_ROLE_ARN` with real values:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowKeyAdministration",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT_ID:root" },
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "AllowECSTaskEncryption",
      "Effect": "Allow",
      "Principal": { "AWS": "TASK_ROLE_ARN" },
      "Action": [
        "kms:GenerateDataKey",
        "kms:Decrypt"
      ],
      "Resource": "*"
    }
  ]
}
```

> **Least privilege**: the ECS task role receives only `GenerateDataKey` and `Decrypt`.
> It cannot manage, schedule deletion of, or rotate the key.

---

## b) Switching from Local to KMS Mode

1. **Create the CMK** (see section a).

2. **Run the data migration** to re-encrypt existing plaintext-encrypted values
   from `local` format to `kms` envelope format:

   ```bash
   # Ensure current env still has ENCRYPTION_PROVIDER=local so decrypt works
   npx tsx backend/prisma/migrate-passport-encrypt.ts
   npx tsx backend/prisma/migrate-phone-encrypt.ts
   ```

3. **Update production environment variables:**

   ```env
   ENCRYPTION_PROVIDER=kms
   AWS_KMS_KEY_ID=arn:aws:kms:eu-west-1:ACCOUNT_ID:key/YOUR_KEY_ID
   AWS_REGION=eu-west-1
   ```

4. **Re-encrypt all existing records** using the new KMS key:

   ```bash
   # With ENCRYPTION_PROVIDER=local still set (to decrypt old records)
   npx tsx -e "
     process.env.ENCRYPTION_PROVIDER = 'local';
     const { reEncryptAll } = require('./backend/src/encryption/key-rotation.service');
     reEncryptAll('arn:aws:kms:eu-west-1:ACCOUNT_ID:key/YOUR_KEY_ID');
   "
   ```

5. **Deploy** with the new env vars. Remove `ENCRYPTION_LOCAL_KEY` from production secrets.

6. Verify: check that `/api/admin/workers/:id/passport` decrypts correctly for a test worker.

---

## c) Key Rotation Procedure

### Automatic rotation (AWS-managed, recommended)

AWS KMS rotates the backing cryptographic material annually when enabled.
Old ciphertexts remain decryptable transparently — no action required on
our side. Enable it during key creation or under Key → Key rotation.

> **No DB re-encryption is needed for automatic AWS rotation.**

### Manual rotation (new CMK)

Use this when retiring a CMK entirely (e.g., after a suspected compromise,
or to change key parameters).

1. **Create a new CMK** in AWS KMS with the same key policy as above.

2. **Run the rotation script** (decrypts with old key, re-encrypts with new):

   ```bash
   cd backend
   npx tsx -e "
     const { reEncryptAll } = require('./src/encryption/key-rotation.service');
     reEncryptAll('arn:aws:kms:eu-west-1:ACCOUNT_ID:key/NEW_KEY_ID');
   "
   ```

   The script:
   - Processes workers in batches of 100
   - Logs each success / failure individually
   - **Never aborts** on a per-row error — failures are logged and the run continues
   - Writes a `KEY_ROTATION_COMPLETE` entry to `AuditLog` with counts:
     `"Re-encrypted N workers, M failures"`

3. **Inspect the output.** If `failCount > 0`, fix the cause and re-run before
   proceeding.

4. **Update the environment variable:**

   ```env
   AWS_KMS_KEY_ID=arn:aws:kms:eu-west-1:ACCOUNT_ID:key/NEW_KEY_ID
   ```

5. **Deploy** the updated env var.

6. **Schedule deletion** of the old key in KMS (minimum 7-day waiting period).
   Do NOT delete it until you are confident all records have been re-encrypted
   and the new key is in production.

---

## d) Incident Response

### Key compromise suspected

**Act immediately — time is critical for GDPR Art. 33 (72-hour notification window).**

#### Step 1 — Revoke access (< 5 minutes)

In AWS Console → KMS → find the compromised key:

1. **Key policy** → remove the `AllowECSTaskEncryption` statement to block new
   encrypt/decrypt operations from the application.
2. **Disable** the key (Key actions → Disable). This immediately prevents all
   use of the key while keeping the key material recoverable.

> Do **not** schedule deletion yet — you still need the key to decrypt existing
> ciphertext for re-encryption.

#### Step 2 — Create a new CMK

Follow section a) to create a replacement key with the same policy.

#### Step 3 — Re-encrypt all records

Temporarily re-enable the compromised key (read-only decrypt):

```bash
# In a secure environment with both keys accessible
npx tsx -e "
  const { reEncryptAll } = require('./backend/src/encryption/key-rotation.service');
  reEncryptAll('arn:aws:kms:eu-west-1:ACCOUNT_ID:key/NEW_KEY_ID');
"
```

Verify `failCount = 0` before proceeding.

#### Step 4 — Deploy new key

Update `AWS_KMS_KEY_ID` to the new key ARN and deploy.

#### Step 5 — Permanently disable old key

Once the application is running on the new key:
- Disable the compromised key in KMS.
- Schedule deletion (7-day minimum).
- Revoke all key policy statements entirely.

#### Step 6 — GDPR notification (Art. 33)

A key compromise affecting encrypted personal data (passport numbers, phone
numbers) is a personal data breach under GDPR.

| Obligation | Deadline |
|---|---|
| Notify your Data Protection Authority (DPA) | **Within 72 hours** of becoming aware |
| Notify affected data subjects | If high risk to individuals — without undue delay |
| Document the breach | Immediately — all steps, timeline, decisions |

Contact your DPA:
- **Albania (IDPD):** https://idp.al
- **EU (one-stop-shop):** notify the lead supervisory authority in the EU member
  state where your main establishment is located.

Breach notification must include:
- Nature of the breach (encryption key compromise)
- Categories and approximate number of data subjects and records affected
- Likely consequences of the breach
- Measures taken or proposed to address the breach

> Keep this runbook updated. Review it after every incident and after any
> significant change to the encryption architecture.

---

*Last reviewed: 2026-05-17*
