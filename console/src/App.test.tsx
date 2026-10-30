import { fireEvent, screen } from "@testing-library/react";
import { renderApp } from "./test/renderApp";

describe("App", () => {
  it("starts at sign-in and lands on the case queue", async () => {
    renderApp();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /supervisor1/ }));
    expect(await screen.findByRole("heading", { name: "Case queue" })).toBeInTheDocument();
    expect(await screen.findByText("Auto-approve OFF")).toBeInTheDocument();
  });

  it("shows navigation by role (FR-21 AC 2)", async () => {
    renderApp({ user: "auditor1" });
    const nav = await screen.findByRole("navigation", { name: "Primary" });
    expect(nav).toHaveTextContent("Audit trail");
    expect(nav).not.toHaveTextContent("Approvals");
    expect(nav).not.toHaveTextContent("New dispute");
  });

  it("signs out back to the sign-in page", async () => {
    renderApp({ user: "analyst1" });
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});
