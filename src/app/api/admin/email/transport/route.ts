import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin";
import { getEmailStatus } from "@/lib/email-status";
import { sendTestEmail } from "@/lib/email-test";
import {
  clearEmailTransport,
  emailTransportInputSchema,
  loadEmailTransport,
  resolveTransportInput,
  saveEmailTransport,
} from "@/lib/email-transport";
import { logRouteError } from "@/lib/security/logging";
import {
  applyRateLimit,
  buildRateLimitKey,
} from "@/lib/security/route-controls";
import { getClientIpAddress, getRequestPathname } from "@/lib/security/request";
import { recordAdminActivity } from "@/lib/services/admin-activity";
import { createSmtpClient, describeSmtpError } from "@/lib/services/smtp";
import { getSettings, markEmailReady } from "@/lib/settings";

// The mailbox the site sends its email from, chosen in Settings,
// Organization: Gmail, Yahoo, Zoho or another mail server, instead of
// Resend. Administrators only. The password is never sent back.

const privateNoStore = { "cache-control": "private, no-store" };

function failure(request: Request, error: unknown, userId: string) {
  logRouteError(error, {
    category: "email_setup_failure",
    ipAddress: getClientIpAddress(request.headers),
    message: "Unexpected failure while changing how email is sent.",
    path: getRequestPathname(request),
    userId,
  });

  return NextResponse.json(
    { error: "Email settings could not be saved. Please try again." },
    { headers: privateNoStore, status: 500 },
  );
}

async function limit(request: Request, userId: string) {
  return applyRateLimit({
    category: "email_transport_change",
    key: buildRateLimitKey(["email-transport", userId]),
    limit: 15,
    request,
    userId,
    windowMs: 10 * 60 * 1000,
  });
}

export async function GET(request: Request) {
  const sessionResult = await requireAdminSession(request);

  if (sessionResult instanceof Response) {
    return sessionResult;
  }

  try {
    const transport = await loadEmailTransport();

    return NextResponse.json(
      { transport: transport?.view ?? null },
      { headers: privateNoStore },
    );
  } catch (error) {
    return failure(request, error, sessionResult.user.id);
  }
}

/**
 * Signs in to the mailbox to check the address and password, saves it, and
 * sends the administrator a test email through it. Nothing is saved if the
 * mail server does not accept the sign-in.
 */
export async function PUT(request: Request) {
  const sessionResult = await requireAdminSession(request);

  if (sessionResult instanceof Response) {
    return sessionResult;
  }

  const session = sessionResult;
  const rateLimitResponse = await limit(request, session.user.id);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const parsed = emailTransportInputSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};

    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");

      fieldErrors[field] ??= issue.message;
    }

    return NextResponse.json(
      { error: "Check the highlighted fields.", fieldErrors },
      { headers: privateNoStore, status: 400 },
    );
  }

  try {
    const saved = await loadEmailTransport();
    const resolved = resolveTransportInput(parsed.data, saved);

    if (!resolved.ok) {
      return NextResponse.json(
        {
          error: "Check the highlighted fields.",
          fieldErrors: resolved.fieldErrors,
        },
        { headers: privateNoStore, status: 400 },
      );
    }

    const client = createSmtpClient(resolved.settings);

    try {
      await client.verify();
    } catch (error) {
      return NextResponse.json(
        { error: describeSmtpError(error, resolved.settings) },
        { headers: privateNoStore, status: 400 },
      );
    } finally {
      client.close();
    }

    // Until a test email has gone through the new mailbox, Settings does
    // not say email works.
    await markEmailReady(false, await getSettings());
    await saveEmailTransport(resolved.settings, session.user.id);
    await recordAdminActivity({
      event: "email_provider_changed",
      metadata: {
        action: "connected",
        address: resolved.settings.address,
        host: resolved.settings.host,
        provider: resolved.settings.provider,
      },
      request,
      user: session.user,
    });

    const test = await sendTestEmail({
      name: session.user.name,
      to: session.user.email,
    });
    const transport = await loadEmailTransport();

    return NextResponse.json(
      {
        status: await getEmailStatus(),
        test,
        transport: transport?.view ?? null,
      },
      { headers: privateNoStore },
    );
  } catch (error) {
    return failure(request, error, session.user.id);
  }
}

/** Stops using the mailbox: email goes through Resend again. */
export async function DELETE(request: Request) {
  const sessionResult = await requireAdminSession(request);

  if (sessionResult instanceof Response) {
    return sessionResult;
  }

  const session = sessionResult;
  const rateLimitResponse = await limit(request, session.user.id);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const removed = await clearEmailTransport();

    if (removed) {
      await markEmailReady(false, await getSettings());
      await recordAdminActivity({
        event: "email_provider_changed",
        metadata: { action: "removed" },
        request,
        user: session.user,
      });
    }

    return NextResponse.json(
      { status: await getEmailStatus(), transport: null },
      { headers: privateNoStore },
    );
  } catch (error) {
    return failure(request, error, session.user.id);
  }
}
