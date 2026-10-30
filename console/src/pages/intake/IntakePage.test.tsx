import { fireEvent, screen } from "@testing-library/react";
import { renderApp } from "../../test/renderApp";
import { AMEX_TEST, VISA_TEST, VISA_TEST_DIGITS } from "../../test/fixtures/pans";

const fill = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function fillValid() {
  fill("Card number", VISA_TEST);
  fill("Merchant", "Northside Fitness");
  fill("Amount (USD)", "49.00");
  fill("Transaction date", "2026-10-24");
  fill("Cardholder noticed it on", "2026-10-27");
}

describe("New dispute (T86, FR-1)", () => {
  it("validates on the client before sending", async () => {
    renderApp({ user: "analyst1", route: "/intake" });
    fireEvent.click(await screen.findByRole("button", { name: "Create dispute" }));
    expect(screen.getByText("Enter the full card number.")).toBeInTheDocument();
    expect(screen.getByText("Enter the merchant.")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount (USD)")).toHaveAttribute("aria-invalid", "true");
  });

  it("rejects out-of-scope networks (OOS-3)", async () => {
    renderApp({ user: "analyst1", route: "/intake" });
    await screen.findByLabelText("Card number");
    fill("Card number", AMEX_TEST);
    fireEvent.click(screen.getByRole("button", { name: "Create dispute" }));
    expect(screen.getByText("American Express is out of scope (OOS-3).")).toBeInTheDocument();
  });

  it("maps server 422 field errors onto the fields", async () => {
    renderApp({ user: "analyst1", route: "/intake" });
    await screen.findByLabelText("Card number");
    fillValid();
    fill("Transaction date", "2026-12-01"); // in the future: only the server checks this
    fill("Cardholder noticed it on", "2026-12-02");
    fireEvent.click(screen.getByRole("button", { name: "Create dispute" }));
    expect(await screen.findByText("Enter a date that isn't in the future.")).toBeInTheDocument();
  });

  it("creates the case, starts its clock and opens it; only the last 4 digits remain", async () => {
    renderApp({ user: "analyst1", route: "/intake" });
    await screen.findByLabelText("Card number");
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Create dispute" }));
    expect(await screen.findByRole("heading", { name: "DSP-2026-000432" })).toBeInTheDocument();
    expect(screen.getByText("Debit •••• 1111")).toBeInTheDocument();
    expect(screen.getAllByText("Thu Nov 12 · 17:00").length).toBeGreaterThan(0); // 10 business days, Veterans Day skipped
    expect(document.body.textContent).not.toContain(VISA_TEST_DIGITS);
  });
});
