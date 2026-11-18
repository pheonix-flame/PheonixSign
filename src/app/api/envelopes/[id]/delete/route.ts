import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/connection";
import { deleteFinishedEnvelope } from "@/lib/envelope-deletion";
import { EnvelopeMutationError } from "@/lib/envelopes";
import { logRouteError } from "@/lib/security/logging";
import {
  applyRateLimit,
  buildRateLimitKey,
} from "@/lib/security/route-controls";
import {
  getClientIpAddress,
  getRequestPathname,
  getRequestUserAgent,
} from "@/lib/security/request";

// Deletes a finished envelope for good. Drafts are deleted with DELETE on
// the envelope itself; this is for completed, declined and voided ones, and
// only an administrator may do it.

type EnvelopeDeleteRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const NO_STORE = { "cache-control": "private, no-store" };

export async function POST(
  request: Request,
  context: EnvelopeDeleteRouteContext,
) {
  const sessionResult = await requireAdminSession(request);

  if (sessionResult instanceof Response) {
    return sessionResult;
  }

  const session = sessionResult;
  const { id } = await context.params;
  const ipAddress = getClientIpAddress(request.headers);
  const rateLimitResponse = await applyRateLimit({
    category: "finished_envelope_delete",
    key: buildRateLimitKey(["envelope-delete", session.user.id]),
    limit: 60,
    request,
    userId: session.user.id,
    windowMs: 10 * 60 * 1000,
  });

  if (rateLimitResponse) {
    rateLimitResponse.headers.set("cache-control", "private, no-store");
    return rateLimitResponse;
  }

  const body = (await request.json().catch(() => null)) as {
    reason?: unknown;
  } | null;

  try {
    const result = await deleteFinishedEnvelope(
      id,
      {
        actor: { email: session.user.email, userId: session.user.id },
        ipAddress,
        reason: body?.reason ?? null,
        userAgent: getRequestUserAgent(request.headers),
      },
      { database: getDb() },
    );

    return NextResponse.json(
      { ...result, redirectPath: "/dashboard" },
      { headers: NO_STORE, status: 200 },
    );
  } catch (error) {
    if (error instanceof EnvelopeMutationError) {
      return NextResponse.json(
        { error: error.message },
        { headers: NO_STORE, status: error.statusCode },
      );
    }

    logRouteError(error, {
      category: "finished_envelope_delete_failure",
      ipAddress,
      message: "Unexpected failure while deleting a finished envelope.",
      path: getRequestPathname(request),
      userId: session.user.id,
    });

    return NextResponse.json(
      { error: "Unable to delete this envelope." },
      { headers: NO_STORE, status: 500 },
    );
  }
}
