"use client";

import { useEffect, useState, type FormEvent } from "react";

import { FieldShell, ShellButton } from "@/components/shared/form-shell";
import {
  type EmailTransportView,
  isSmtpProvider,
  SMTP_PORTS,
  SMTP_PROVIDER_INFO,
  SMTP_PROVIDERS,
  type SmtpProvider,
} from "@/lib/email-providers";
import type { EmailStatus } from "@/lib/email-status";

// How the site sends its email: through Resend from the organization's own
// domain, or through an ordinary mailbox (Gmail, Yahoo, Zoho or another
// mail server) that the administrator signs in to here. A mailbox needs no
// domain and no DNS records, so someone without an organization can use
// their own Gmail.

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

type Choice = SmtpProvider | "resend";

type TransportResponse = {
  error?: string;
  fieldErrors?: Record<string, string>;
  status?: EmailStatus;
  test?: { sent: true; to: string } | { sent: false; message: string };
  transport?: EmailTransportView | null;
} | null;

type Feedback = { message: string; tone: "error" | "success" } | null;

type EmailSendingPanelProps = {
  onStatus: (status: EmailStatus) => void;
  /** True when Resend has a key, so it is what sends without a mailbox. */
  resendConnected: boolean;
};

const CHOICES: Array<{ description: string; label: string; value: Choice }> = [
  ...SMTP_PROVIDERS.map((provider) => ({
    description:
      provider === "other"
        ? "Your organization's own mail server, from its SMTP details."
        : `Send from your ${SMTP_PROVIDER_INFO[provider].label} address. No domain or DNS records needed.`,
    label: SMTP_PROVIDER_INFO[provider].label,
    value: provider,
  })),
  {
    description:
      "Send from an address at your own domain, such as notifications@yourcompany.com. Needs DNS records.",
    label: "Resend, from my own domain",
    value: "resend" as const,
  },
];

type FormValues = {
  address: string;
  host: string;
  password: string;
  port: string;
  username: string;
};

const EMPTY_VALUES: FormValues = {
  address: "",
  host: "",
  password: "",
  port: "587",
  username: "",
};

function valuesFrom(transport: EmailTransportView | null): FormValues {
  return transport
    ? {
        address: transport.address,
        host: transport.provider === "other" ? transport.host : "",
        password: "",
        port: String(transport.port),
        username: transport.username ?? "",
      }
    : EMPTY_VALUES;
}

