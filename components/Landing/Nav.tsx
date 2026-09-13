import Link from "next/link";
import { Container } from "@components/Landing/ui/Container";
import { JoinWaitlistButton } from "@components/Landing/JoinWaitlistButton";
import { LogoMarkV2 } from "@components/Atoms/LogoMarkV2";
import { ThemeToggle } from "@components/ThemeToggle";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-black-400/80 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between md:h-[72px]">
        <Link
          href="/"
          className="flex items-center gap-3 text-[color:var(--m-logo)]"
        >
          <LogoMarkV2 size={22} />
          {/* Not `uppercase`, and the tracking comes down with it. The class was
              doing the capitalising, so renaming the text alone would still have
              rendered ITER; and 0.14em was letterspacing tuned for all-caps —
              left on mixed case it reads as gappy rather than considered. */}
          <span className="font-display text-base font-bold tracking-[0.01em]">
            Iter
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <JoinWaitlistButton className="text-[11px] md:text-xs" />
        </div>
      </Container>
    </header>
  );
}
