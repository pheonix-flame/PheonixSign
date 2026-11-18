import { EnvelopeDetailShell } from "@/components/envelopes/envelope-detail-shell";
import { isAdminUser } from "@/lib/auth/admin";
import { getAuthSession } from "@/lib/auth/server";
import { getDb } from "@/lib/db/connection";
import { getEnvelopeDetailDataForUser } from "@/lib/envelopes";

type EnvelopeDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EnvelopeDetailPage({
  params,
}: EnvelopeDetailPageProps) {
  const { id } = await params;

  let detailRecord: Awaited<ReturnType<typeof getEnvelopeDetailDataForUser>> =
    null;
  let initialState: "error" | "not-found" | undefined;
  let canDeleteFinished = false;

  try {
    const session = await getAuthSession();
    detailRecord = session
      ? await getEnvelopeDetailDataForUser(session.user.id, id, getDb())
      : null;
    initialState = detailRecord ? undefined : "not-found";
    // Only an administrator may delete a finished envelope.
    canDeleteFinished =
      detailRecord !== null &&
      session !== null &&
      (await isAdminUser(session.user.id, getDb()));
  } catch {
    initialState = "error";
  }

  return (
    <EnvelopeDetailShell
      canDeleteFinished={canDeleteFinished}
      envelopeId={id}
      initialState={initialState}
      key={id}
      record={detailRecord ?? undefined}
    />
  );
}