export function EmailSendingPanel({
  onStatus,
  resendConnected,
}: EmailSendingPanelProps) {
  const [transport, setTransport] = useState<EmailTransportView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [choice, setChoice] = useState<Choice>("gmail");
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/admin/email/transport", { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response
          .json()
          .catch(() => null)) as TransportResponse;

        if (!response.ok) {
          setFeedback({
            message: payload?.error ?? GENERIC_ERROR_MESSAGE,
            tone: "error",
          });
          return;
        }

        const saved = payload?.transport ?? null;

        setTransport(saved);
        setValues(valuesFrom(saved));
        // With nothing saved, a mailbox is offered first: it is the
        // quickest way to start, and the only way without a domain. Setup
        // names the one that was picked there.
        const requested = new URLSearchParams(window.location.search).get(
          "mailbox",
        );

        setChoice(
          saved
            ? saved.provider
            : isSmtpProvider(requested)
              ? requested
              : "gmail",
        );
        setLoaded(true);

        if (!saved && isSmtpProvider(requested)) {
          requestAnimationFrame(() =>
            document
              .getElementById("email-sending")
              ?.scrollIntoView({ block: "start" }),
          );
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setFeedback({ message: GENERIC_ERROR_MESSAGE, tone: "error" });
        }
      });

    return () => controller.abort();
  }, []);

  function choose(next: Choice) {
    setChoice(next);
    setErrors({});
    setFeedback(null);
    setValues(
      transport && next === transport.provider
        ? valuesFrom(transport)
        : { ...EMPTY_VALUES, address: values.address },
    );
  }

  function update(field: keyof FormValues) {
    return (event: { target: { value: string } }) => {
      const value = event.target.value;

      setValues((current) => ({ ...current, [field]: value }));
      setErrors((current) => ({ ...current, [field]: "" }));
    };
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy || choice === "resend") {
      return;
    }

    setBusy("save");
    setErrors({});
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/email/transport", {
        body: JSON.stringify({
          address: values.address,
          ...(choice === "other"
            ? {
                host: values.host,
                port: Number(values.port),
                ...(values.username.trim()
                  ? { username: values.username }
                  : {}),
              }
            : {}),
          ...(values.password ? { password: values.password } : {}),
          provider: choice,
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      const payload = (await response
        .json()
        .catch(() => null)) as TransportResponse;

      if (!response.ok) {
        setErrors(payload?.fieldErrors ?? {});
        setFeedback({
          message: payload?.error ?? GENERIC_ERROR_MESSAGE,
          tone: "error",
        });
        return;
      }

      const saved = payload?.transport ?? null;

      setTransport(saved);
      setValues(valuesFrom(saved));

      if (payload?.status) {
        onStatus(payload.status);
      }

      setFeedback(
        payload?.test?.sent
          ? {
              message: `Saved. A test email is on its way to ${payload.test.to}: check that inbox. Signing emails now go out from ${saved?.address ?? values.address}.`,
              tone: "success",
            }
          : {
              message: `Saved, but the test email did not go through: ${
                payload?.test && !payload.test.sent
                  ? payload.test.message
                  : GENERIC_ERROR_MESSAGE
              }`,
              tone: "error",
            },
      );
    } catch {
      setFeedback({ message: GENERIC_ERROR_MESSAGE, tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    if (busy) {
      return;
    }

    setBusy("remove");
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/email/transport", {
        method: "DELETE",
      });
      const payload = (await response
        .json()
        .catch(() => null)) as TransportResponse;

      if (!response.ok) {
        setFeedback({
          message: payload?.error ?? GENERIC_ERROR_MESSAGE,
          tone: "error",
        });
        return;
      }

      setTransport(null);
      setValues(EMPTY_VALUES);
      setChoice("resend");

      if (payload?.status) {
        onStatus(payload.status);
      }

      setFeedback({
        message: "The mailbox is disconnected. Email now goes through Resend.",
        tone: "success",
      });
    } catch {
      setFeedback({ message: GENERIC_ERROR_MESSAGE, tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  if (!loaded) {
    return feedback ? (
      <p className="notice notice-danger" role="alert">
        {feedback.message}
      </p>
    ) : null;
  }

  const info = choice === "resend" ? null : SMTP_PROVIDER_INFO[choice];
  const keepsSavedPassword =
    transport !== null &&
    transport.passwordReadable &&
    transport.provider === choice;

  return (
    <div className="space-y-5" id="email-sending">
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-bold text-(--fg)">
          Send email from
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {CHOICES.map((option) => (
            <label
              className="flex cursor-pointer items-start gap-3 rounded-2xl bg-(--surface) px-4 py-3.5 ring-2 ring-transparent transition has-[:checked]:bg-(--accent-softer) has-[:checked]:ring-(--accent)"
              key={option.value}
            >
              <input
                checked={choice === option.value}
                className="mt-1 size-4 accent-(--accent)"
                disabled={busy !== null}
                name="email-sending"
                onChange={() => choose(option.value)}
                type="radio"
                value={option.value}
              />
              <span className="space-y-1">
                <span className="block text-sm font-bold text-(--fg)">
                  {option.label}
                  {transport?.provider === option.value ||
                  (!transport &&
                    resendConnected &&
                    option.value === "resend") ? (
                    <span className="pill pill-accent ml-2 align-middle text-xs">
                      In use
                    </span>
                  ) : null}
                </span>
                <span className="block text-sm leading-6 text-(--secondary)">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {info ? (
        <form
          className="space-y-5 rounded-2xl border border-(--border) p-5"
          noValidate
          onSubmit={handleSave}
        >
          <div className="space-y-2">
            <p className="text-sm font-bold text-(--fg)">
              Get the {info.passwordLabel.toLowerCase()}
            </p>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-6 text-(--secondary) marker:font-semibold marker:text-(--fg)">
              {info.passwordSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {info.passwordLink ? (
              <a
                className="inline-block text-sm font-semibold text-(--accent-ink) underline underline-offset-4"
                href={info.passwordLink.href}
                rel="noreferrer"
                target="_blank"
              >
                {info.passwordLink.label}
              </a>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldShell
              autoComplete="off"
              disabled={busy !== null}
              error={errors.address}
              helper="Signing invitations and signed copies come from this address."
              ignorePasswordManagers
              label="Email address"
              name="mailbox-address"
              onChange={update("address")}
              placeholder={info.addressPlaceholder}
              readOnly={false}
              type="email"
              value={values.address}
            />
            <FieldShell
              autoComplete="new-password"
              disabled={busy !== null}
              error={errors.password}
              helper={
                keepsSavedPassword
                  ? "Leave empty to keep the saved one. It is stored encrypted and never shown again."
                  : "Stored encrypted, and never shown again."
              }
              ignorePasswordManagers
              label={info.passwordLabel}
              name="mailbox-password"
              onChange={update("password")}
              placeholder={keepsSavedPassword ? "••••••••••••" : undefined}
              readOnly={false}
              type="password"
              value={values.password}
            />
          </div>

          {choice === "other" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <FieldShell
                autoComplete="off"
                disabled={busy !== null}
                error={errors.host}
                helper="Often called the outgoing or SMTP server."
                label="Mail server"
                name="mailbox-host"
                onChange={update("host")}
                placeholder="mail.yourcompany.com"
                readOnly={false}
                value={values.host}
              />
              <div className="space-y-2 text-sm">
                <label
                  className="block text-[0.8125rem] font-semibold text-(--secondary)"
                  htmlFor="mailbox-port"
                >
                  Port
                </label>
                <select
                  className="h-10 w-full rounded-xl border border-(--border-strong) bg-(--paper) px-3 text-sm text-(--fg)"
                  disabled={busy !== null}
                  id="mailbox-port"
                  onChange={update("port")}
                  value={values.port}
                >
                  {SMTP_PORTS.map((port) => (
                    <option key={port} value={String(port)}>
                      {port}
                      {port === 465
                        ? " (SSL)"
                        : port === 587
                          ? " (STARTTLS, most common)"
                          : " (STARTTLS)"}
                    </option>
                  ))}
                </select>
                {errors.port ? (
                  <p className="text-xs font-semibold text-(--danger)">
                    {errors.port}
                  </p>
                ) : null}
              </div>
              <FieldShell
                autoComplete="off"
                disabled={busy !== null}
                error={errors.username}
                helper="Only if the server signs in with something other than the address."
                label="Sign-in name (optional)"
                name="mailbox-username"
                onChange={update("username")}
                readOnly={false}
                value={values.username}
              />
            </div>
          ) : null}

          {info.note ? (
            <p className="text-xs leading-5 text-(--tertiary)">{info.note}</p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <ShellButton loading={busy === "save"} type="submit">
              {busy === "save"
                ? "Checking and saving..."
                : "Save and send me a test email"}
            </ShellButton>
            {transport ? (
              <ShellButton
                disabled={busy !== null}
                loading={busy === "remove"}
                onClick={() => void handleRemove()}
                variant="ghost"
              >
                Disconnect {transport.address}
              </ShellButton>
            ) : null}
          </div>
        </form>
      ) : transport ? (
        <div className="space-y-3 rounded-2xl border border-(--border) p-5">
          <p className="text-sm leading-6 text-(--secondary)">
            Email goes out from {transport.address} right now. Disconnect it to
            send through Resend from your own domain instead.
          </p>
          <ShellButton
            loading={busy === "remove"}
            onClick={() => void handleRemove()}
            variant="secondary"
          >
            Disconnect {transport.address} and use Resend
          </ShellButton>
        </div>
      ) : null}

      {feedback ? (
        <p
          className={`notice ${
            feedback.tone === "success" ? "notice-success" : "notice-danger"
          }`}
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
