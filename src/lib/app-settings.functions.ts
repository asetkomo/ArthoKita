import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { appSettingsInputSchema } from "./app-settings";

/** Public (no login): only non-sensitive branding fields for landing, login and <head>. */
export const getPublicBranding = createServerFn({ method: "GET" }).handler(async () => {
  const { getBranding } = await import("./app-settings.server");
  return getBranding();
});

export const getAppSettingsFull = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const { readAppSettings } = await import("./app-settings.server");
    return readAppSettings();
  });

export const saveAppSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => appSettingsInputSchema.parse(d))
  .handler(async ({ data }) => {
    const { saveAppSettings } = await import("./app-settings.server");
    return saveAppSettings(data);
  });
