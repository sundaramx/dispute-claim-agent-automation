import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AppProviders, AppRoutes } from "../App";

/** Renders the whole console at `route`, signed in as `user` (or at the sign-in page), on a zero-latency mock API. */
export function renderApp({ user, route = "/cases" }: { user?: string; route?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProviders initialUserId={user} mockLatencyMs={0} localModel={false}>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  );
}
