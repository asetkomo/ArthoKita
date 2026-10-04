import { useBranding } from "@/components/app-logo";
import { useI18n } from "@/lib/i18n";
import { repoUrl } from "@/lib/landing";
import { LandingHeader } from "./landing-header";
import {
  Faq,
  FeatureBento,
  FinalCta,
  Hero,
  HowItWorks,
  LandingFooter,
  SelfHost,
  TechStack,
} from "./landing-sections";

/** Public landing page at `/`: only public branding, never finance data. */
export function LandingPage({ authenticated }: { authenticated: boolean }) {
  const { t } = useI18n();
  const b = useBranding();
  const repo = repoUrl(b.github_url);
  return (
    <div className="landing min-h-screen bg-background text-foreground">
      <a
        href="#konten"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("Lewati ke konten")}
      </a>
      <LandingHeader authenticated={authenticated} repo={repo} />
      <main id="konten">
        <Hero tagline={b.landing_tagline} repo={repo} authenticated={authenticated} />
        <FeatureBento />
        <HowItWorks />
        <SelfHost repo={repo} />
        <TechStack />
        <Faq />
        <FinalCta repo={repo} authenticated={authenticated} />
      </main>
      <LandingFooter repo={repo} />
    </div>
  );
}
