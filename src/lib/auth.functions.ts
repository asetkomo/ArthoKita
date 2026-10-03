import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const { readSession } = await import("./session.server");
  const s = readSession();
  return { authenticated: !!s, user: s?.u ?? null };
});

export const login = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { checkCredentials, createSession } = await import("./session.server");
    if (!checkCredentials(data.username, data.password)) {
      await new Promise((r) => setTimeout(r, 600));
      return { ok: false as const };
    }
    createSession(data.username);
    return { ok: true as const };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { destroySession } = await import("./session.server");
  destroySession();
  return { ok: true };
});
