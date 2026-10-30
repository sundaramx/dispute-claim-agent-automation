import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../../test/renderApp";

const rowRefs = () =>
  screen.getAllByRole("row").slice(1).map((r) => within(r).queryByRole("link")?.textContent).filter(Boolean);

describe("Case queue (T84, FR-22 AC 1)", () => {
  it("sorts by nearest deadline and shows the countdown unit per clock", async () => {
    renderApp({ user: "analyst1" });
    await screen.findByText("DSP-2026-000398");
    expect(rowRefs()[0]).toBe("DSP-2026-000398");
    expect(screen.getAllByText("1 BD").length).toBeGreaterThan(0); // Reg E: business days
    expect(screen.getAllByText("2 days").length).toBeGreaterThan(0); // Reg Z: calendar days
  });

  it("filters by regime through the API", async () => {
    renderApp({ user: "analyst1" });
    await screen.findByText("DSP-2026-000398");
    fireEvent.change(screen.getByLabelText("Regime"), { target: { value: "reg_z" } });
    await waitFor(() => expect(rowRefs()).toEqual(["DSP-2026-000366", "DSP-2026-000377", "DSP-2026-000340"]));
  });

  it("has an at-risk view", async () => {
    renderApp({ user: "analyst1" });
    await screen.findByText("DSP-2026-000398");
    fireEvent.click(screen.getByRole("tab", { name: /At risk/ }));
    expect(rowRefs()).toEqual(["DSP-2026-000398", "DSP-2026-000366", "DSP-2026-000401", "DSP-2026-000355"]);
  });

  it("lets an Analyst claim an unassigned case, but not an Auditor", async () => {
    renderApp({ user: "analyst1" });
    await screen.findByText("DSP-2026-000401");
    fireEvent.click(screen.getAllByRole("button", { name: "Claim" })[0]);
    expect(await screen.findByText("DSP-2026-000401 assigned to you")).toBeInTheDocument();
  });

  it("shows no claim control to an Auditor", async () => {
    renderApp({ user: "auditor1" });
    await screen.findByText("DSP-2026-000401");
    expect(screen.queryByRole("button", { name: "Claim" })).not.toBeInTheDocument();
  });

  it("opens a case with the keyboard (NFR-14)", async () => {
    renderApp({ user: "analyst1" });
    await screen.findByText("DSP-2026-000398");
    fireEvent.keyDown(document, { key: "j" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(await screen.findByRole("heading", { name: "DSP-2026-000366" })).toBeInTheDocument();
  });
});
