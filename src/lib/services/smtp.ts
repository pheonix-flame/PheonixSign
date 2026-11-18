import { createTransport } from "nodemailer";

import { SMTP_PROVIDER_INFO } from "../email-providers.ts";
import type { SmtpSettings } from "../email-transport.ts";

// Sends through an ordinary mailbox (Gmail, Yahoo, Zoho or another mail
// server) over SMTP, signing in with the address and its password.
//
// The connection is always encrypted before the password is sent: port 465
// starts encrypted, and on the others the server must agree to switch to
// encryption first, or nothing is sent.

export type SmtpOutgoingMessage = {
  attachments?: Array<{
    content: Buffer;
    contentType: string;
    filename: string;
  }>;
  from: string;
  html?: string;
  replyTo?: string;
  subject: string;
  text: string;
  to: string;
};

export type SmtpDelivery = {
  accepted: string[];
  messageId?: string;
  rejected: string[];
};

/** The part of a mail connection used here. Replaced by a fake in tests. */
export interface SmtpClient {
  close(): void;
  send(message: SmtpOutgoingMessage): Promise<SmtpDelivery>;
  /** Connects and signs in, without sending anything. */
  verify(): Promise<void>;
}

export type CreateSmtpClient = (settings: SmtpSettings) => SmtpClient;

function addressesOf(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) =>
    typeof item === "string"
      ? item
      : String((item as { address?: unknown }).address ?? ""),
  );
}

export const createSmtpClient: CreateSmtpClient = (settings) => {
  const transport = createTransport({
    auth: { pass: settings.password, user: settings.username },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    host: settings.host,
    port: settings.port,
    requireTLS: settings.port !== 465,
    secure: settings.port === 465,
    socketTimeout: 60_000,
    tls: { minVersion: "TLSv1.2", servername: settings.host },
  });

  return {
    close: () => transport.close(),
    async send(message) {
      const info = (await transport.sendMail(message)) as {
        accepted?: unknown;
        messageId?: unknown;
        rejected?: unknown;
      };

      return {
        accepted: addressesOf(info.accepted),
        messageId:
          typeof info.messageId === "string" ? info.messageId : undefined,
        rejected: addressesOf(info.rejected),
      };
    },
    async verify() {
      await transport.verify();
    },
  };
};

/**
 * What went wrong, in words an administrator can act on. The mail server's
 * own reply is kept at the end, because it often names the exact problem.
 */
export function describeSmtpError(
  error: unknown,
  settings: Pick<SmtpSettings, "host" | "port" | "provider">,
): string {
  const details = error as {
    code?: unknown;
    message?: unknown;
    response?: unknown;
  };
  const code = typeof details?.code === "string" ? details.code : "";
  const serverReply =
    typeof details?.response === "string"
      ? details.response
      : typeof details?.message === "string"
        ? details.message
        : "";
  const suffix = serverReply ? ` The mail server said: ${serverReply}` : "";
  const info = SMTP_PROVIDER_INFO[settings.provider];

  if (code === "EAUTH") {
    return info.stripPasswordSpaces
      ? `${info.label} did not accept that address and app password. Check the address, and make a new app password if needed: your normal password does not work here.${suffix}`
      : `The mail server did not accept that address and password.${suffix}`;
  }

  if (
    code === "ECONNECTION" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKET" ||
    code === "EDNS" ||
    code === "ECONNREFUSED"
  ) {
    return `${settings.host} could not be reached on port ${String(settings.port)}. Check the server name and port.${suffix}`;
  }

  if (code === "ETLS") {
    return `${settings.host} would not set up an encrypted connection on port ${String(settings.port)}, so the password was not sent. Try port 465 or 587.${suffix}`;
  }

  if (code === "EENVELOPE") {
    return `The mail server refused the sender or recipient address.${suffix}`;
  }

  return serverReply
    ? `The email could not be sent. The mail server said: ${serverReply}`
    : "The email could not be sent through this mailbox.";
}
