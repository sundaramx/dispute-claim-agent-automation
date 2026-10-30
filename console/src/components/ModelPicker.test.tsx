import { fireEvent, screen, waitFor } from "@testing-library/react";
import { FakeModel } from "../test/fakeModel";
import { renderApp } from "../test/renderApp";

describe("Co-Pilot model picker (bottom-left)", () => {
  it("lists installed models and switches the Co-Pilot, updating the header", async () => {
    const model = new FakeModel([]);
    renderApp({ user: "analyst1", model });
    const picker = await screen.findByLabelText(/Co-Pilot model/);
    await waitFor(() => expect(picker).toHaveValue("qwen2.5:7b"));
    expect(screen.getByRole("option", { name: "qwen2.5:7b (7.6B · 4.7 GB)" })).toBeInTheDocument();
    fireEvent.change(picker, { target: { value: "qwen3.6:27b-mlx" } });
    expect(await screen.findByText(/Co-Pilot now uses qwen3.6:27b-mlx/)).toBeInTheDocument();
    expect(model.current).toBe("qwen3.6:27b-mlx");
    expect(await screen.findByText("Local model · qwen3.6:27b-mlx")).toBeInTheDocument();
  });

  it("shows offline when no model gateway is reachable", async () => {
    renderApp({ user: "analyst1" });
    await waitFor(() => expect(screen.getByLabelText(/Co-Pilot model/)).toHaveDisplayValue("Offline · rule-based"));
    expect(screen.getByLabelText(/Co-Pilot model/)).toBeDisabled();
  });
});
