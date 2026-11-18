import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";

import type pg from "pg";

import { openTestDatabase } from "./db/test-database.ts";
import {
  correctSentEnvelopeSigner,
  getDraftSignerStepDataForUser,
  replaceDraftEnvelopeFields,
  replaceDraftEnvelopeSigners,
  sendDraftEnvelope,
} from "./envelopes.ts";
import type { EmailService } from "./services/email.ts";
import { createStorageService } from "./services/storage.ts";

// People outside the organization are asked for an emailed code before
// they can sign, against a real Postgres. Run with `npm run test:db`.

const SETTINGS = [
  "APP_URL",
  "DATABASE_URL",
  "EMAIL_CAPTURE_DIR",
  "EMAIL_DRIVER",
  "STORAGE_DRIVER",
  "STORAGE_LOCAL_DIR",
] as const;

let database: pg.Pool;
let workDir: string;
let settingsRow: Record<string, unknown> | null = null;
const createdUsers: string[] = [];
const environmentBefore = new Map<string, string | undefined>();

before(async () => {
  database = await openTestDatabase();
  workDir = await mkdtemp(path.join(tmpdir(), "pheonixsign-outsiders-"));

  for (const name of SETTINGS) {
    environmentBefore.set(name, process.env[name]);
  }

  process.env.APP_URL = "http://localhost:3000";
  process.env.DATABASE_URL =
    process.env.E2E_DATABASE_URL ??
    "postgres://signudoc:signudoc@127.0.0.1:5432/signudoc_e2e";
  process.env.EMAIL_CAPTURE_DIR = path.join(workDir, "outbox");
  process.env.EMAIL_DRIVER = "capture";
  process.env.STORAGE_DRIVER = "local";
  process.env.STORAGE_LOCAL_DIR = path.join(workDir, "storage");

  settingsRow =
    (
      await database.query<Record<string, unknown>>(
        `select signup_mode, allowed_email_domains, external_signer_code from app_settings`,
      )
    ).rows[0] ?? null;
});

after(async () => {
  await database.query(`delete from public."user" where id = any($1)`, [
    createdUsers,
  ]);

  if (settingsRow) {
    await database.query(
      `update app_settings set signup_mode = $1, allowed_email_domains = $2, external_signer_code = $3`,
      [
        settingsRow.signup_mode,
        settingsRow.allowed_email_domains,
        settingsRow.external_signer_code,
      ],
    );
  } else {
    await database.query(`delete from app_settings`);
  }

  await database.end();

  for (const [name, value] of environmentBefore) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  await rm(workDir, { force: true, recursive: true });
});

/** The organization: acme.test, sign-up limited to it, codes for outsiders. */
async function setRules(
  rules: {
    externalSignerCode?: boolean;
    signupMode?: "closed" | "domains" | "open";
  } = {},
) {
  await database.query(
    `
      insert into app_settings (
        id, signup_mode, allowed_email_domains, external_signer_code,
        created_at, updated_at
      )
      values (true, $1, $2, $3, 1, 1)
      on conflict (id) do update set
        signup_mode = excluded.signup_mode,
        allowed_email_domains = excluded.allowed_email_domains,
        external_signer_code = excluded.external_signer_code
    `,
    [
      rules.signupMode ?? "domains",
      // gmail.com never makes everyone at Gmail part of the organization.
      ["acme.test", "gmail.com"],
      rules.externalSignerCode ?? true,
    ],
  );
}

beforeEach(async () => {
  await setRules();
});

async function createAccount(email: string, verified: boolean) {
  const id = randomUUID();

  createdUsers.push(id);
  await database.query(
    `insert into public."user" (id, name, email, role, "emailVerified") values ($1, 'Account Holder', $2, 'user', $3)`,
    [id, email, verified],
  );
}

/** A draft with these signers, each with a signature field, ready to send. */
async function createDraft(
  signers: Array<{ email: string; requireEmailCode?: boolean }>,
) {
  const userId = randomUUID();
  const envelopeId = randomUUID();
  const sourcePdfKey = `test/${envelopeId}.pdf`;

  createdUsers.push(userId);
  await createStorageService().putObject({
    body: new Uint8Array([37, 80, 68, 70]),
    contentType: "application/pdf",
    key: sourcePdfKey,
  });
  await database.query(
    `insert into public."user" (id, name, email, role, "emailVerified") values ($1, 'Sam Sender', $2, 'user', true)`,
    [userId, `sam-${userId}@acme.test`],
  );
  await database.query(
    `
      insert into envelopes (
        id, user_id, title, status, source_pdf_key, source_pdf_filename,
        source_pdf_size_bytes, page_count, source_pdf_hash
      ) values ($1, $2, 'Contract', 'draft', $3, 'contract.pdf', 4, 1, $4)
    `,
    [envelopeId, userId, sourcePdfKey, "a".repeat(64)],
  );
  await database.query(
    `
      insert into envelope_pages (id, envelope_id, page_number, width_pt, height_pt)
      values ($1, $2, 1, 612, 792)
    `,
    [randomUUID(), envelopeId],
  );

  const saved = await replaceDraftEnvelopeSigners(
    userId,
    envelopeId,
    {
      signers: signers.map((signer, index) => ({
        email: signer.email,
        name: `Signer ${String(index + 1)}`,
        ...(signer.requireEmailCode ? { requireEmailCode: true } : {}),
      })),
    },
    database,
  );

  await replaceDraftEnvelopeFields(
    userId,
    envelopeId,
    {
      fields: saved.signers.map((signer, index) => ({
        height: 0.03,
        page: 1,
        required: true,
        signerId: signer.id,
        type: "signature",
        width: 0.2,
        x: 0.1,
        y: 0.1 + index * 0.05,
      })),
    },
    database,
  );

  return { envelopeId, signers: saved.signers, userId };
}

