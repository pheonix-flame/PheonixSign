import {
  type DbPool,
  getDb,
  queryOne,
  withTransaction,
} from "./db/connection.ts";
import { EnvelopeMutationError } from "./envelopes.ts";
import {
  deletePendingFile,
  listEnvelopeStorageKeys,
  queueFileDeletions,
} from "./retention.ts";
import {
  createStorageService,
  type StorageService,
} from "./services/storage.ts";
import { recordSystemAuditEvent } from "./services/system-audit.ts";

// An administrator may delete a finished envelope of theirs by hand: the
// signed PDF, the certificates, the fields and the envelope's own audit
// trail all go, as they do when the retention period deletes it. What was
// deleted, by whom and why stays in the install's audit trail, with the
// fingerprints the certificate gave, so the deletion itself is on record.

const FINISHED_STATUSES = ["completed", "declined", "voided"] as const;

export const ENVELOPE_DELETION_REASON_MAX_LENGTH = 1000;

type FinishedEnvelopeRow = {
  evidenceSha256: string | null;
  finishedAt: number | null;
  id: string;
  part11: boolean;
  recipientEvidenceSha256: string | null;
  signedPdfSha256: string | null;
  sourcePdfHash: string;
  status: string;
  title: string;
};

export type FinishedEnvelopeDeletion = {
  actor: { email: string; userId: string };
  ipAddress?: string | null;
  reason?: unknown;
  userAgent?: string | null;
};

function parseReason(reason: unknown, part11: boolean): string | null {
  if (reason !== undefined && reason !== null && typeof reason !== "string") {
    throw new EnvelopeMutationError("The reason must be text.", 400);
  }

  const trimmed = typeof reason === "string" ? reason.trim() : "";

  if (trimmed.length > ENVELOPE_DELETION_REASON_MAX_LENGTH) {
    throw new EnvelopeMutationError(
      `Keep the reason under ${String(ENVELOPE_DELETION_REASON_MAX_LENGTH)} characters.`,
      400,
    );
  }

  if (part11 && trimmed.length === 0) {
    throw new EnvelopeMutationError(
      "Give a reason for deleting this Part 11 record.",
      400,
    );
  }

  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Deletes a completed, declined or voided envelope the administrator owns,
 * with its files, and records the deletion in the install's audit trail.
 */
export async function deleteFinishedEnvelope(
  envelopeId: string,
  {
    actor,
    ipAddress = null,
    reason,
    userAgent = null,
  }: FinishedEnvelopeDeletion,
  {
    database = getDb(),
    storageService = createStorageService(),
  }: {
    database?: DbPool;
    storageService?: StorageService;
  } = {},
): Promise<{ deletedEnvelopeId: string }> {
  const { deletedEnvelopeId, storageKeys } = await withTransaction(
    async (tx) => {
      // The administrator's own account row before the envelope row. Taking
      // away the role holds that row (FOR UPDATE) before it takes the audit
      // trail lock and moves the account's handed-over envelopes, so the
      // two wait for each other here instead of each holding what the
      // other needs. Read under this lock, the role is the one in force:
      // a change since the page loaded is honored.
      const actorRole = await queryOne<{ role: string }>(
        tx,
        `SELECT role FROM public."user" WHERE id = $1 FOR SHARE`,
        [actor.userId],
      );

      // Then the envelope row, as everything that changes an envelope takes
      // it; the install's audit trail lock comes after.
      const envelope = await queryOne<FinishedEnvelopeRow>(
        tx,
        `
        SELECT
          id,
          title,
          status,
          part11,
          source_pdf_hash AS "sourcePdfHash",
          signed_pdf_sha256 AS "signedPdfSha256",
          evidence_sha256 AS "evidenceSha256",
          recipient_evidence_sha256 AS "recipientEvidenceSha256",
          COALESCE(completed_at, declined_at, voided_at) AS "finishedAt"
        FROM envelopes
        WHERE id = $1 AND user_id = $2
        FOR UPDATE
      `,
        [envelopeId, actor.userId],
      );

      if (!envelope) {
        throw new EnvelopeMutationError("Envelope not found.", 404);
      }

      if (!(FINISHED_STATUSES as readonly string[]).includes(envelope.status)) {
        throw new EnvelopeMutationError(
          envelope.status === "sent"
            ? "This envelope is still out for signature. Void it first."
            : "Only finished envelopes can be deleted this way.",
          409,
        );
      }

      if (actorRole?.role !== "admin") {
        throw new EnvelopeMutationError(
          "Only an administrator can delete a finished envelope.",
          403,
        );
      }

      const deletionReason = parseReason(reason, envelope.part11);

      await recordSystemAuditEvent(
        {
          actorEmail: actor.email,
          actorUserId: actor.userId,
          event: "envelope_deleted",
          ipAddress,
          metadata: {
            envelopeId: envelope.id,
            evidenceSha256: envelope.evidenceSha256,
            finishedAt: envelope.finishedAt,
            part11: envelope.part11,
            reason: deletionReason,
            recipientEvidenceSha256: envelope.recipientEvidenceSha256,
            signedPdfSha256: envelope.signedPdfSha256,
            sourcePdfHash: envelope.sourcePdfHash,
            status: envelope.status,
            title: envelope.title,
          },
          userAgent,
        },
        tx,
      );

      // The row, the record of its deletion and the list of its files
      // commit together. The files cannot roll back with them, so they go
      // only after the commit; one that cannot be deleted then stays on the
      // list, and the daily cleanup tries it again.
      const storageKeys = await listEnvelopeStorageKeys(envelope.id, tx);

      await queueFileDeletions(
        envelope.id,
        storageKeys,
        Math.floor(Date.now() / 1000),
        tx,
      );
      const deleted = await tx.query(`DELETE FROM envelopes WHERE id = $1`, [
        envelope.id,
      ]);

      if (deleted.rowCount !== 1) {
        throw new EnvelopeMutationError("Envelope not found.", 404);
      }

      return { deletedEnvelopeId: envelope.id, storageKeys };
    },
    database,
  );

  for (const key of storageKeys) {
    await deletePendingFile(key, database, storageService);
  }

  return { deletedEnvelopeId };
}
