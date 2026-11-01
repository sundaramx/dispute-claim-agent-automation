# Dispute Console with Investigation Co-Pilot

An analyst console for **card dispute operations** at a US card issuer: debit disputes under Reg E and credit disputes under Reg Z, on Visa and Mastercard. AI agents take on the legwork (intake, triage, evidence gathering, deadline tracking and drafting) while people keep every decision that moves money, files a chargeback or contacts a customer. Every step is recorded in a tamper-evident audit trail.

> This repository is a public showcase: screenshots and an overview. The source code is private.

## Investigation Co-Pilot

![The Investigation Co-Pilot in action](docs/screenshots/copilot-investigation.gif)

The Co-Pilot sits beside a case and helps the analyst investigate it, running on a **local model**, so case data never leaves the machine.

- **Writes an investigation brief** when a case opens: what happened, what the evidence shows, what's missing, which facts conflict, the risks, and a step-by-step plan.
- **Answers questions in plain language**, citing the exact record behind every sentence. Click a citation to jump to it.
- **Runs read-only checks when a question needs them**, such as how the card was read at the terminal or whether the merchant has other disputes, and adds the results to the case as new evidence.
- **Never decides.** It can't approve, deny, move money or contact the customer; asked to, it says so. People make those calls.

In the recording above, two questions trigger two checks. The new evidence shows a magnetic-stripe read on a chip card at a merchant with a cluster of fraud disputes, and the brief is rewritten to point to a counterfeit card.

![Investigation brief](docs/screenshots/02-copilot-brief.jpg)

![Questions with read-only checks](docs/screenshots/03-copilot-ask-lookups.jpg)

![The brief after new evidence](docs/screenshots/04-copilot-brief-after-lookups.jpg)

## The console

![Case queue](docs/screenshots/01-case-queue.jpg)

- **Case queue** sorted by the nearest regulatory deadline, with countdowns in business or calendar days as each rule requires.
- **Approvals** with four-eyes control: nobody approves their own work, and larger or low-confidence actions need a Supervisor.
- **SLA dashboard** for deadline compliance, handling time and quality of automated actions.
- **Audit trail** that detects any edit, deletion or reordering of past events.
- **Choice of local model** from the sidebar.

| | |
|---|---|
| ![Sign in](docs/screenshots/05-sign-in.jpg) **Sign in** by role: Analyst, Supervisor, Compliance Auditor, Admin. | ![Approvals](docs/screenshots/06-approvals.jpg) **Approvals**: only what you may decide, nearest deadline first. |
| ![Model picker](docs/screenshots/07-model-picker.jpg) **Model picker**: switch the Co-Pilot's local model. | ![SLA dashboard](docs/screenshots/08-sla-dashboard.jpg) **SLA dashboard**: deadlines, handling time, QA agreement. |
| ![New dispute](docs/screenshots/09-new-dispute-validation.jpg) **New dispute**: out-of-scope cards and bad dates caught on entry. | ![Configuration](docs/screenshots/10-configuration.jpg) **Configuration**: versioned, with a reason for every change. |
| ![Audit trail](docs/screenshots/11-audit-trail.jpg) **Audit trail**: hash-chained events, verified in place. | |

All data shown is synthetic.

## Status

In active development. Built with Python, React and TypeScript, with local models served by Ollama.

## License

Proprietary. Copyright (c) 2026 Sundaram. All rights reserved. See [LICENSE](LICENSE). No permission is granted to use, copy or modify any part of this project.
