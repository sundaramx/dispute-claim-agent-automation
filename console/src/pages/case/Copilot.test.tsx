import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../../test/renderApp";

async function openCopilot(tab: "Brief" | "Ask" = "Ask") {
  fireEvent.click(await screen.findByRole("button", { name: "Open the Investigation Co-Pilot" }));
  const drawer = screen.getByRole("complementary", { name: "Investigation Co-Pilot" });
  fireEvent.click(within(drawer).getByRole("tab", { name: tab }));
  return drawer;
}

describe("Investigation Co-Pilot: Ask (FR-36)", () => {
  it("answers a starter question with citations that jump to the record", async () => {
    renderApp({ user: "supervisor1", route: "/cases/DSP-2026-000412" });
    const drawer = await openCopilot();
    fireEvent.click(within(drawer).getByRole("button", { name: "What’s missing before we file the chargeback?" }));
    const cite = await within(drawer).findByRole("button", { name: "Show evidence E-5" });
    fireEvent.click(cite);
    expect(screen.getByRole("tab", { name: /Evidence/ })).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById("ev-E-5")).toHaveClass("flash");
  });

  it("opens with the c key and takes typed questions", async () => {
    renderApp({ user: "analyst1", route: "/cases/DSP-2026-000412" });
    await screen.findByRole("heading", { name: "DSP-2026-000412" });
    fireEvent.keyDown(document, { key: "c" });
    const drawer = screen.getByRole("complementary", { name: "Investigation Co-Pilot" });
    fireEvent.click(within(drawer).getByRole("tab", { name: "Ask" }));
    fireEvent.change(within(drawer).getByLabelText("Ask about this case"), { target: { value: "Which clock is nearest?" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Send" }));
    expect(await within(drawer).findByText(/The nearest deadline is the investigate or credit clock/)).toBeInTheDocument();
  });

  it("logs each turn on the case timeline", async () => {
    renderApp({ user: "supervisor1", route: "/cases/DSP-2026-000412" });
    const drawer = await openCopilot();
    fireEvent.click(within(drawer).getByRole("button", { name: "Summarize this case" }));
    await within(drawer).findByRole("button", { name: "Show evidence E-2" });
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(await screen.findByText(/conversation.turn · copilot/)).toBeInTheDocument();
  });

  it("a redraft through the copilot makes you the preparer, so you can't approve it (D-10)", async () => {
    renderApp({ user: "analyst1", route: "/cases/DSP-2026-000412" });
    const drawer = await openCopilot();
    fireEvent.change(within(drawer).getByLabelText("Ask about this case"), { target: { value: "Show me the letter drafts" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Send" }));
    fireEvent.click(await within(drawer).findByRole("button", { name: /Redraft provisional credit notice/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("You become the preparer");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create new version as me" }));
    expect(await screen.findByText("New draft version created. You are its preparer.")).toBeInTheDocument();
    // P-2 (the notice letter) now shows analyst1 as preparer; selecting it shows the four-eyes block.
    const p2 = await screen.findByText(/P-2 · .* by analyst1/);
    fireEvent.click(p2);
    await waitFor(() => expect(screen.getByTestId("approve-block")).toHaveTextContent("You prepared this proposal"));
  });

  it("shows Auditors answers but no suggested actions", async () => {
    renderApp({ user: "auditor1", route: "/cases/DSP-2026-000412" });
    const drawer = await openCopilot();
    fireEvent.click(within(drawer).getByRole("button", { name: "What’s missing before we file the chargeback?" }));
    await within(drawer).findByRole("button", { name: "Show evidence E-5" });
    expect(within(drawer).queryByRole("button", { name: /Redraft/ })).not.toBeInTheDocument();
  });
});

describe("Investigation Co-Pilot: brief and lookups (FR-38)", () => {
  it("opens on a cited brief with gaps, conflicts, risks and a plan", async () => {
    renderApp({ user: "supervisor1", route: "/cases/DSP-2026-000412" });
    const drawer = await openCopilot("Brief");
    const gaps = await within(drawer).findByRole("region", { name: "Gaps" });
    expect(gaps).toHaveTextContent("Signed affidavit of unauthorized use is missing");
    expect(within(drawer).getByRole("region", { name: "Conflicts" })).toHaveTextContent("card-present");
    expect(within(drawer).getByRole("region", { name: "Plan" })).toHaveTextContent("Decide: provisional credit");
    expect(within(drawer).getByText(/Local model unavailable/)).toBeInTheDocument(); // tests run without the model
  });

  it("runs a read-only lookup from the brief and adds it as evidence", async () => {
    renderApp({ user: "analyst1", route: "/cases/DSP-2026-000412" });
    const drawer = await openCopilot("Brief");
    const lookups = await within(drawer).findByRole("region", { name: "Lookups" });
    const row = within(lookups).getByText("How the card was read at the terminal").closest("li")!;
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Run" }));
    expect(await screen.findByText(/added to the case as E-7/)).toBeInTheDocument();
    // The brief updates: the lookup now links to its evidence and explains the conflict.
    expect((await within(drawer).findAllByRole("button", { name: "Show evidence E-7" })).length).toBeGreaterThan(0);
    await waitFor(() => expect(within(drawer).getByRole("region", { name: "Conflicts" })).toHaveTextContent("counterfeit"));
  });

  it("runs a lookup when asked, and cites the new evidence", async () => {
    renderApp({ user: "supervisor1", route: "/cases/DSP-2026-000412" });
    const drawer = await openCopilot();
    fireEvent.click(within(drawer).getByRole("button", { name: "Has this merchant had other disputes?" }));
    expect(await within(drawer).findByText(/14 fraud disputes in the last 90 days/)).toBeInTheDocument();
    expect(within(drawer).getAllByRole("button", { name: "Show evidence E-7" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: /Evidence/ }));
    expect(screen.getByText("Merchant dispute history, 90 days")).toBeInTheDocument();
  });

  it("doesn't let an Auditor run lookups", async () => {
    renderApp({ user: "auditor1", route: "/cases/DSP-2026-000412" });
    const drawer = await openCopilot("Brief");
    await within(drawer).findByRole("region", { name: "Lookups" });
    expect(within(drawer).queryByRole("button", { name: "Run" })).not.toBeInTheDocument();
  });
});
