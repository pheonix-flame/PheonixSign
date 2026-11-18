import { z } from "zod";

import { type DbExecutor, getDb } from "./db/connection.ts";
import {
  type EmailTransportView,
  isSmtpPort,
  isSmtpProvider,
  SMTP_PORTS,
  SMTP_PROVIDER_INFO,
  SMTP_PROVIDERS,
  type SmtpPort,
  type SmtpProvider,
} from "./email-providers.ts";
import {
  decryptPrivateKey,
  encryptPrivateKey,
  secretKeyFor,
} from "./services/seal-identity.ts";
import { ServiceConfigurationError } from "./services/service-config.ts";
import { type EnvSource } from "./utils/env.ts";

// The mailbox the install sends its email from, when an administrator has
// chosen one in Settings instead of Resend. One row in email_transport.
//
// The password is encrypted with a key derived from the auth secret, like
// the seal key. If that secret changes, the saved password can no longer be
// read: email stops until an administrator enters it again, and Settings
// says so.

const PASSWORD_KEY_CONTEXT = "pheonixsign/email-transport-password/v1";

/** Other instances pick up a change within this time. */
const CACHE_MS = 30_000;

/** Everything needed to sign in to the mail server and send. */
export type SmtpSettings = {
  address: string;
  host: string;
  password: string;
  port: SmtpPort;
  provider: SmtpProvider;
  /** Who signs in: the address, unless the server wants something else. */
  username: string;
};

/** What is saved: usable, or saved but no longer readable. */
export type LoadedEmailTransport =
  | { readable: true; settings: SmtpSettings; view: EmailTransportView }
  | { readable: false; view: EmailTransportView };

type EmailTransportRow = {
  address: string;
  encryptedPassword: string;
  host: string;
  port: number;
  provider: string;
  updatedAt: string | number;
  username: string | null;
};

type TransportCache = {
  expiresAt: number;
  value: LoadedEmailTransport | null;
};

declare global {
  var __pheonixsignEmailTransportCache: TransportCache | undefined;
}

export function invalidateEmailTransportCache(): void {
  globalThis.__pheonixsignEmailTransportCache = undefined;
}

function passwordKey(env: EnvSource): Buffer {
  return secretKeyFor(PASSWORD_KEY_CONTEXT, env);
}

export function encryptTransportPassword(
  password: string,
  env: EnvSource = process.env,
): string {
  return encryptPrivateKey(password, passwordKey(env));
}

export function decryptTransportPassword(
  value: string,
  env: EnvSource = process.env,
): string | null {
  return decryptPrivateKey(value, passwordKey(env));
}

/** True for "the table is not there yet": the build has not migrated. */
function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "42P01"
  );
}

/** True when the install has no database at all, as in some unit tests. */
function isNoDatabaseError(error: unknown): boolean {
  return (
    error instanceof ServiceConfigurationError &&
    error.message.startsWith("database service ")
  );
}

export function rowToTransport(
  row: EmailTransportRow,
  env: EnvSource = process.env,
): LoadedEmailTransport | null {
  if (!isSmtpProvider(row.provider) || !isSmtpPort(row.port)) {
    return null;
  }

  const password = decryptTransportPassword(row.encryptedPassword, env);
  const view: EmailTransportView = {
    address: row.address,
    host: row.host,
    passwordReadable: password !== null,
    port: row.port,
    provider: row.provider,
    updatedAt: Number(row.updatedAt),
    username: row.username,
  };

  if (password === null) {
    return { readable: false, view };
  }

  return {
    readable: true,
    settings: {
      address: row.address,
      host: row.host,
      password,
      port: row.port,
      provider: row.provider,
      username: row.username ?? row.address,
    },
    view,
  };
}

/**
 * The mailbox email is sent from, or null when none is chosen and email
 * goes through Resend.
 */
