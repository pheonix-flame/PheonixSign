import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decryptTransportPassword,
  encryptTransportPassword,
  type LoadedEmailTransport,
  emailTransportInputSchema,
  resolveTransportInput,
  rowToTransport,
} from "./email-transport.ts";

// What an administrator types in Settings, and how the saved mailbox is
// kept. Nothing here connects to a mail server or a database.

const ENV = {
  BETTER_AUTH_SECRET: "a".repeat(64),
  NODE_ENV: "test",
};

function parse(input: Record<string, unknown>) {
  return emailTransportInputSchema.parse(input);
}

test("Gmail fills in its own server and drops the spaces Google shows", () => {
  const result = resolveTransportInput(
    parse({
      address: " You@Gmail.com ",
      password: "abcd efgh ijkl mnop",
      provider: "gmail",
    }),
    null,
  );

  assert.deepEqual(result, {
    ok: true,
    settings: {
      address: "you@gmail.com",
      host: "smtp.gmail.com",
      password: "abcdefghijklmnop",
      port: 465,
      provider: "gmail",
      username: "you@gmail.com",
    },
  });
});

test("a known provider's server cannot be swapped for another", () => {
  const result = resolveTransportInput(
    parse({
      address: "me@yahoo.com",
      host: "evil.example.com",
      password: "secret",
      port: 25,
      provider: "yahoo",
    }),
    null,
  );

  assert.ok(result.ok);
  assert.equal(result.settings.host, "smtp.mail.yahoo.com");
  assert.equal(result.settings.port, 465);
});

test("another server needs a real host name and a mail port", () => {
  const result = resolveTransportInput(
    parse({
      address: "sign@acme.com",
      host: "http://mail.acme.com/",
      password: "secret",
      port: 8080,
      provider: "other",
    }),
    null,
  );

  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.fieldErrors.host);
  assert.ok(!result.ok && result.fieldErrors.port);

  const good = resolveTransportInput(
    parse({
      address: "sign@acme.com",
      host: "Mail.Acme.com",
      password: "pass word",
      port: "587",
      provider: "other",
      username: "acme\\sign",
    }),
    null,
  );

  assert.ok(good.ok);
  assert.equal(good.settings.host, "mail.acme.com");
  assert.equal(good.settings.port, 587);
  // Only app passwords lose their spaces.
  assert.equal(good.settings.password, "pass word");
  assert.equal(good.settings.username, "acme\\sign");
});

test("a password left empty keeps the saved one only for the same mailbox", () => {
  const saved: LoadedEmailTransport = {
    readable: true,
    settings: {
      address: "you@gmail.com",
      host: "smtp.gmail.com",
      password: "savedpassword",
      port: 465,
      provider: "gmail",
      username: "you@gmail.com",
    },
    view: {
      address: "you@gmail.com",
      host: "smtp.gmail.com",
      passwordReadable: true,
      port: 465,
      provider: "gmail",
      updatedAt: 1,
      username: null,
    },
  };

  const same = resolveTransportInput(
    parse({ address: "you@gmail.com", provider: "gmail" }),
    saved,
  );

  assert.ok(same.ok);
  assert.equal(same.settings.password, "savedpassword");

  // A different mailbox must never be sent the saved password.
  const other = resolveTransportInput(
    parse({ address: "someone@gmail.com", provider: "gmail" }),
    saved,
  );

  assert.equal(other.ok, false);
  assert.ok(!other.ok && other.fieldErrors.password);

  const otherServer = resolveTransportInput(
    parse({
      address: "you@gmail.com",
      host: "mail.attacker.example",
      port: 587,
      provider: "other",
    }),
    saved,
  );

  assert.equal(otherServer.ok, false);
});

test("the address must be an email address", () => {
  assert.throws(() =>
    parse({ address: "not-an-address", password: "x", provider: "gmail" }),
  );
  assert.throws(() =>
    parse({ address: "a@b.com", password: "x", provider: "outlook" }),
  );
});

test("the password is stored encrypted and read back with the same secret", () => {
  const stored = encryptTransportPassword("my app password", ENV);

  assert.ok(!stored.includes("my app password"));
  assert.equal(decryptTransportPassword(stored, ENV), "my app password");
  assert.equal(
    decryptTransportPassword(stored, {
      ...ENV,
      BETTER_AUTH_SECRET: "b".repeat(64),
    }),
    null,
  );
});

test("a saved password the site can no longer read is reported, not used", () => {
  const row = {
    address: "you@gmail.com",
    encryptedPassword: encryptTransportPassword("pw", {
      ...ENV,
      BETTER_AUTH_SECRET: "c".repeat(64),
    }),
    host: "smtp.gmail.com",
    port: 465,
    provider: "gmail",
    updatedAt: "1700000000",
    username: null,
  };

  const loaded = rowToTransport(row, ENV);

  assert.equal(loaded?.readable, false);
  assert.equal(loaded?.view.passwordReadable, false);
  assert.equal(loaded?.view.updatedAt, 1700000000);
  assert.ok(!("settings" in (loaded ?? {})));

  const readable = rowToTransport(
    { ...row, encryptedPassword: encryptTransportPassword("pw", ENV) },
    ENV,
  );

  assert.ok(readable?.readable);
  assert.equal(readable.settings.password, "pw");
  assert.equal(readable.settings.username, "you@gmail.com");
});
