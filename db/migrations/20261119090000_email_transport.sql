-- The mailbox the install sends its email from, when an administrator has
-- chosen one in Settings instead of Resend: a Gmail, Yahoo or Zoho account,
-- or another mail server. At most one row. With no row, email goes through
-- Resend as before.
--
-- The password is never stored as typed: it is encrypted with a key derived
-- from the site's auth secret (see email-transport.ts).

create table if not exists public.email_transport (
  id boolean primary key default true check (id),
  provider text not null
    check (provider in ('gmail', 'yahoo', 'zoho', 'other')),
  host text not null,
  port integer not null check (port in (465, 587, 2525, 25)),
  -- The address mail is sent from.
  address text not null,
  -- The sign-in name, when the server wants something other than the address.
  username text,
  encrypted_password text not null,
  updated_at bigint not null,
  updated_by text
);