export async function loadEmailTransport(
  env: EnvSource = process.env,
  database?: DbExecutor,
): Promise<LoadedEmailTransport | null> {
  const cached = globalThis.__pheonixsignEmailTransportCache;

  if (!database && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let row: EmailTransportRow | undefined;

  try {
    const result = await (database ?? getDb()).query<EmailTransportRow>(
      `
        SELECT
          provider,
          host,
          port,
          address,
          username,
          encrypted_password AS "encryptedPassword",
          updated_at AS "updatedAt"
        FROM public.email_transport
        WHERE id
      `,
    );

    row = result.rows[0];
  } catch (error) {
    if (isMissingTableError(error) || isNoDatabaseError(error)) {
      return null;
    }

    throw error;
  }

  const value = row ? rowToTransport(row, env) : null;

  if (!database) {
    globalThis.__pheonixsignEmailTransportCache = {
      expiresAt: Date.now() + CACHE_MS,
      value,
    };
  }

  return value;
}

// What an administrator sends from Settings. The server and port come
// from the provider, except for "other", where they are typed in.
const hostnamePattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export const emailTransportInputSchema = z
  .object({
    address: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email("Enter the full email address, such as you@gmail.com.")),
    host: z.string().trim().toLowerCase().optional(),
    // Left empty to keep the password already saved for this mailbox.
    password: z.string().max(256, "That password is too long.").optional(),
    port: z.coerce.number().int().optional(),
    provider: z.enum(SMTP_PROVIDERS),
    username: z.string().trim().max(254).optional(),
  })
  .strict();

export type EmailTransportInput = z.infer<typeof emailTransportInputSchema>;

export type ResolvedTransportInput =
  | { ok: true; settings: SmtpSettings }
  | { fieldErrors: Record<string, string>; ok: false };

/**
 * Turns what was typed into settings to try, filling in the server for a
 * known provider. A password left empty keeps the saved one, as long as it
 * is for the same mailbox on the same server.
 */
export function resolveTransportInput(
  input: EmailTransportInput,
  saved: LoadedEmailTransport | null,
): ResolvedTransportInput {
  const info = SMTP_PROVIDER_INFO[input.provider];
  const fieldErrors: Record<string, string> = {};
  const host = info.host ?? input.host ?? "";
  const port = info.port ?? input.port;
  const username =
    input.provider === "other" && input.username ? input.username : null;

  if (!info.host && !hostnamePattern.test(host)) {
    fieldErrors.host =
      "Enter the mail server's name, such as mail.yourcompany.com.";
  }

  if (!isSmtpPort(port)) {
    fieldErrors.port = `Choose one of these ports: ${SMTP_PORTS.join(", ")}.`;
  }

  let password = input.password ?? "";

  if (info.stripPasswordSpaces) {
    password = password.replace(/\s+/g, "");
  }

  if (!password) {
    const sameMailbox =
      saved?.readable &&
      saved.settings.host === host &&
      saved.settings.address === input.address &&
      (saved.view.username ?? null) === username;

    if (sameMailbox && saved?.readable) {
      password = saved.settings.password;
    } else {
      fieldErrors.password = `Enter the ${info.passwordLabel.toLowerCase()}.`;
    }
  }

  if (Object.keys(fieldErrors).length > 0 || !isSmtpPort(port)) {
    return { fieldErrors, ok: false };
  }

  return {
    ok: true,
    settings: {
      address: input.address,
      host,
      password,
      port,
      provider: input.provider,
      username: username ?? input.address,
    },
  };
}

export async function saveEmailTransport(
  settings: SmtpSettings,
  userId: string | null,
  {
    database = getDb(),
    env = process.env,
  }: { database?: DbExecutor; env?: EnvSource } = {},
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  await database.query(
    `
      INSERT INTO public.email_transport (
        id, provider, host, port, address, username,
        encrypted_password, updated_at, updated_by
      )
      VALUES (true, $1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        provider = excluded.provider,
        host = excluded.host,
        port = excluded.port,
        address = excluded.address,
        username = excluded.username,
        encrypted_password = excluded.encrypted_password,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `,
    [
      settings.provider,
      settings.host,
      settings.port,
      settings.address,
      settings.username === settings.address ? null : settings.username,
      encryptTransportPassword(settings.password, env),
      now,
      userId,
    ],
  );

  invalidateEmailTransportCache();
}

/** Goes back to sending through Resend. */
export async function clearEmailTransport(
  database: DbExecutor = getDb(),
): Promise<boolean> {
  const result = await database.query(
    "DELETE FROM public.email_transport WHERE id",
  );

  invalidateEmailTransportCache();

  return (result.rowCount ?? 0) > 0;
}
