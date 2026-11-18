// The mailboxes an administrator can send PheonixSign's email from, instead of
// Resend: their own Gmail, Yahoo or Zoho account, or any other mail server
// that takes a password over SMTP. Plain data, so both the server and the
// Settings page can read it.
//
// Outlook and Microsoft 365 are not offered: Microsoft no longer accepts a
// password from apps sending mail this way. An organization on Microsoft
// 365 sends through Resend from its own domain instead.

export const SMTP_PROVIDERS = ["gmail", "yahoo", "zoho", "other"] as const;

export type SmtpProvider = (typeof SMTP_PROVIDERS)[number];

/**
 * The ports a mail server is reached on. 465 starts encrypted; the others
 * must switch to encryption before the password is sent, or the connection
 * is dropped. Anything else is refused, so this cannot be pointed at other
 * kinds of service.
 */
export const SMTP_PORTS = [465, 587, 2525, 25] as const;

export type SmtpPort = (typeof SMTP_PORTS)[number];

export type SmtpProviderInfo = {
  /** What the address field is called and shows as an example. */
  addressPlaceholder: string;
  /** Null for "other": the administrator types it in. */
  host: string | null;
  label: string;
  /** Something worth knowing before choosing it, such as a daily limit. */
  note?: string;
  /** What the password field is called. */
  passwordLabel: string;
  /** Where the password is made, when the provider has a page for it. */
  passwordLink?: { href: string; label: string };
  /** How to get the password, step by step. */
  passwordSteps: string[];
  port: SmtpPort | null;
  /** App passwords are shown in groups with spaces, which are not part of them. */
  stripPasswordSpaces: boolean;
};

export const SMTP_PROVIDER_INFO: Record<SmtpProvider, SmtpProviderInfo> = {
  gmail: {
    addressPlaceholder: "you@gmail.com",
    host: "smtp.gmail.com",
    label: "Gmail or Google Workspace",
    note: "Gmail sends about 500 emails a day from a personal account, and 2,000 from Google Workspace.",
    passwordLabel: "App password",
    passwordLink: {
      href: "https://myaccount.google.com/apppasswords",
      label: "Open Google App passwords",
    },
    passwordSteps: [
      "Sign in to the Google account you want to send from. 2-Step Verification must be on: Google only offers app passwords then.",
      "Open App passwords, type PheonixSign as the name, and click Create.",
      "Copy the 16-letter password Google shows and paste it below. It is not your normal Gmail password.",
    ],
    port: 465,
    stripPasswordSpaces: true,
  },
  yahoo: {
    addressPlaceholder: "you@yahoo.com",
    host: "smtp.mail.yahoo.com",
    label: "Yahoo Mail",
    note: "Yahoo limits how many emails an account sends a day, and may hold back a burst of them.",
    passwordLabel: "App password",
    passwordLink: {
      href: "https://login.yahoo.com/account/security",
      label: "Open Yahoo Account Security",
    },
    passwordSteps: [
      "Sign in to Yahoo and open Account Security.",
      "Choose Generate app password (or Manage app passwords), name it PheonixSign, and click Generate.",
      "Copy the password Yahoo shows and paste it below. It is not your normal Yahoo password.",
    ],
    port: 465,
    stripPasswordSpaces: true,
  },
  zoho: {
    addressPlaceholder: "you@yourcompany.com",
    host: "smtp.zoho.com",
    label: "Zoho Mail",
    note: "Zoho accounts in the EU use smtp.zoho.eu: choose Other email server and enter it there.",
    passwordLabel: "Password or app password",
    passwordLink: {
      href: "https://accounts.zoho.com/home#security/app_password",
      label: "Open Zoho app passwords",
    },
    passwordSteps: [
      "If the account has two-factor sign-in, open Zoho Accounts, Security, App Passwords, and generate one named PheonixSign.",
      "Otherwise use the mailbox's normal password.",
    ],
    port: 465,
    stripPasswordSpaces: false,
  },
  other: {
    addressPlaceholder: "notifications@yourcompany.com",
    host: null,
    label: "Other email server",
    note: "Outlook and Microsoft 365 no longer accept a password from apps like this one. If your organization uses them, choose Resend and send from your own domain instead.",
    passwordLabel: "Password",
    passwordSteps: [
      "Ask whoever runs your organization's email for the SMTP server name and port. Hosting companies list them in their help pages, often as 'outgoing mail server'.",
      "Use the mailbox's full address and its password.",
    ],
    port: null,
    stripPasswordSpaces: false,
  },
};

export function isSmtpProvider(value: unknown): value is SmtpProvider {
  return (
    typeof value === "string" &&
    (SMTP_PROVIDERS as readonly string[]).includes(value)
  );
}

export function isSmtpPort(value: unknown): value is SmtpPort {
  return (
    typeof value === "number" &&
    (SMTP_PORTS as readonly number[]).includes(value)
  );
}

/** What the administrator sees once a mailbox is connected. Never the password. */
export type EmailTransportView = {
  address: string;
  host: string;
  port: SmtpPort;
  provider: SmtpProvider;
  /**
   * False when the saved password can no longer be read, because the
   * site's secret changed since it was saved. It has to be entered again.
   */
  passwordReadable: boolean;
  updatedAt: number;
  /** The sign-in name, when it is not the address. */
  username: string | null;
};
