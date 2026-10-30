import { fireEvent, screen, within } from "@testing-library/react";
import { renderApp } from "../../test/renderApp";

describe("Audit trail (T90, FR-26, FR-27)", () => {
  it("lists events with chain hashes and filters by type", async () => {
    renderApp({ user: "auditor1", route: "/audit" });
    expect(await screen.findAllByText("intake.received")).not.toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Security" }));
    expect(await screen.findByText("security.four_eyes_violation")).toBeInTheDocument();
    expect(screen.queryByText("intake.received")).not.toBeInTheDocument();
  });

  it("searches by case", async () => {
    renderApp({ user: "auditor1", route: "/audit" });
    await screen.findAllByText("intake.received");
    fireEvent.change(screen.getByLabelText("Case"), { target: { value: "DSP-2026-000412" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("decision.made")).toBeInTheDocument();
    const caseLinks = screen.getAllByRole("link", { name: /DSP-2026-/ }).map((a) => a.textContent);
    expect(new Set(caseLinks)).toEqual(new Set(["DSP-2026-000412"]));
  });

  it("lets an Auditor verify the chain", async () => {
    renderApp({ user: "auditor1", route: "/audit" });
    fireEvent.click(await screen.findByRole("button", { name: "Verify chain" }));
    expect(await screen.findByText(/Chain intact/)).toBeInTheDocument();
  });

  it("shows hash links for an event, payload by digest when restricted", async () => {
    renderApp({ user: "auditor1", route: "/audit" });
    fireEvent.click((await screen.findAllByText("intake.received"))[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Previous hash")).toBeInTheDocument();
    expect(within(dialog).getByText("Digest only (restricted PII)")).toBeInTheDocument();
  });

  it("gives Supervisors replay but not verify", async () => {
    renderApp({ user: "supervisor1", route: "/audit" });
    fireEvent.click(await screen.findByRole("button", { name: "Replay" }));
    expect(await screen.findByText(/DSP-2026-000412: match/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify chain" })).not.toBeInTheDocument();
  });
});
