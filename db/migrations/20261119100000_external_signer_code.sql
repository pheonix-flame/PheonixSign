-- Whether people outside the organization must enter a one-time code,
-- emailed to them, before they can open and sign a document. On by default.
-- Who counts as outside is worked out when an envelope is sent: see
-- external-signers.ts.

alter table public.app_settings
  add column if not exists external_signer_code boolean not null default true;
