import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Baseline security headers. Set in place on whatever response comes back
// (page, server fn, API route, error page) and return the result untouched so
// streaming/body ownership is unaffected. No X-Frame-Options/frame-ancestors
// (Lovable previews run in an iframe) and no CSP on purpose.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
};

const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const res: unknown =
    result instanceof Response ? result : (result as { response?: unknown } | undefined)?.response;
  if (res instanceof Response) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      try {
        if (!res.headers.has(k)) res.headers.set(k, v);
      } catch {
        // Immutable headers (e.g. Response.redirect): skip rather than fail.
      }
    }
  }
  return result;
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware, errorMiddleware, csrfMiddleware],
}));
