import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ModelClient } from "../api/localModel";
import { AppProviders, AppRoutes } from "../App";

/** Renders the whole console at `route`, signed in as `user` (or at the sign-in page), on a zero-latency mock API. */
export function renderApp({ user, route = "/cases", model }: { user?: string; route?: string; model?: ModelClient } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProviders initialUserId={user} mockLatencyMs={0} localModel={false} modelClient={model}>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  );
}
