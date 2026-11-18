<p align="center">
  <img src="docs/images/banner.png" alt="PheonixSign: e-signatures you actually own. Open source and MIT licensed. Send, sign and seal documents from your own Vercel account, at $0 per seat. Shown: a signer drawing a signature on a consulting agreement, and both signers marked Signed.">
</p>

<p align="center">
  An e-signature app for your own organization, on your own Vercel account.<br>
  Upload a PDF, place fields, send signing links, and keep the sealed, signed copy with its audit certificate.
</p>

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fpheonix-flame%2FPheonixSign&project-name=pheonixsign&repository-name=PheonixSign&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22resend%22%2C%22productSlug%22%3A%22resend-email%22%2C%22protocol%22%3A%22messaging%22%7D%2C%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%2C%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22private%22%7D%5D&demo-title=PheonixSign&demo-description=Your%20own%20e-signature%20site.%20Upload%20a%20PDF%2C%20place%20fields%2C%20send%20signing%20links%2C%20and%20keep%20the%20signed%20copy%20with%20its%20audit%20certificate.&demo-url=https%3A%2F%2Fgithub.com%2Fpheonix-flame%2FPheonixSign&demo-image=https%3A%2F%2Fraw.githubusercontent.com%2Fpheonix-flame%2FPheonixSign%2Fmain%2Fdocs%2Fimages%2Fbanner.png"><img src="docs/images/deploy-to-vercel.svg" alt="Deploy to Vercel" height="32"></a><br>
  <sub>or <a href="docs/deploy-with-an-agent.md">copy this to your LLM</a></sub>
</p>

<p align="center">
  <a href="#set-it-up-on-vercel-step-by-step">Set up on Vercel</a> ·
  <a href="#everything-it-takes-to-get-a-document-signed">Features</a> ·
  <a href="#pheonixsign-and-docusign-side-by-side">PheonixSign vs DocuSign</a> ·
  <a href="#what-it-costs">What it costs</a> ·
  <a href="#get-started">Get started</a> ·
  <a href="docs/self-hosting.md">Self-hosting guide</a>
</p>

## Set it up on Vercel, step by step

Each organization runs its own copy of PheonixSign, once. So does a person who just wants it for themselves: put your own name where setup asks for the organization's. After that, you send documents to people inside your organization and to anyone outside it.

**What you need**

