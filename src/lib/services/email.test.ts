import assert from "node:assert/strict";
import { test } from "node:test";

import type { Resend } from "resend";

import { createEmailService, isEmailNotConnectedError } from "./email.ts";
import type { SmtpOutgoingMessage } from "./smtp.ts";

// What the Resend client is asked to do when the service turns a request
// away for rate. Nothing here talks to Resend.

type Answer = {
  data: { id: string } | null;
  error: { message: string; name: string; statusCode: number } | null;
  headers: Record<string, string> | null;
};

const RATE_LIMITED: Answer = {
  data: null,
  error: {
    message:
      "Too many requests. Please limit the number of requests per second.",
    name: "rate_limit_exceeded",
    statusCode: 429,
  },
  headers: { "retry-after": "1" },
};

const SENT: Answer = { data: { id: "email_1" }, error: null, headers: {} };

const MESSAGE = {
  subject: "Your signed copy",
  template: "completion_notification" as const,
  textBody: "Attached.",
  to: "signer@example.test",
};

/** An email service whose Resend client gives these answers, in order. */
function serviceAnswering(answers: Answer[]) {
  const waits: number[] = [];
  let requests = 0;
  const next = async () => {
    const answer = answers[Math.min(requests, answers.length - 1)];

    requests += 1;

    return answer;
  };
  const service = createEmailService({
    resendClient: {
      batch: { send: next },
      emails: { send: next },
    } as unknown as Resend,
    resolveAddresses: async () => ({
      senderAddress: "Example <hello@example.test>",
      supportAddress: null,
    }),
    wait: async (milliseconds) => {
      waits.push(milliseconds);
    },
  });

  return { requests: () => requests, service, waits };
}

test("a message Resend turns away for rate is sent again after the wait it names", async () => {
  const { requests, service, waits } = serviceAnswering([
    RATE_LIMITED,
    { ...RATE_LIMITED, headers: { "retry-after": "2" } },
    SENT,
  ]);

  const delivery = await service.send(MESSAGE);

  assert.equal(delivery.messageId, "email_1");
  assert.equal(requests(), 3);
  assert.deepEqual(waits, [1000, 2000]);
});

test("a rate limit that does not clear is reported after a few tries", async () => {
  const { requests, service, waits } = serviceAnswering([RATE_LIMITED]);

  await assert.rejects(service.send(MESSAGE), /Too many requests/);
  // The first try and three more.
  assert.equal(requests(), 4);
  assert.equal(waits.length, 3);
});

test("the wait is a second when Resend names none, and is never long", async () => {
  const { service, waits } = serviceAnswering([
    { ...RATE_LIMITED, headers: null },
    { ...RATE_LIMITED, headers: { "retry-after": "3600" } },
    SENT,
  ]);

  await service.send(MESSAGE);

  assert.deepEqual(waits, [1000, 5000]);
});

test("a used-up quota is reported at once: waiting a second does not bring it back", async () => {
  const { requests, service, waits } = serviceAnswering([
    {
      data: null,
      error: {
        message: "You have exceeded your daily email sending quota.",
        name: "daily_quota_exceeded",
        statusCode: 429,
      },
      headers: { "retry-after": "1" },
    },
  ]);

  await assert.rejects(service.send(MESSAGE), /daily email sending quota/);
  assert.equal(requests(), 1);
  assert.deepEqual(waits, []);
});

test("a batch turned away for rate is sent again too", async () => {
  const { requests, service } = serviceAnswering([
    RATE_LIMITED,
    {
      data: { data: [{ id: "email_1" }] } as unknown as { id: string },
      error: null,
      headers: {},
    },
  ]);

  const deliveries = await service.sendBatch([MESSAGE]);

  assert.equal(deliveries[0]?.messageId, "email_1");
  assert.equal(requests(), 2);
});

// Sending through a mailbox chosen in Settings (Gmail and the like). The
// connection is a fake: nothing reaches a mail server.

const MAILBOX = {
  address: "me@gmail.com",
  host: "smtp.gmail.com",
  password: "apppassword",
  port: 465 as const,
  provider: "gmail" as const,
  username: "me@gmail.com",
};

