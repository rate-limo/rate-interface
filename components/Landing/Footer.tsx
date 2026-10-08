import { useTranslations } from "next-intl";
import { Container } from "@components/Landing/ui/Container";

/** Same rule as the status bar: proper nouns keep their names, common nouns
 * get a key. */
const LINKS: { label: string; href: string; i18nKey?: "terms" | "privacy" | "cookies" }[] = [
  { label: "Twitter/X", href: "https://x.com/off____grid" },
  {
    label: "GitHub",
    href: "https://github.com/rate-limo/rate-monorepo",
  },
  {
    label: "Whitepaper",
    href: "https://github.com/rate-limo/rate-research/blob/main/iter-whitepaper.md",
  },
  // The consent banner links to /cookies, but a user who already answered it
  // needs a standing route back to the legal pages — this is it on the landing
  // side, mirroring the StatusBar links inside the app.
  { label: "Fees", href: "/fees" },
  { label: "Terms", href: "/terms", i18nKey: "terms" as const },
  { label: "Privacy", href: "/privacy", i18nKey: "privacy" as const },
  { label: "Cookies", href: "/cookies", i18nKey: "cookies" as const },
];

export function Footer() {
  const t = useTranslations("landing.footer");
  return (
    <footer className="border-t border-white/5 py-10">
      <Container className="flex flex-col items-center justify-between gap-6 sm:flex-row">
        <span className="font-mono-brand text-xs tracking-[0.1em] text-dark-grey-1 uppercase">
          {t("copyright", { year: 2026 })}
        </span>
        {/* `flex-wrap` is load-bearing on mobile. Six uppercase mono links at
            gap-6 measure ~490px, and without wrapping they set this row's width
            — pushing the whole document to 405px at a 320px viewport and giving
            every page a sideways scroll, since nothing here clips.
            `gap-y-3` keeps the wrapped rows legible; `justify-center` matches
            the column layout the Container already uses below `sm`. */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:justify-end">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="font-mono-brand text-xs tracking-[0.1em] text-dark-grey-1 uppercase transition-colors hover:text-purple-700 dark:hover:text-purple-300"
            >
              {link.i18nKey ? t(link.i18nKey) : link.label}
            </a>
          ))}
        </div>
      </Container>
    </footer>
  );
}
