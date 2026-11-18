import { type DbExecutor, getDb, queryMany } from "./db/connection.ts";
import type { AppSettings } from "./settings.ts";
import { getEmailDomain, isPublicMailboxDomain } from "./signup-policy.ts";

// Who is inside the organization and who is not, for signing.
//
// When the organization asks for it (Settings, Organization: "People
// outside the organization must enter a code"), everyone outside has to
// enter a one-time code emailed to them before they can open and sign, on
// top of whatever check the sender chose. The sender can still ask for a
// code from people inside too.
//
// Someone is inside when either:
//
// - their address is at one of the organization's own domains: the ones
//   people may create accounts with ("People at my organization"). Public
//   mailbox providers such as gmail.com never count, even if listed; or
// - they have an account on this site whose address has been confirmed,
//   and accounts are not open to anyone who asks (with open sign-up, having
//   an account says nothing about who someone is).
//
// Everyone else is outside. A small business that sends from Gmail has no
// domain of its own, so only its own account holders are inside.

export type InsideRules = Pick<
  AppSettings,
  "allowedEmailDomains" | "externalSignerCode" | "signupMode"
> & {
  /** The hosted public service, where accounts belong to strangers. */
  hosted: boolean;
};

/** The organization's own domains, without any public mailbox provider. */
export function organizationDomains(rules: InsideRules): string[] {
  if (rules.signupMode !== "domains") {
    return [];
  }

  return rules.allowedEmailDomains
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain && !isPublicMailboxDomain(domain));
}

/** Whether accounts on this site say who is inside. */
export function accountsCountAsInside(rules: InsideRules): boolean {
  return !rules.hosted && rules.signupMode !== "open";
}

/**
 * The addresses, lowercased, that belong to people inside the
 * organization: at one of its domains, or with a confirmed account here.
 */
export async function findInsideAddresses(
  emails: readonly string[],
  rules: InsideRules,
  database: DbExecutor = getDb(),
): Promise<Set<string>> {
  const domains = new Set(organizationDomains(rules));
  const inside = new Set<string>();
  const rest: string[] = [];

  for (const email of emails) {
    const address = email.trim().toLowerCase();
    const domain = getEmailDomain(address);

    if (domain && domains.has(domain)) {
      inside.add(address);
    } else {
      rest.push(address);
    }
  }

  if (rest.length > 0 && accountsCountAsInside(rules)) {
    const rows = await queryMany<{ email: string }>(
      database,
      `
        SELECT lower(email) AS email
        FROM "user"
        WHERE lower(email) = ANY($1)
          AND "emailVerified" = true
      `,
      [rest],
    );

    for (const row of rows) {
      inside.add(row.email);
    }
  }

  return inside;
}

/**
 * The signers who must enter an emailed code because they are outside the
 * organization. Empty when the organization does not ask for it.
 */
export async function findSignersNeedingCode<
  T extends { email: string; id: string },
>(
  signers: readonly T[],
  rules: InsideRules,
  database: DbExecutor = getDb(),
): Promise<T[]> {
  if (!rules.externalSignerCode || signers.length === 0) {
    return [];
  }

  const inside = await findInsideAddresses(
    signers.map((signer) => signer.email),
    rules,
    database,
  );

  return signers.filter(
    (signer) => !inside.has(signer.email.trim().toLowerCase()),
  );
}
