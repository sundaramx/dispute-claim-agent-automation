import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../../test/renderApp";

describe("Approvals inbox (T87, FR-23)", () => {
  it("lists only what the user may approve and explains the rest", async () => {
    renderApp({ user: "supervisor1", route: "/approvals" });
    await screen.findByText("Chargeback filing");
    expect(screen.queryByText("Provisional credit (edited)")).not.toBeInTheDocument(); // supervisor1 prepared it
    expect(screen.getByText(/You prepared this proposal/)).toBeInTheDocument();
  });

  it("orders by nearest deadline", async () => {
    renderApp({ user: "supervisor1", route: "/approvals" });
    await screen.findByText("Chargeback filing");
    const first = screen.getAllByRole("row")[1];
    expect(first).toHaveTextContent("DSP-2026-000398");
  });

  it("approves with the keyboard and moves to the next item", async () => {
    renderApp({ user: "supervisor1", route: "/approvals" });
    await screen.findByText("Chargeback filing");
    fireEvent.keyDown(document, { key: "a" });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Approved. Executing exactly once.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("row")[1]).toHaveTextContent("DSP-2026-000366"));
  });

  it("requires a reason to reject (FR-23 AC 2)", async () => {
    renderApp({ user: "analyst1", route: "/approvals" });
    await screen.findByText("Acknowledgment letter");
    fireEvent.click(screen.getByRole("button", { name: /^Reject/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(within(dialog).getByText(/Give a reason/)).toBeInTheDocument();
  });

  it("shows the Approvals count in the navigation", async () => {
    renderApp({ user: "analyst1", route: "/approvals" });
    expect(await screen.findByLabelText("4 waiting")).toBeInTheDocument();
  });
});
