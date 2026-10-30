# Clickable prototype

HTML and CSS plus one vanilla script, `app.js`, loaded as an external file. There is no build step and no network access, and no inline scripts, matching the console's CSP. Serve the folder (`python3 -m http.server 8765`) and open `index.html`. Light and dark mode follow the OS, and the moon button toggles them.

Try: `⌘K` or `/` to search and jump, `?` for shortcuts, `j`/`k` in lists, `a`/`e`/`r` to approve/return/reject, `c` on a case to open the copilot, and the role switcher at the bottom of the sidebar.

Mock "now" is Wed 2026-10-28 09:30 ET. Walk-through: `index.html` (sign in) → `queue.html` → `case.html` (DSP-2026-000412) → `inbox.html` → `dashboard.html` → `admin.html` → `audit.html`; `intake.html` is the manual-entry form.

| Screen | File | Requirements shown |
|---|---|---|
| Sign in, seeded users | `index.html` | FR-21 |
| Case queue | `queue.html` | FR-22, FR-3, FR-4..FR-6 |
| Case detail | `case.html` | FR-22, FR-7..FR-12, FR-19 |
| Approvals inbox, QA, manual pre-arb | `inbox.html` | FR-11, FR-12, FR-14, FR-18, FR-23 |
| SLA dashboard | `dashboard.html` | FR-24, FR-30, FR-35 |
| Manual dispute entry | `intake.html` | FR-1 |
| Admin config | `admin.html` | FR-13, FR-25, FR-29 |
| Audit viewer | `audit.html` | FR-26, FR-27, FR-28 |
| Case copilot drawer (CR-1) | `case.html#copilot` | FR-36 |
| Cardholder chat agent, simulated portal (CR-1) | `chat.html` | FR-37 |

## Mocked vs real

**Everything is mocked.** There is no backend, no state and no auth.
- Data (cases, cards, amounts, hashes, users, metrics) is invented. Hashes are not real.
- Interactions are simulated in the browser: approving, rejecting and returning remove the proposal and show a toast; the auto-approve toggle and threshold form validate and confirm; chain verification and replay animate. Nothing is persisted except the chosen role, auto-approve state and theme (browser storage only).
- The role switcher (sidebar) is real in the prototype: nav items, approve controls, four-eyes blocks and copilot suggestions change with the role. The real console enforces all of this on the server.
- The case copilot answers from a fixed set of canned, cited answers matched on keywords. The cardholder chat runs a small scripted dialogue engine; keyword matching stands in for the `chat_understand` model task.
- Every case row opens the DSP-2026-000412 example.
- Dates and business-day counts were hand-computed against the 2026 US federal calendar.

**Real (design intent the build will follow):** screen list, navigation, field names, role rules ($500 Supervisor threshold, four-eyes, low-confidence flag), the always-visible auto-approve badge, clock states, and requirement IDs. The console's design tokens (`styles.css`) are intended to carry into `console/src/styles/`.
