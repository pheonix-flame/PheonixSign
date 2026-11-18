import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeDatabaseUrl,
  readDatabasePassword,
  resolveDatabaseUrl,
  resolveMigrationDatabaseUrl,
} from "./database-url.mjs";

test("migrations prefer the direct URL that belongs to the URL in use", () => {
  assert.deepEqual(
    resolveMigrationDatabaseUrl({
      DATABASE_URL: "postgres://a",
      DATABASE_URL_UNPOOLED: "postgres://a-direct",
      POSTGRES_URL_NON_POOLING: "postgres://unrelated",
    }),
    { name: "DATABASE_URL_UNPOOLED", value: "postgres://a-direct" },
  );
  assert.deepEqual(
    resolveMigrationDatabaseUrl({
      DATABASE_URL: "postgres://a",
      POSTGRES_URL_NON_POOLING: "postgres://unrelated",
    }),
    { name: "DATABASE_URL", value: "postgres://a" },
  );
  assert.deepEqual(
    resolveMigrationDatabaseUrl({
      POSTGRES_URL: "postgres://b",
      POSTGRES_URL_NON_POOLING: "postgres://b-direct",
    }),
    { name: "POSTGRES_URL_NON_POOLING", value: "postgres://b-direct" },
  );
  assert.equal(resolveMigrationDatabaseUrl({}), null);
});

test("a database connected with the INKSEAL prefix is found", () => {
  const env = {
    INKSEAL_DATABASE_URL: "postgres://c",
    INKSEAL_DATABASE_URL_UNPOOLED: "postgres://c-direct",
    INKSEAL_POSTGRES_URL: "postgres://c-pooled",
    INKSEAL_POSTGRES_URL_NON_POOLING: "postgres://c-direct-too",
  };

  assert.deepEqual(resolveDatabaseUrl(env), {
    name: "INKSEAL_DATABASE_URL",
    value: "postgres://c",
  });
  assert.deepEqual(resolveMigrationDatabaseUrl(env), {
    name: "INKSEAL_DATABASE_URL_UNPOOLED",
    value: "postgres://c-direct",
  });
  assert.deepEqual(
    resolveDatabaseUrl({ INKSEAL_POSTGRES_URL: "postgres://d" }),
    { name: "INKSEAL_POSTGRES_URL", value: "postgres://d" },
  );
  // Unprefixed names still come first.
  assert.equal(
    resolveDatabaseUrl({ ...env, DATABASE_URL: "postgres://a" })?.name,
    "DATABASE_URL",
  );
});

test("an unpooled URL alone is not enough for the app", () => {
  assert.equal(
    resolveDatabaseUrl({ DATABASE_URL_UNPOOLED: "postgres://a-direct" }),
    null,
  );
});

test("TLS settings are made explicit", () => {
  assert.equal(
    normalizeDatabaseUrl("postgres://u:p@db.example.com/app?sslmode=require"),
    "postgres://u:p@db.example.com/app?sslmode=verify-full",
  );
  assert.equal(
    normalizeDatabaseUrl(
      "postgres://u:p@db.ref.supabase.co:5432/postgres?sslmode=require",
    ),
    "postgres://u:p@db.ref.supabase.co:5432/postgres?sslmode=require&uselibpqcompat=true",
  );

  for (const unchanged of [
    "postgres://u:p@127.0.0.1:5432/app",
    "postgres://u:p@db.example.com/app?sslmode=disable",
    "postgres://u:p@db.example.com/app?sslmode=no-verify",
    "postgres://u:p@db.example.com/app?sslmode=require&uselibpqcompat=true",
    // Asking Supabase for certificate checks must never be downgraded.
    "postgres://u:p@db.ref.supabase.co:5432/postgres?sslmode=verify-ca",
    "postgres://u:p@db.ref.supabase.co:5432/postgres?sslmode=verify-full",
    "postgres://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=verify-ca&sslrootcert=/ca.crt",
    "not a url",
  ]) {
    assert.equal(normalizeDatabaseUrl(unchanged), unchanged);
  }
});

test("the password is read decoded", () => {
  assert.equal(readDatabasePassword("postgres://u:p%40ss@h/db"), "p@ss");
  assert.equal(readDatabasePassword("postgres://u@h/db"), undefined);
  assert.equal(readDatabasePassword("nonsense"), undefined);
});