- This repository, `PheonixSign`, in your GitHub account. It can be private.
- A [Vercel](https://vercel.com) account, signed in with that GitHub account. The free **Hobby** plan is for personal, non-commercial use; a business belongs on **Pro** ($20 a month).
- An email account to send from: **Gmail, Yahoo or Zoho** (fine for a small business, no domain needed), your organization's own mail server, or a domain of your own through Resend.

Neon, Vercel Blob and Resend are free on the plans below. It takes about 15 minutes.

### 0. Starting over? Clear out the old setup first

Skip this on a first install.

1. **Rename the repository**, if it still has an old name: on GitHub, open the repository, then **Settings → General → Repository name**, type `PheonixSign` and click **Rename**. GitHub forwards the old address to the new one.
2. **Delete the old storage.** In the old Vercel project, open **Storage**. For each store (the Neon database, the Blob store, Resend), click it, open its **Settings**, and delete it. This erases everything in it: accounts, documents and settings. Download anything you want to keep first.
3. **Delete the old project.** Open the project's **Settings → General**, scroll to the bottom, click **Delete Project** and confirm.

### 1. Import the project

1. Open [vercel.com/new](https://vercel.com/new) and choose **Continue with GitHub**. If `PheonixSign` is not listed, click **Adjust GitHub App Permissions** and let Vercel see it.
2. Click **Import** next to `PheonixSign`. Keep the project name `pheonixsign` (it becomes your address, `pheonixsign.vercel.app`, or close to it). Leave every other setting as it is and click **Deploy**.
3. Wait for **Ready**. The site opens on a page saying **Connect a database**: that is expected, steps 2 to 4 fix it.

> Seeing Vercel's own `404: NOT_FOUND` page instead? Open **Settings → Build and Deployment**, set **Framework Preset** to **Next.js**, leave **Root Directory** empty, save, and redeploy (step 4).

### 2. Add the database (Neon)

1. In the project, open **Storage** and click **Create Storage**. (Use **Create Storage**, not **Connect Database**.)
2. Choose **Neon** and the **Free** plan, and pick the region closest to you, or an EU region if you sign agreements in the EU. Accept the terms.
3. Connect it to the project for **Production** and **Preview**. Leave the prefix box empty. If Vercel fills one in, that is fine too: PheonixSign finds the database with or without a prefix.

### 3. Add file storage (Vercel Blob)

1. Back in **Storage**, click **Create Storage** again and choose **Blob**.
2. Fill in the form:

   | Field                                                 | What to choose                                                           |
   | ----------------------------------------------------- | ------------------------------------------------------------------------ |
   | **Store name**                                        | anything, such as `pheonixsign-files`                                    |
   | **Region**                                            | the same as the database. It cannot be changed later.                    |
   | **Access**                                            | **Private**. Never Public: anyone with a link could open your documents. |
   | **Custom Environment Variable Prefix**                | leave it **empty**. The grey `BLOB` in it is only a hint.                |
   | **Add a read-write token env var to this connection** | **tick it**                                                              |

3. Click **Create**, and connect it to the project for **Production** and **Preview** if Vercel asks.

**Storage** now lists two stores, both connected to `pheonixsign`.

### 4. Add two settings, then deploy again

Open **Settings → Environment Variables** and add these two, each for **Production** and **Preview**. Tick **Sensitive** if Vercel offers it.

| Name                 | Value                                                                                                                                                                       | Why                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | 64 random letters and digits. Let your password manager make them, or run `openssl rand -hex 32`. Keep a copy somewhere safe, and never change it once people use the site. | Signs people in and encrypts the saved email password. Without it, a change of the database password signs everyone out and the email password must be entered again. |
| `SETUP_TOKEN`        | a secret phrase of your own                                                                                                                                                 | The setup page asks for it, so nobody who finds your address first can make themselves the administrator.                                                             |

Then open **Deployments**, click **⋯** on the top deployment, choose **Redeploy**, and confirm. Storage and settings only reach a new build. Wait for **Ready**.

### 5. Set up the site

Open your site's address (**Visit**, on the project page). It shows **Set up your site**.

1. **Organization or your name**: your business, team or club, or your own name.
2. **Support email**: where signers' questions and replies go. Your Gmail is fine.
3. **Your name, your email and a password** (15 characters or more): this is the administrator's account. Use the email address you will sign in with.
4. **How should this site send email?** Choose **From our email account**, and the service under **Which email service?**: Gmail, Yahoo, Zoho or another mail server. For an address at your own domain, choose that instead; or decide later.
5. **Setup token**: the phrase from step 4.
6. Click **Finish setup**. You are signed in as the administrator. If you chose an email account, you land on its form.

### 6. Connect email

In **Settings → Organization → Email setup** (where step 5 lands you), choose how email is sent, fill in the form, and click **Save and send me a test email**. PheonixSign signs in to the mailbox first and saves nothing if it is refused. The password is stored encrypted and never shown again.

| Send from                        | What to do                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Gmail or Google Workspace**    | Turn on [2-Step Verification](https://myaccount.google.com/signinoptions/twosv), open [App passwords](https://myaccount.google.com/apppasswords), create one named PheonixSign, and paste the 16 letters. Your normal Gmail password does not work. About 500 emails a day (2,000 on Workspace). |
| **Yahoo Mail**                   | In [Account Security](https://login.yahoo.com/account/security), choose **Generate app password**, name it PheonixSign, and paste it.                                                                                                                                                            |
| **Zoho Mail**                    | Your password, or an app password if two-factor sign-in is on. Zoho accounts in the EU choose **Other email server** with `smtp.zoho.eu`.                                                                                                                                                        |
| **Other email server**           | The SMTP server name and port from whoever runs your email (465 or 587 usually), and the mailbox's address and password. Outlook and Microsoft 365 no longer accept a password from apps like this one: use Resend for them.                                                                     |
| **Resend, from your own domain** | In Vercel: **Storage → Create Storage → Resend**, free plan, empty prefix, then redeploy (step 4). In PheonixSign, enter an address at your domain under **Send email from**, and add the DNS records the page lists where your domain is managed.                                               |

The test email should arrive within a minute (check spam the first time). **Email is working** then shows in green.

### 7. Make it yours

Still under **Settings → Organization**:

- **Logo and color**: upload your logo and pick your color. Signers see them on the signing pages and in every email.
- **Who can create an account**: _People at my organization_ lets in colleagues with an address at your domain; _Nobody_ keeps it to the accounts there are. With a Gmail address there is no domain to share: to let a colleague in, choose _Anyone_, have them sign up at `/signup` on your site, then choose _Nobody_ again.
- **Signers outside your organization**: see step 8.

Then send your first document: **New envelope**, upload a PDF, add yourself as the signer, place a signature field, and send.

### 8. Signers inside and outside your organization

You send to anyone with an email address. **Ask people outside the organization for a code** is on by default:

- **Inside** means an address at your organization's own domain (the one under **Who can create an account**), or an account on this site. Gmail, Yahoo and other public addresses never make someone inside, so a business that sends from Gmail counts only its own account holders.
- **Everyone else** is emailed a one-time code when they open their link, and must enter it before they can see or sign the document.
- For each signer, the sender can still ask for an emailed code, or an access code they pass on themselves, whoever the signer is.

### 9. Changes and updates

Every push to the `main` branch of `PheonixSign` deploys again by itself.

### If something goes wrong

| What you see                                            | What to do                                                                                                                                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel's `404: NOT_FOUND` page                          | **Settings → Build and Deployment**: Framework Preset **Next.js**, Root Directory empty. Redeploy.                                                                                                                                     |
| **Connect a database**                                  | Neon is not connected, or the site was built before it was. Check **Storage**, then redeploy. **Environment Variables** should list a name ending in `DATABASE_URL`; if there are several databases' worth, disconnect the extra ones. |
| "One or more integration resources failed to provision" | A store was still being made. Wait a minute or two and redeploy.                                                                                                                                                                       |
| The setup page asks for a token you do not know         | It is the `SETUP_TOKEN` from step 4. Change it there and redeploy if you have lost it.                                                                                                                                                 |
| Uploading a PDF fails                                   | Blob is missing or not connected: **Environment Variables** must list `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID`. Redeploy after connecting it.                                                                                        |
| "did not accept that address and app password"          | Use an app password, not your normal password, and check 2-Step Verification is on. Make a new app password if in doubt.                                                                                                               |
| **Enter the email password again**                      | `BETTER_AUTH_SECRET` or the database password changed since the mailbox was saved. Enter the email password again in Email setup.                                                                                                      |
| A signer never gets the email                           | Send yourself a test email from Email setup, and check the signer's spam folder. Gmail and Yahoo limit how many emails go out a day.                                                                                                   |

## Why PheonixSign

**No seats to pay for.** PheonixSign is open source, and the Deploy button sets it up on free plans from Vercel, Neon and Resend, which carry about 250 documents a month for $0. A 15-person team pays DocuSign $8,100 a year for Business Pro seats, or $5,400 for Standard. PheonixSign costs the same whether one person sends or fifty.

**No envelope allowance to watch.** DocuSign's Standard and Business Pro plans include 100 envelopes per user per year. PheonixSign has no limit of its own. What you can send depends on your hosting plans, and the free ones carry about 250 documents a month.

**Your documents stay in your accounts.** PDFs live in a private Vercel Blob store and everything else in a Neon Postgres database, both in your name and in the region you choose. Nobody else hosts your agreements, and the code is yours to read, change and run.

**Evidence anyone can check.** Every finished PDF and its audit certificate carry a PAdES seal that PDF readers check for changes, the audit trail is hash-chained so an edited or deleted row shows, and anyone holding a copy can check it on the install's public Verify page.

**One click, nothing to look after.** The Deploy button creates the database, the file store and email for you, on free plans. There are no servers to patch, and every push to your copy deploys again.

## Everything it takes to get a document signed

<p align="center">
  <img src="docs/images/how-it-works.png" alt="How it works. 1: upload a PDF and place the fields. 2: signers open a link from their email and type or draw a signature, on any device. 3: everyone gets the sealed PDF and its audit certificate.">
</p>

### Prepare a document in minutes

Upload a PDF, add up to 10 signers in the order they sign, and add people who only receive the finished copy. Then place fields where they belong: signature, initials, date, name, text, number, checkbox, dropdown and radio buttons, each required or optional and each tied to one signer.

![Placing signature, date and dropdown fields for two signers on a master services agreement](docs/images/prepare.png)

<p align="center">
  <sub>The organization, people and documents in these screenshots are made up.</sub>
</p>

### Signing without an account

Each signer gets a link by email, agrees to use electronic records, and signs with a typed or drawn signature on any phone, tablet or computer. Fields from earlier signers stay visible and locked. Signers can download the document before they sign, or decline with a reason, and the sender is told.

![Jordan Lee signing a consulting agreement with a drawn signature, with the earlier signer's signature locked](docs/images/signing.png)

### Know who is signing

For documents that need more than an email link, ask a signer for an access code you give them yourself, or have PheonixSign email a one-time code when they open the link. The audit certificate records how each signer was checked, with their IP address and browser.

### Follow every envelope

The dashboard shows each document as a card with its first page, its status (draft, sent, completed, declined, voided or expired) and who it waits on, with search and a status filter. Each envelope has its own signing deadline, from 3 to 90 days, which you can change while it is out, and automatic reminders every 1, 2, 3 or 7 days, on top of the reminder you can send by hand.

![The dashboard: six documents as cards, with drafts, a sent offer letter, an NDA one of two signed, and completed agreements](docs/images/dashboard.png)

![A sent NDA: its deadline, reminders and Save as template, the two signers, and the timeline](docs/images/envelope.png)

### Templates for the documents you send every week

Open any envelope and choose Save as template. The template keeps the document, the fields and the signing order, with roles instead of names. Using it asks who signs this time and opens a draft ready to send.

### Sealed, certified, and checkable by anyone

When the last signer finishes, PheonixSign builds the signed PDF and an audit certificate, seals both, and emails them to every signer and copy recipient. Names and text in Latin, Greek, Cyrillic, Chinese, Japanese and Korean scripts are drawn correctly. Anyone can drop a copy on the Verify page to see whether it is exactly the file the site produced; the file never leaves their device, only its fingerprint does.

![The Verify page confirming that a signed contractor agreement is unchanged](docs/images/verify.png)

### Your name, logo and color

Signers see your organization, not PheonixSign. Give the install your name, logo and brand color, and they appear on the site, the signing pages and every email. Serve it at your own domain and link your own terms and privacy policy.

![The same signing page in the organization's own green, with its logo](docs/images/branding.png)

### Run by your administrators

The first account is the administrator, and you can make more. Choose who may create an account: people at your email domains, nobody, or anyone. People who only sign never need one. Set how long finished documents are kept, and answer a signer who asks for their data with a built-in export or erasure tool.

### On your phone

PheonixSign works on small screens as well as large ones: check on your documents from your phone, and signers sign from theirs.

<p align="center">
  <img src="docs/images/phone.png" width="300" alt="The dashboard on a phone">
</p>

## PheonixSign and DocuSign, side by side

DocuSign does more, and charges for it per user. PheonixSign does the everyday signing loop well, and it's yours. DocuSign's plans are as [DocuSign listed them](https://ecom.docusign.com/plans-and-pricing/esignature) in November 2026, for the US.

<p align="center">
  <img src="docs/images/compare.png" alt="PheonixSign and DocuSign eSignature side by side, each with a green check for: signing without an account; signing order and copy recipients; signature, initials, date, text and checkbox fields; dropdown and radio button fields (on DocuSign: Business Pro, $45 a seat); reusable templates; deadlines and automatic reminders; your own logo and brand color (on DocuSign: from Standard, $30 a seat); accounts for your whole team (on DocuSign: from Standard); consent to electronic records; audit trail and certificate of completion; a tamper-evident seal on the finished PDF; and working on a phone. To tick every box on DocuSign you need Business Pro at $45 per user a month.">
</p>

<p align="center">
  <img src="docs/images/only-signudoc.png" alt="Six things DocuSign doesn't offer: open source (DocuSign is closed source), runs in your own cloud (DocuSign runs only in its own), no per-seat fees (DocuSign charges $30 or $45 a seat a month), no envelope allowance (DocuSign includes 100 per user a year), every feature included (DocuSign splits them across four plans), and no cap on users (DocuSign's listed plans stop at 50).">
</p>

### Price and ownership

|                                  | PheonixSign                                                      | DocuSign eSignature                                                                      |
| -------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Price**                        | Free and open source, on free plans from Vercel, Neon and Resend | $11 (Personal), $30 (Standard) or $45 (Business Pro) per user a month, on an annual plan |
| **Envelopes**                    | No limit of its own. The free plans carry about 250 a month      | 5 a month on Personal, 100 per user a year on Standard and Business Pro                  |
| **Where it runs**                | Your Vercel account, with your Neon database and Blob store      | DocuSign's cloud                                                                         |
| **Where data is kept**           | The region you choose, the EU included                           | DocuSign's data centers, the EU included                                                 |
| **Source code**                  | MIT license, on GitHub                                           | Closed                                                                                   |
| **Your own domain and branding** | ✅ your domain, logo and color, in every install                 | Logo and colors from Standard                                                            |

### The signing loop

|                                              | PheonixSign                                                                                                                 | DocuSign eSignature                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Signing without an account**               | ✅                                                                                                                          | ✅                                                                           |
| **Signing order**                            | ✅ in order, up to 10 signers                                                                                               | ✅ in order, at the same time, or mixed                                      |
| **People who only get a copy**               | ✅                                                                                                                          | ✅ and more roles: approvers, editors, in-person signers                     |
| **Field types**                              | ✅ signature, initials, date, name, text, number, checkbox, dropdown, radio, each required or optional                      | ✅ more types; dropdown, radio and signer attachments need Business Pro      |
| **Templates**                                | ✅                                                                                                                          | ✅ from Personal, shared from Standard                                       |
| **Deadlines and automatic reminders**        | ✅                                                                                                                          | ✅                                                                           |
| **Access code and emailed one-time code**    | ✅                                                                                                                          | ✅ plus SMS, phone, knowledge-based questions and ID checks, as paid add-ons |
| **Consent to electronic records**            | ✅ versioned, recorded in the audit trail                                                                                   | ✅                                                                           |
| **Sealed PDF and certificate of completion** | ✅ PAdES seal, self-signed by default or your own trusted certificate, long-term validation (B-LTA) with a timestamp server | ✅ seal trusted by PDF readers                                               |
| **Audit trail**                              | ✅ hash-chained                                                                                                             | ✅                                                                           |
| **Checking a signed copy**                   | ✅ the seal in a PDF reader, and a public Verify page on your own site                                                      | ✅ the seal in a PDF reader                                                  |
| **Retention rules and signer data requests** | ✅ built in                                                                                                                 | ✅                                                                           |
| **Phones**                                   | ✅ in the browser                                                                                                           | ✅ native iPhone and Android apps                                            |

### Where DocuSign does more

|                                                         | PheonixSign                                                       | DocuSign eSignature                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| **More than one document per envelope, and Word files** | — PDF only, one per envelope                                      | ✅                                                    |
| **Signing at the same time**                            | — in order only                                                   | ✅                                                    |
| **Bulk send, web forms, payments**                      | —                                                                 | ✅ on Business Pro                                    |
| **API and webhooks**                                    | — not yet                                                         | ✅ API plans from $50 a month                         |
| **Integrations**                                        | —                                                                 | ✅ 1,000+, including Salesforce, Microsoft and Google |
| **Languages**                                           | — signing pages in English                                        | ✅ signing in 44 languages                            |
| **Single sign-on**                                      | — email and password                                              | ✅ SAML SSO on Enhanced                               |
| **Advanced and qualified signatures (eIDAS)**           | With a provider you add: eID Easy or a CSC remote signing service | ✅                                                    |
| **HIPAA, 21 CFR Part 11, certifications**               | Part 11 mode; you validate                                        | ✅ on Enhanced or as add-ons                          |
| **Support**                                             | GitHub issues                                                     | ✅ 24/7 on Enhanced                                   |

If your agreements run through Salesforce, need SMS checks or ID document checks, or go out by the thousand in bulk, DocuSign earns its price. If you want to send everyday agreements, keep the evidence, and own the whole thing, PheonixSign is built for you.

## What it costs

PheonixSign is free, and the Deploy button puts it on free plans from Vercel, Neon and Resend. Those plans carry about **250 documents a month**, however many people send them, before anything costs money. That is the first row below, and the rows after it are what you pay once you pass it.

| Documents sent in a year                                       | PheonixSign                                   | DocuSign Standard     | DocuSign Business Pro |
| -------------------------------------------------------------- | --------------------------------------------- | --------------------- | --------------------- |
| **3,000**: 250 a month, the most the free plans carry          | **$0**                                        | $10,800, for 30 seats | $16,200, for 30 seats |
| **5,000**: the most DocuSign's listed plans include            | $240, for Vercel Pro                          | $18,000, for 50 seats | $27,000, for 50 seats |
| **7,200**: 600 a month, the most Resend's free plan will email | $240                                          | Quoted by sales       | Quoted by sales       |
| **More than that**                                             | $480, for Vercel Pro and Resend Pro, plus use | Quoted by sales       | Quoted by sales       |

DocuSign includes 100 envelopes per user a year, so its price for a number of documents is the seats it takes to send them. PheonixSign has no seats. A team of 15, for example:

<p align="center">
  <img src="docs/images/price.png" alt="15 people, one year. DocuSign Business Pro: 15 seats at $45 a month each is $8,100 a year, with 1,500 envelopes included, and person 16 adds $540 a year. On DocuSign Standard, at $30 a seat, the same team pays $5,400 a year and goes without dropdown and radio fields. PheonixSign: $0 a year, about 250 documents a month on the free plans, and person 16 adds $0. It runs on the free plans of Vercel, Neon and Resend. Vercel keeps its free plan for personal, non-commercial use: a company on Vercel Pro pays $20 a month, whatever its size. That team keeps $8,100 a year, or $7,860 on Vercel Pro.">
</p>

### Where the $0 limit comes from

Each free plan has its own monthly allowance, and the smallest one sets the limit:

|                                                                                    | The free plan allows                        | Which carries                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Files**, on [Vercel Blob](https://vercel.com/docs/vercel-blob/usage-and-pricing) | 2,000 uploads, 10,000 reads and 1 GB stored | **About 250 documents a month.** A two-signer document takes 7 to 9 uploads, from the first PDF to the sealed copy and its certificates, and about 20 reads. 1 GB keeps over 1,000 finished documents of a few pages each. |
| **Email**, on [Resend](https://resend.com/pricing)                                 | 3,000 emails, and no more than 100 a day    | 600 two-signer documents a month, and 20 in one day. Each takes five emails: two invitations and three finished copies. Reminders and one-time codes are emails too.                                                       |
| **Database**, on [Neon](https://neon.com/faqs/free-plan-limits-and-quotas)         | 1 GB and 100 compute hours                  | About 400 hours a month with the database awake. It sleeps when nobody is using the site.                                                                                                                                  |
| **Hosting**, on Vercel Hobby                                                       | More than the rows above will use           | Any number of people. Vercel [limits Hobby to personal, non-commercial use](https://vercel.com/docs/limits/fair-use-guidelines).                                                                                           |

None of these plans bills you for going over. It stops instead: files cannot be read, email is not sent, or the database pauses. The monthly allowances come back when the month turns over. The two 1 GB limits do not, because stored files and database rows stay until they are deleted: make room by deleting old documents, or by setting how long finished documents are kept under Settings, Organization. Better still, move up before you reach a limit, not after.

### Past the free plans

- **Vercel Pro is $20 a month** for the one person who deploys, whatever the size of the team. The people who send and sign need no Vercel seat. It lifts the file limits: Blob is then paid from the plan's $20 monthly credit, at $0.023 per GB a month. A company belongs on [Pro](https://vercel.com/docs/plans/pro-plan) from the start, because of Vercel's rule for Hobby.
- **Resend Pro is $20 a month** for 50,000 emails, with no daily limit.
- **Neon's Launch plan** charges for what the database uses, with no monthly minimum.
- **Your own domain**, if you want one, costs whatever your registrar charges. Vercel Pro includes one free for the first year.

DocuSign's figures are its US list prices for annual plans in November 2026: $30 a user a month on Standard and $45 on Business Pro. Those plans stop at 50 users, and larger ones are quoted. The document counts are estimates for two signers and PDFs of a few pages; more signers, longer documents and reminders use more. Prices and free plans change, so check them before you quote these.

## Get started

### Deploy to Vercel

**Setting up your own copy of this repository?** Follow [Set it up on Vercel, step by step](#set-it-up-on-vercel-step-by-step) at the top of this page. The Deploy button below copies the repository into another GitHub account, which only works while the repository is public.

1. **Click Deploy to Vercel** above, and sign in to Vercel. It copies PheonixSign into your GitHub account and builds your site from that copy.
2. **Add the three things Vercel offers to create**, each on a free plan: [Resend](https://resend.com) for email, a [Neon](https://neon.com) Postgres database, and a private [Vercel Blob](https://vercel.com/docs/vercel-blob) store.
3. **Click Deploy.** The build creates the database tables by itself. If Vercel stops with "One or more integration resources failed to provision", nothing is wrong with your copy: Resend was still checking its domain. Wait a minute or two, refresh the page, and click **Redeploy**. See [If the first deployment fails](docs/self-hosting.md#if-the-first-deployment-fails).
4. **Open your new site.** Name your organization, give the email address people should write to for help, and create the first account, which is the administrator.
5. **Set up the address you send from.** Under Settings, Organization, enter an address at your own domain. The site lists the DNS records to add and checks them for you.

**Taking new versions.** Settings, PheonixSign, **Check for updates** tells you when a new release is out and what is in it. A workflow that comes with your copy then opens a pull request with the release in your GitHub repository; merge it and Vercel deploys the update. See [Keep your install up to date](docs/self-hosting.md#keep-your-install-up-to-date).

**Deploying with an AI agent.** An agent that can use your browser can do all of this for you. Point it at [docs/deploy-with-an-agent.md](docs/deploy-with-an-agent.md), which lists every screen, what to choose, what to ask you, and how to retry.

There is nothing to type in Vercel and no terminal to open. Until step 5 is done, email reaches only the address on your Resend account, so you can try the whole product straight away by sending a document to yourself. The [self-hosting guide](docs/self-hosting.md) covers your own domain, locking down a new install, keeping it up to date, running in the EU, and every optional setting.

### Try it on your computer

With Node.js 24 and Docker:

```bash
npm install
cp .env.example .env
npm run db:start   # Postgres in Docker, with the schema applied
npm run dev        # PheonixSign at http://localhost:3000
```

Files stay on disk and emails are written to `.data/outbox` instead of being sent, so you need no outside account. [Development](docs/development.md) says more.

## Built on Vercel

- **Vercel-native from end to end.** Next.js 16 on Vercel Functions, Neon Postgres and Resend from the Vercel Marketplace, private Vercel Blob storage with direct browser uploads, a daily Vercel cron job for reminders and cleanup, and optional [Vercel BotID](https://vercel.com/docs/botid).
- **Secure by default.** Private file storage with no public URLs, a strict Content Security Policy, rate limits kept in Postgres, signing links that are hashed at rest, and a setup page that only the first visitor, or the holder of a `SETUP_TOKEN`, can use.
- **Tested.** Unit tests, database tests against a real Postgres, and a browser test that sets up a fresh install, sends a document and signs it, run on every pull request.

## Using PheonixSign for real agreements

PheonixSign is not a law firm and does not give legal advice, and nothing here is a promise that a signature made with it will be accepted for a given purpose. It gives you the features that electronic signature laws such as the US ESIGN Act and UETA and the EU's eIDAS regulation look for in a simple electronic signature: each signer's consent to electronic records, a record of who signed, when and how, optional identity checks, and a sealed copy that shows any change. Whether that is enough for a particular document depends on the document, where you and the signers are, and how you use it. Ask a lawyer when it matters.

Every install has a page at `/electronic-signatures` that says what it is for, and senders confirm it before each send. It is meant for ordinary business agreements, such as contracts, NDAs, statements of work, offer letters, purchase orders and approvals. It is **not** built for:

- documents that need an advanced or qualified electronic signature (AdES or QES) under eIDAS, unless you add a signing provider (see below);
- protected health information under HIPAA;
- documents that many laws keep out of electronic signature, such as wills, family-law matters, court orders, notices of foreclosure, eviction, utility shut-off or insurance cancellation, and in most EU countries real estate transfers and documents that need a notary.

For **advanced or qualified electronic signatures** under eIDAS, connect a signing provider: [eID Easy](https://eideasy.com), or a trust service provider's remote signing service that speaks the CSC API v2. A sender can then choose that signature type for an envelope, and each signer proves who they are at the provider and signs with a certificate in their own name. Every signature goes into the PDF in a revision of its own, so all of them stay valid, and the finished PDF gets long-term validation. The provider is a paid service outside Vercel, so it is optional, and the flow has been tested against stand-ins for both interfaces but not yet against the live services. [Signatures in the signers' own names](docs/self-hosting.md#signatures-in-the-signers-own-names-eidas-ades-and-qes) has the setup.

For FDA 21 CFR Part 11 records, an administrator can turn on **Part 11 mode** under Settings. Signers then sign with their own accounts, whose identity an administrator has confirmed, give their password again at each signature, and see the meaning of their signature (approval, review, responsibility or authorship) printed beside it with their name and the time. Audit trails export as CSV, and finished records are never deleted on a timer. That covers the software's part only: validating your install, writing and following your own procedures, training your people and certifying your electronic signatures to the FDA stay with your organization. The [Part 11 validation pack](docs/part11/README.md) gives you starting documents for that: requirements, a traceability matrix, a risk assessment, qualification scripts, SOP templates and the FDA letter.

Your install carries your organization's name, and your organization is responsible for how it is used: linking your own terms and privacy policy, keeping the support address pointed at a mailbox someone reads, choosing how long documents are kept, and answering signers' data requests. [Your responsibilities](docs/self-hosting.md#your-responsibilities) has the details.

## Learn more

- [Self-hosting guide](docs/self-hosting.md): deploying, first-run setup, what it costs, your own domain, updates, the EU, the seal, cleanup, rate limits, bot protection and every optional setting.
- [Development](docs/development.md): running PheonixSign locally, storage, the database, email, tests and the code's layout.
- [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md).

## License and credits

PheonixSign is based on [SignuDoc](https://github.com/NYLLON-SOFTWARE/SignuDoc) by Nyllon Software, and is [MIT licensed](LICENSE). Copyright © 2026 Nyllon Software. It redistributes third-party assets, including bundled fonts and PDF.js, under their own licenses: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The project has no email address of its own. Report a security problem privately through GitHub, as [SECURITY.md](SECURITY.md) describes. For help with one particular site that runs PheonixSign, write to the organization that runs it.

## Legal disclaimer

**PheonixSign is an independent open source project. It is not affiliated with, associated with, authorized by, endorsed by, sponsored by, or in any way officially connected with DocuSign, Inc., or any of its subsidiaries or affiliates.** PheonixSign is not a DocuSign product, is not built on DocuSign's software or services, and does not use DocuSign's code.

"DocuSign" and related names, marks and logos are trademarks or registered trademarks of DocuSign, Inc. in the United States and other countries. They are used in this repository only to identify DocuSign's products for the purpose of comparison. No claim is made to any of them, and their use does not imply any relationship with, or approval by, DocuSign, Inc. All other product and company names, including Vercel, Neon and Resend, are trademarks of their respective owners, and PheonixSign is not affiliated with or endorsed by them either.

The comparisons on this page were made in good faith from DocuSign's publicly available website and plan documentation as of November 2026, for its US eSignature plans, and from PheonixSign's own code. DocuSign's features, plans and prices change, vary by country and contract, and may differ from what is described here. Nothing on this page is a statement by DocuSign. Check [DocuSign's own website](https://www.docusign.com) for current and authoritative information before you rely on any of it, and tell us through a GitHub issue if something here is out of date or wrong so that it can be corrected.

The cost figures are estimates for illustration, not quotes. What you pay depends on your own use and on the prices of the services your install runs on.

PheonixSign is provided "as is", without warranty of any kind, as the [MIT License](LICENSE) sets out. Nothing in this repository is legal advice. Whether an electronic signature is valid or enforceable for a particular document depends on the law that applies to it; ask a qualified lawyer.
