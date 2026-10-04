import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_BRANDING } from "@/lib/app-settings";
import { docsUrl, landingRedirect, repoUrl, screenshotSrc } from "@/lib/landing";
import { routeTree } from "@/routeTree.gen";

const session = vi.hoisted(() => ({ authenticated: false }));
const branding = vi.hoisted(() => ({ landing_enabled: true }));

vi.mock("@/lib/auth.functions", () => ({
  getSession: vi.fn(async () => ({
    authenticated: session.authenticated,
    user: session.authenticated ? "me" : null,
  })),
  login: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("@/lib/app-settings.functions", () => ({
  getPublicBranding: vi.fn(async () => ({ ...DEFAULT_BRANDING, ...branding })),
  getAppSettingsFull: vi.fn(),
  saveAppSettingsFn: vi.fn(),
}));

async function load(path: string) {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  return router;
}

afterEach(async () => {
  cleanup();
  session.authenticated = false;
  branding.landing_enabled = true;
  const { clearSessionCache } = await import("@/lib/session-cache");
  clearSessionCache();
});

describe("landingRedirect", () => {
  it("renders the landing page when enabled", () => {
    expect(landingRedirect({ enabled: true, authenticated: false })).toBeNull();
    expect(landingRedirect({ enabled: true, authenticated: true })).toBeNull();
  });
  it("skips to login or dashboard when disabled", () => {
    expect(landingRedirect({ enabled: false, authenticated: false })).toBe("/login");
    expect(landingRedirect({ enabled: false, authenticated: true })).toBe("/dashboard");
  });
});

describe("landing link helpers", () => {
  it("falls back to the upstream repo for missing or non-https URLs", () => {
    expect(repoUrl(null)).toBe("https://github.com/ilramdhan/fintrack");
    expect(repoUrl("http://github.com/a/b")).toBe("https://github.com/ilramdhan/fintrack");
    expect(repoUrl("https://github.com/a/b/")).toBe("https://github.com/a/b");
  });
  it("builds docs links on GitHub repos only", () => {
    expect(docsUrl("https://github.com/a/b", "docs/FAQ.md")).toBe(
      "https://github.com/a/b/blob/main/docs/FAQ.md",
    );
    expect(docsUrl("https://gitlab.com/a/b", "LICENSE")).toBe(
      "https://github.com/ilramdhan/fintrack/blob/main/LICENSE",
    );
  });
  it("maps screenshot names to light and dark files", () => {
    expect(screenshotSrc("dashboard")).toBe("/screenshots/dashboard.png");
    expect(screenshotSrc("dashboard", true)).toBe("/screenshots/dashboard-dark.png");
  });
});

describe("landing route", () => {
  it("renders the landing with a sign-in button for visitors", async () => {
    const router = await load("/");
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    const signIn = screen.getAllByRole("link", { name: "Masuk" });
    expect(signIn[0]).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: "Buka Dashboard" })).toBeNull();
  });

  it("offers the dashboard when already signed in", async () => {
    session.authenticated = true;
    const router = await load("/");
    render(<RouterProvider router={router} />);
    const open = await screen.findAllByRole("link", { name: "Buka Dashboard" });
    expect(open[0]).toHaveAttribute("href", "/dashboard");
  });

  it("redirects to /login when the landing page is disabled", async () => {
    branding.landing_enabled = false;
    const router = await load("/");
    expect(router.state.location.pathname).toBe("/login");
  });
});
