import { screen } from "@testing-library/react";
import { renderApp } from "../../test/renderApp";

describe("SLA dashboard (T88, FR-24)", () => {
  it("shows SM-1, SM-2 with its unvalidated-baseline flag, and the at-risk list", async () => {
    renderApp({ user: "supervisor1", route: "/dashboard" });
    expect(await screen.findByLabelText("Deadline compliance")).toHaveTextContent("100%");
    expect(screen.getByLabelText("Handling time saved")).toHaveTextContent("baseline unvalidated");
    expect(screen.getByRole("link", { name: "DSP-2026-000398" })).toBeInTheDocument();
    expect(screen.getByText("Approve: Provisional credit")).toBeInTheDocument();
  });

  it("shows model usage to Supervisors (FR-24 AC 3)", async () => {
    renderApp({ user: "supervisor1", route: "/dashboard" });
    expect(await screen.findByText("evidence_summary")).toBeInTheDocument();
  });

  it("hides model usage from Analysts", async () => {
    renderApp({ user: "analyst1", route: "/dashboard" });
    expect(await screen.findByText(/visible to Supervisors, Auditors and Admins/)).toBeInTheDocument();
    expect(screen.queryByText("evidence_summary")).not.toBeInTheDocument();
  });
});
