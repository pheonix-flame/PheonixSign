import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import type pg from "pg";

import { openTestDatabase } from "./db/test-database.ts";
import {
  clearEmailTransport,
  invalidateEmailTransportCache,
  loadEmailTransport,
  saveEmailTransport,
} from "./email-transport.ts";

// The mailbox an administrator chose to send from, saved and read back
// against a real Postgres. Run with `npm run test:db`.

const ENV = { BETTER_AUTH_SECRET: "d".repeat(64), NODE_ENV: "test" };

let database: pg.Pool;

before(async () => {
  database = await openTestDatabase();
  await clearEmailTransport(database);
});

after(async () => {
  await clearEmailTransport(database);
  invalidateEmailTransportCache();
  await database.end();
});

test("a mailbox is saved with its password encrypted, read back, and removed", async () => {
  assert.equal(await loadEmailTransport(ENV, database), null);

  await saveEmailTransport(
    {
      address: "office@yahoo.com",
      host: "smtp.mail.yahoo.com",
      password: "abcdefghijklmnop",
      port: 465,
      provider: "yahoo",
      username: "office@yahoo.com",
    },
    null,
    { database, env: ENV },
  );

  const stored = await database.query<{ encrypted: string; username: unknown }>(
    `select encrypted_password as encrypted, username from email_transport`,
  );

  assert.equal(stored.rowCount, 1);
  assert.ok(!stored.rows[0]?.encrypted.includes("abcdefghijklmnop"));
  // The sign-in name is only kept when it differs from the address.
  assert.equal(stored.rows[0]?.username, null);

  const loaded = await loadEmailTransport(ENV, database);

  assert.ok(loaded?.readable);
  assert.equal(loaded.settings.password, "abcdefghijklmnop");
  assert.equal(loaded.view.provider, "yahoo");
  assert.ok(!("password" in loaded.view));

  // Saving again replaces the one row.
  await saveEmailTransport(
    {
      address: "sign@acme.test",
      host: "mail.acme.test",
      password: "second",
      port: 587,
      provider: "other",
      username: "acme\\sign",
    },
    "admin-id",
    { database, env: ENV },
  );

  const replaced = await loadEmailTransport(ENV, database);

  assert.ok(replaced?.readable);
  assert.equal(replaced.settings.username, "acme\\sign");
  assert.equal(replaced.view.username, "acme\\sign");
  assert.equal(
    (await database.query(`select 1 from email_transport`)).rowCount,
    1,
  );

  // With another secret the password cannot be read, and is not used.
  const otherSecret = await loadEmailTransport(
    { ...ENV, BETTER_AUTH_SECRET: "e".repeat(64) },
    database,
  );

  assert.equal(otherSecret?.readable, false);

  assert.equal(await clearEmailTransport(database), true);
  assert.equal(await loadEmailTransport(ENV, database), null);
  assert.equal(await clearEmailTransport(database), false);
});