function mailboxService(
  options: {
    failWith?: Error & { code?: string };
    readable?: boolean;
  } = {},
) {
  const sent: SmtpOutgoingMessage[] = [];
  let connections = 0;
  let closed = 0;
  const service = createEmailService({
    createSmtp: (settings) => {
      assert.deepEqual(settings, MAILBOX);
      connections += 1;

      return {
        close: () => {
          closed += 1;
        },
        send: async (message) => {
          if (options.failWith) {
            throw options.failWith;
          }

          sent.push(message);

          return {
            accepted: [message.to],
            messageId: "<1@gmail>",
            rejected: [],
          };
        },
        verify: async () => undefined,
      };
    },
    env: { EMAIL_DRIVER: "resend", NODE_ENV: "test" },
    loadTransport: async () =>
      options.readable === false
        ? {
            readable: false,
            view: {
              address: MAILBOX.address,
              host: MAILBOX.host,
              passwordReadable: false,
              port: 465,
              provider: "gmail",
              updatedAt: 1,
              username: null,
            },
          }
        : {
            readable: true,
            settings: MAILBOX,
            view: {
              address: MAILBOX.address,
              host: MAILBOX.host,
              passwordReadable: true,
              port: 465,
              provider: "gmail",
              updatedAt: 1,
              username: null,
            },
          },
    resolveAddresses: async () => ({
      senderAddress: "Acme Legal <onboarding@resend.dev>",
      supportAddress: "help@acme.test",
    }),
  });

  return {
    closed: () => closed,
    connections: () => connections,
    sent,
    service,
  };
}

test("a chosen mailbox sends as itself, under the organization's name, with no Resend key", async () => {
  const { closed, sent, service } = mailboxService();

  const delivery = await service.send({
    ...MESSAGE,
    attachments: [
      {
        content: new Uint8Array([37, 80, 68, 70]),
        contentType: "application/pdf",
        filename: "signed.pdf",
      },
    ],
    htmlBody: "<p>Attached.</p>",
  });

  assert.equal(delivery.messageId, "<1@gmail>");
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.from, "Acme Legal <me@gmail.com>");
  assert.equal(sent[0]?.to, "signer@example.test");
  assert.equal(sent[0]?.replyTo, "help@acme.test");
  assert.equal(sent[0]?.attachments?.[0]?.filename, "signed.pdf");
  assert.ok(Buffer.isBuffer(sent[0]?.attachments?.[0]?.content));
  assert.equal(closed(), 1);
});

test("a batch through a mailbox goes one message at a time over one connection", async () => {
  const { closed, connections, sent, service } = mailboxService();

  const results = await service.sendBatch([
    MESSAGE,
    { ...MESSAGE, to: "second@example.test" },
  ]);

  assert.equal(results.length, 2);
  assert.deepEqual(
    sent.map((message) => message.to),
    ["signer@example.test", "second@example.test"],
  );
  assert.equal(connections(), 1);
  assert.equal(closed(), 1);
});

test("a refused sign-in is explained in plain words", async () => {
  const failure = Object.assign(new Error("Invalid login"), {
    code: "EAUTH",
    response: "535-5.7.8 Username and Password not accepted.",
  });
  const { closed, service } = mailboxService({ failWith: failure });

  await assert.rejects(
    service.send(MESSAGE),
    /Gmail or Google Workspace did not accept that address and app password.*535-5\.7\.8/,
  );
  assert.equal(closed(), 1);
});

test("a saved password that can no longer be read counts as email not connected", async () => {
  const { service } = mailboxService({ readable: false });

  await assert.rejects(service.send(MESSAGE), (error: unknown) =>
    isEmailNotConnectedError(error),
  );
});

test("with no mailbox and no Resend key, email is not connected", async () => {
  const service = createEmailService({
    env: { EMAIL_DRIVER: "resend", NODE_ENV: "test" },
    loadTransport: async () => null,
  });

  await assert.rejects(service.send(MESSAGE), (error: unknown) =>
    isEmailNotConnectedError(error),
  );
});