async function send(draft: { envelopeId: string; userId: string }) {
  await sendDraftEnvelope(
    draft.userId,
    draft.envelopeId,
    { senderEmail: "sam@acme.test", senderName: "Sam Sender" },
    { database },
  );
}

async function codesOf(envelopeId: string): Promise<Record<string, boolean>> {
  const rows = await database.query<{ email: string; code: boolean }>(
    `select email, require_email_code as code from signers where envelope_id = $1`,
    [envelopeId],
  );

  return Object.fromEntries(rows.rows.map((row) => [row.email, row.code]));
}

function unique(local: string, domain: string) {
  return `${local}-${randomUUID().slice(0, 8)}@${domain}`;
}

test("outsiders are asked for a code when sent; the organization's people are not", async () => {
  const colleague = unique("colleague", "acme.test");
  const member = unique("member", "partner.test");
  const unconfirmed = unique("unconfirmed", "partner.test");
  const gmailUser = unique("someone", "gmail.com");
  const stranger = unique("stranger", "elsewhere.test");

  await createAccount(member, true);
  await createAccount(unconfirmed, false);

  const draft = await createDraft([
    { email: colleague },
    { email: member },
    { email: unconfirmed },
    { email: gmailUser },
    { email: stranger },
  ]);

  await send(draft);

  assert.deepEqual(await codesOf(draft.envelopeId), {
    // At the organization's domain.
    [colleague]: false,
    // A confirmed account here.
    [member]: false,
    // An account nobody has confirmed proves nothing.
    [unconfirmed]: true,
    // Listing gmail.com does not bring all of Gmail inside.
    [gmailUser]: true,
    [stranger]: true,
  });
});

test("a sender can still ask an insider for a code", async () => {
  const colleague = unique("colleague", "acme.test");
  const draft = await createDraft([
    { email: colleague, requireEmailCode: true },
  ]);

  await send(draft);

  assert.deepEqual(await codesOf(draft.envelopeId), { [colleague]: true });
});

test("with the rule off, only the sender's own choices apply", async () => {
  await setRules({ externalSignerCode: false });

  const stranger = unique("stranger", "elsewhere.test");
  const draft = await createDraft([{ email: stranger }]);

  await send(draft);

  assert.deepEqual(await codesOf(draft.envelopeId), { [stranger]: false });
});

test("with sign-up open to anyone, an account does not make someone an insider", async () => {
  await setRules({ signupMode: "open" });

  const member = unique("member", "partner.test");

  await createAccount(member, true);

  const draft = await createDraft([{ email: member }]);

  await send(draft);

  assert.deepEqual(await codesOf(draft.envelopeId), { [member]: true });
});

test("correcting an insider's address to an outsider's turns the code on", async () => {
  const colleague = unique("colleague", "acme.test");
  const stranger = unique("stranger", "elsewhere.test");
  const draft = await createDraft([{ email: colleague }]);

  await send(draft);
  assert.deepEqual(await codesOf(draft.envelopeId), { [colleague]: false });

  const emailService = {
    send: async (message: { to: string }) => ({
      accepted: [message.to],
      rejected: [],
    }),
    sendBatch: async () => [],
  } as unknown as EmailService;

  await correctSentEnvelopeSigner(
    draft.userId,
    draft.envelopeId,
    draft.signers[0]!.id,
    { email: stranger },
    { senderEmail: "sam@acme.test", senderName: "Sam Sender" },
    { database, emailService },
  );

  assert.deepEqual(await codesOf(draft.envelopeId), { [stranger]: true });
});

test("the sender is told who will be asked for a code", async () => {
  const draft = await createDraft([
    { email: unique("colleague", "acme.test") },
  ]);

  assert.deepEqual(
    (
      await getDraftSignerStepDataForUser(
        draft.userId,
        draft.envelopeId,
        database,
      )
    )?.outsideCode,
    { accounts: true, domains: ["acme.test"] },
  );

  await setRules({ externalSignerCode: false });

  assert.equal(
    (
      await getDraftSignerStepDataForUser(
        draft.userId,
        draft.envelopeId,
        database,
      )
    )?.outsideCode,
    null,
  );
});
