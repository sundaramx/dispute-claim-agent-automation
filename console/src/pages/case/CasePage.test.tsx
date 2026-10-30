import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../../test/renderApp";

describe("Case detail (T85, FR-22 AC 2)", () => {
  it("approves from the queue in 3 clicks (NFR-14 AC 1)", async () => {
    renderApp({ user: "supervisor1" });
    fireEvent.click(await screen.findByRole("link", { name: "DSP-2026-000412" })); // 1
    fireEvent.click(await screen.findByRole("button", { name: /^Approve/ })); // 2
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" })); // 3
    expect(await screen.findByText("Approved. Executing exactly once.")).toBeInTheDocument();
    // The next pending proposal moves into the action bar.
    await waitFor(() => expect(document.querySelector(".action-bar")).toHaveTextContent("Provisional credit notice letter"));
  });

  it("tells an Analyst a Supervisor must approve over $500 (FR-12 AC 3)", async () => {
    renderApp({ user: "analyst1", route: "/cases/DSP-2026-000412" });
    expect(await screen.findByTestId("approve-block")).toHaveTextContent("Needs a Supervisor (over $500)");
    expect(screen.queryByRole("button", { name: /^Approve/ })).not.toBeInTheDocument();
  });

  it("hides approve from the preparer (FR-12 AC 2, D-2)", async () => {
    renderApp({ user: "supervisor1", route: "/cases/DSP-2026-000377" });
    expect(await screen.findByTestId("approve-block")).toHaveTextContent("You prepared this proposal");
  });

  it("is read-only for an Auditor (D-3)", async () => {
    renderApp({ user: "auditor1", route: "/cases/DSP-2026-000412" });
    expect(await screen.findByTestId("approve-block")).toHaveTextContent("can't approve case actions");
    expect(screen.queryByRole("button", { name: /Return/ })).not.toBeInTheDocument();
  });

  it("requires a reason to return a proposal", async () => {
    renderApp({ user: "supervisor1", route: "/cases/DSP-2026-000412" });
    fireEvent.click(await screen.findByRole("button", { name: /^Return/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Return" }));
    expect(within(dialog).getByText(/Give a reason/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/What needs to change/), { target: { value: "Attach the affidavit first" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Return" }));
    expect(await screen.findByText("Returned to the agent for rework.")).toBeInTheDocument();
  });

  it("jumps from a citation to the evidence it cites", async () => {
    renderApp({ user: "supervisor1", route: "/cases/DSP-2026-000412" });
    fireEvent.click(await screen.findByRole("button", { name: "Show evidence E-5" }));
    expect(screen.getByRole("tab", { name: /Evidence/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Signed affidavit of unauthorized use").closest("tr")).toHaveClass("flash");
  });

  it("shows a not-found message for an unknown case", async () => {
    renderApp({ user: "analyst1", route: "/cases/DSP-2026-999999" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Case DSP-2026-999999 not found");
  });
});
