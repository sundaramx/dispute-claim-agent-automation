import { fireEvent, screen, within } from "@testing-library/react";
import { renderApp } from "../../test/renderApp";

describe("Configuration (T89, FR-25, FR-13)", () => {
  it("blocks an auto-approve threshold above the Supervisor threshold (D-4)", async () => {
    renderApp({ user: "admin1", route: "/admin" });
    fireEvent.change(await screen.findByLabelText("Auto-approve up to (USD)"), { target: { value: "600" } });
    expect(screen.getByText(/so auto-approve can’t bypass sign-off/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save as v15/ })).toBeDisabled();
  });

  it("saves a change with a reason as a new version with a diff", async () => {
    renderApp({ user: "admin1", route: "/admin" });
    fireEvent.change(await screen.findByLabelText("QA sample rate (%)"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: /Save as v15/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("10% → 15%")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Give a reason.")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "More QA during pilot" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved as config v15")).toBeInTheDocument();
    expect(screen.getByText("qa.sample_rate 0.1 → 0.15")).toBeInTheDocument();
  });

  it("turns auto-approve on with a reason, and the header shows it to everyone (FR-13 AC 2)", async () => {
    renderApp({ user: "admin1", route: "/admin" });
    fireEvent.click(await screen.findByRole("switch"));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Pilot approved by Compliance" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Turn ON" }));
    expect(await screen.findByText("Auto-approve ON")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("is read-only for an Auditor", async () => {
    renderApp({ user: "auditor1", route: "/admin" });
    expect(await screen.findByLabelText("Auto-approve up to (USD)")).toBeDisabled();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Save as/ })).not.toBeInTheDocument();
  });
});
