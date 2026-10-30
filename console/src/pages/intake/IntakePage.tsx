import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useCreateDispute } from "../../api/hooks";
import { ProblemError, type Category, type NewDispute } from "../../api/types";
import { useToast } from "../../components/ui";
import { CATEGORY, money } from "../../format";
import { cardNetwork, formatPan, panDigits, panProblem } from "../../pan";

const CATEGORY_HINT: Record<Category, string> = {
  fraud_unauthorized: "Didn’t make or authorize it",
  non_receipt: "Paid but never received it",
  not_as_described: "Not what was described",
  duplicate: "Charged more than once",
  credit_not_processed: "Returned or cancelled, no refund",
};

interface Form {
  pan: string;
  productType: "debit" | "credit";
  merchant: string;
  amount: string;
  txnDate: string;
  learnedOn: string;
  category: Category;
  narrative: string;
}

type Field = "pan" | "merchant" | "amountMinor" | "txnDate" | "learnedOn";

const toMinor = (amount: string) => Math.round(Number.parseFloat(amount) * 100);

function validate(f: Form): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  const pan = panProblem(f.pan);
  if (pan) e.pan = pan;
  if (!f.merchant.trim()) e.merchant = "Enter the merchant.";
  if (!(toMinor(f.amount) > 0)) e.amountMinor = "Enter an amount greater than $0.00.";
  if (!f.txnDate) e.txnDate = "Enter the transaction date.";
  if (f.learnedOn && f.txnDate && f.learnedOn < f.txnDate) e.learnedOn = "Can’t be before the transaction date.";
  return e;
}

export function IntakePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateDispute();
  // One key per form, so a double submit can't create two cases (FR-1 AC 2).
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState<Form>({
    pan: "", productType: "debit", merchant: "", amount: "", txnDate: "", learnedOn: "", category: "fraud_unauthorized", narrative: "",
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    const field = (k === "amount" ? "amountMinor" : k) as Field;
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    const input: NewDispute = {
      pan: panDigits(form.pan), productType: form.productType, merchant: form.merchant, amountMinor: toMinor(form.amount),
      txnDate: form.txnDate, learnedOn: form.learnedOn, category: form.category, narrative: form.narrative,
    };
    create.mutate({ input, idempotencyKey }, {
      onSuccess: (c) => { toast(`${c.ref} created · clocks started`); navigate(`/cases/${c.ref}`); },
      onError: (err) => {
        // Server 422 field errors land on the matching fields (T86).
        if (err instanceof ProblemError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
        else setFormError(err.message);
      },
    });
  };

  const digits = panDigits(form.pan);
  const net = cardNetwork(digits);
  const amountMinor = toMinor(form.amount);
  const err = (f: Field) => errors[f] && <div className="err" id={`${f}-err`}>{errors[f]}</div>;

  return (
    <>
      <div className="page-h">
        <div><h1>New dispute</h1><p className="sub">Same fields as <code>POST /api/v1/disputes</code>. The card number is tokenized before anything is stored; only the last 4 digits stay.</p></div>
      </div>
      <div className="grid g-main">
        <form className="card" onSubmit={submit} noValidate aria-label="New dispute">
          <div className="card-h"><h2>Dispute details</h2></div>
          <div className="card-b grid g2" style={{ gap: 14 }}>
            <div className="field">
              <label htmlFor="pan">Card number</label>
              <input id="pan" inputMode="numeric" autoComplete="off" placeholder="•••• •••• •••• ••••" value={formatPan(form.pan)}
                aria-invalid={!!errors.pan} aria-describedby="pan-err" onChange={(e) => set("pan", e.target.value)} />
              {err("pan")}
            </div>
            <div className="field">
              <label htmlFor="product">Card type</label>
              <select id="product" value={form.productType} onChange={(e) => set("productType", e.target.value as Form["productType"])}>
                <option value="debit">Debit (Reg E)</option><option value="credit">Credit (Reg Z)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="merchant">Merchant</label>
              <input id="merchant" placeholder="As it appears on the statement" value={form.merchant}
                aria-invalid={!!errors.merchant} aria-describedby="merchant-err" onChange={(e) => set("merchant", e.target.value)} />
              {err("merchant")}
            </div>
            <div className="field">
              <label htmlFor="amount">Amount (USD)</label>
              <input id="amount" type="number" step="0.01" min="0" placeholder="0.00" value={form.amount}
                aria-invalid={!!errors.amountMinor} aria-describedby="amountMinor-err" onChange={(e) => set("amount", e.target.value)} />
              {err("amountMinor")}
            </div>
            <div className="field">
              <label htmlFor="txnDate">Transaction date</label>
              <input id="txnDate" type="date" value={form.txnDate}
                aria-invalid={!!errors.txnDate} aria-describedby="txnDate-err" onChange={(e) => set("txnDate", e.target.value)} />
              {err("txnDate")}
            </div>
            <div className="field">
              <label htmlFor="learnedOn">Cardholder noticed it on</label>
              <input id="learnedOn" type="date" value={form.learnedOn}
                aria-invalid={!!errors.learnedOn} aria-describedby="learnedOn-err" onChange={(e) => set("learnedOn", e.target.value)} />
              {err("learnedOn")}
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="category">What the cardholder says happened</label>
              <select id="category" value={form.category} onChange={(e) => set("category", e.target.value as Category)}>
                {(Object.keys(CATEGORY) as Category[]).map((c) => <option key={c} value={c}>{CATEGORY_HINT[c]} ({CATEGORY[c].toLowerCase()})</option>)}
              </select>
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="narrative">Cardholder’s words (optional)</label>
              <textarea id="narrative" placeholder="The agent extracts structured fields from this. It is treated as untrusted text."
                value={form.narrative} onChange={(e) => set("narrative", e.target.value)} />
            </div>
          </div>
          {formError && <div className="card-b"><div className="callout warn" role="alert">{formError}</div></div>}
          <div className="card-b btn-row" style={{ borderTop: "1px solid var(--line)" }}>
            <button className="btn lg" type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create dispute"}</button>
            <Link className="btn ghost" to="/cases">Cancel</Link>
            <span className="note">The notice-received time is set by the server when you submit; it starts the clocks.</span>
          </div>
        </form>

        <aside>
          <div className="card">
            <div className="card-h"><h2>What will happen</h2></div>
            <div className="card-b">
              <div className="summary" aria-live="polite">
                <div><span>Card</span><b>{!panProblem(form.pan) ? `${net === "visa" ? "Visa" : "Mastercard"} •••• ${digits.slice(-4)}` : "Waiting for a valid number"}</b></div>
                <div><span>Regime</span><b>{form.productType === "debit" ? "Reg E (debit)" : "Reg Z (credit)"}</b></div>
                <div><span>First clock</span><b>{form.productType === "debit" ? "Investigate or credit · 10 business days" : "Acknowledge · 30 days"}</b></div>
                <div><span>Approvals</span><b>{amountMinor > 50000 ? `Over $500 (${money(amountMinor)}): Supervisor` : "Analyst or Supervisor"}</b></div>
              </div>
              <p className="note" style={{ marginTop: 10 }}>Then the agents extract, triage, gather evidence and draft. Every credit, filing and letter comes back to a person.</p>
            </div>
          </div>
          <div className="callout info">ACH, Zelle, wire and check disputes, and Amex or Discover cards, are out of scope and rejected with a reason.</div>
        </aside>
      </div>
    </>
  );
}
