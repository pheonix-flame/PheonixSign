import type { Metadata } from "next";

import { ContactForm } from "@/components/contact/contact-form";
import { PublicDocumentShell } from "@/components/layout/public-document-shell";
import { requireHostedMode } from "@/lib/hosted-pages";

export const metadata: Metadata = {
  description:
    "Get in touch with InkSeal for support, privacy questions, accessibility requests, or legal inquiries.",
  title: "Contact | InkSeal",
};

export default async function ContactPage() {
  await requireHostedMode();

  return (
    <PublicDocumentShell
      description="Use the form below for product support, privacy requests, accessibility accommodations, legal notices, or questions about a document sent through InkSeal."
      lastUpdated="March 23, 2026"
      title="Contact"
    >
      <div className="mx-auto w-full max-w-[52rem]">
        <ContactForm />
      </div>
    </PublicDocumentShell>
  );
}
