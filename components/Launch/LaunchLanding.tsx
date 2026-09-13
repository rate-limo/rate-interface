"use client";

import { useEffect, useRef, useState } from "react";
import { LaunchFlow } from "./LaunchFlow";
import { AuctionFlow } from "./AuctionFlow";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_171521_25968ba2-b594-4b32-aab7-f6b69398a6fa.mp4";

const BENEFITS = [
  "Create an orderbook in minutes",
  "Near-zero impermanent loss for LPs",
  "Graduate into futures with backing liquidity",
  "Get attention as an emerging token",
  "Stop-limit orders from day one",
] as const;

export function LaunchLanding({ networkSlug }: { networkSlug: string }) {
  const [started, setStarted] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [whiteStarted, setWhiteStarted] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [availability, setAvailability] = useState({ auction: true, fair: true });
  const videoRef = useRef<HTMLVideoElement>(null);
  // Keep the chooser as the new entry point; the persisted flag only remembers
  // that the user selected the Degen flow, not the old pre-chooser landing page.
  const startedStorageKey = `iter:launch-started:degen:${networkSlug}`;

  useEffect(() => {
    try {
      setStarted(window.localStorage.getItem(startedStorageKey) === "1");
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }, [startedStorageKey]);

  useEffect(() => {
    let live = true;
    // `?chain=` is required: `/launch-config` reads `landingContent`, which is
    // per chain on purpose, and the handler resolves that chain's own
    // admin-service. Without it one chain's venue configuration was served on
    // every chain's launch page.
    void fetch(`/launch-config?chain=${encodeURIComponent(networkSlug)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((config: { auctionLaunchEnabled?: boolean; fairLaunchEnabled?: boolean } | null) => {
        if (!live || !config) return;
        setAvailability({
          auction: config.auctionLaunchEnabled !== false,
          fair: config.fairLaunchEnabled !== false,
        });
      })
      .catch(() => {
        // Keep both enabled if the optional config service is unavailable.
      });
    return () => {
      live = false;
    };
  }, [networkSlug]);

  if (started) {
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setStarted(false);
            setChooserOpen(true);
            try {
              window.localStorage.removeItem(startedStorageKey);
            } catch {
              // Continue in-memory when storage is unavailable.
            }
          }}
          className="ml-auto mr-auto mt-7 block w-full max-w-[1120px] px-[22px] text-left font-mono text-[11px] text-[var(--m-text-secondary)] transition-colors hover:text-[var(--m-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-primary)]"
        >
          ← Back to launch overview
        </button>
        <LaunchFlow networkSlug={networkSlug} />
      </div>
    );
  }

  if (whiteStarted) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setWhiteStarted(false)}
          className="ml-auto mr-auto mt-7 block w-full max-w-[1120px] px-[22px] text-left font-mono text-[11px] text-[var(--m-text-secondary)] transition-colors hover:text-[var(--m-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-primary)]"
        >
          ← Back to launch types
        </button>
        <AuctionFlow networkSlug={networkSlug} />
      </div>
    );
  }

  if (!chooserOpen) {
    const toggleVideo = async () => {
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) await video.play();
      else video.pause();
      setPlaying(!video.paused);
    };

    return (
      <section className="relative mx-auto grid min-h-[calc(100dvh-118px)] w-full max-w-[1500px] items-center gap-10 px-6 py-10 lg:grid-cols-[minmax(350px,0.72fr)_minmax(560px,1.28fr)] lg:px-10 xl:gap-16 xl:px-14">
        <div className="relative z-10 min-w-0 w-full max-w-[calc(100vw-48px)] py-4 lg:max-w-[560px]">
          <h1 className="max-w-[12ch] text-balance text-[clamp(42px,5vw,64px)] font-medium leading-[0.96] tracking-[-0.05em] text-[var(--m-text-primary)]">
            Create an asset
          </h1>
          <p className="mt-6 max-w-[47ch] text-pretty text-[16px] leading-7 text-[var(--m-text-secondary)]">
            Create a token, open its onchain orderbook and seed backing liquidity in one flow. Build a market that can mature into Iter futures.
          </p>

          <ul id="launch-benefits" className="mt-9 border-t border-[var(--m-border)]">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex min-h-14 items-center gap-3 border-b border-[var(--m-border)] py-3 text-[15px] leading-6 text-[var(--m-text-primary)]">
                <span className="font-mono text-[13px] text-[var(--m-primary-fg)]" aria-hidden>✓</span>
                {benefit}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="launch-chooser-open"
              onClick={() => setChooserOpen(true)}
              className="min-h-12 rounded-xl bg-[var(--m-primary)] px-7 text-[14px] font-medium text-[var(--m-on-primary)] transition duration-200 hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--m-background)]"
            >
              Launch now
            </button>
            <a href="#launch-benefits" className="flex min-h-12 items-center rounded-xl bg-[var(--m-surface-2)] px-7 text-[14px] font-medium text-[var(--m-primary-fg)] transition-colors hover:bg-[var(--m-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-primary)]">
              How it works
            </a>
          </div>
        </div>

        <div className="relative min-h-[420px] min-w-0 w-full max-w-[calc(100vw-48px)] overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--m-primary)_24%,var(--m-border))] bg-[#07143b] shadow-[0_30px_90px_color-mix(in_srgb,var(--m-primary)_18%,transparent)] lg:min-h-[650px] lg:max-w-none lg:rounded-[30px]">
          <video
            ref={videoRef}
            src={VIDEO_URL}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="Iter token launch product film"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_68%,rgba(3,9,28,0.32))]" />
          <button type="button" onClick={toggleVideo} aria-label={playing ? "Pause launch video" : "Play launch video"} className="absolute bottom-5 right-5 grid size-12 place-items-center rounded-full border border-white/60 bg-[#f7f9fc] text-[#0a163d] shadow-lg transition duration-200 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <span className="font-mono text-[15px] font-semibold" aria-hidden>{playing ? "Ⅱ" : "▶"}</span>
          </button>
        </div>
      </section>
    );
  }

  if (chooserOpen) {
    return (
      <section className="mx-auto flex min-h-[calc(100dvh-118px)] w-full max-w-[1280px] flex-col justify-center px-5 py-12 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-[980px]">
          <div className="max-w-[650px]">
            <h1 className="text-balance text-[clamp(42px,6vw,76px)] font-medium leading-[0.92] tracking-[-0.065em] text-[var(--m-text-primary)]">
              Choose your launch.
            </h1>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <button
              type="button"
              onClick={() => availability.auction && setWhiteStarted(true)}
              disabled={!availability.auction}
              className="group relative min-w-0 overflow-hidden rounded-[26px] border border-[var(--m-border)] bg-[var(--m-surface)] text-left shadow-[0_18px_50px_rgba(24,36,62,0.08)] transition duration-300 hover:-translate-y-1 hover:border-[color:color-mix(in_srgb,var(--m-primary)_48%,var(--m-border))] hover:shadow-[0_26px_70px_rgba(24,36,62,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-primary)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--m-background)]"
            >
              <div className="relative aspect-[1.55] overflow-hidden">
                <img src="/images/launch-auction.png" alt="Impressionist auction scene representing an auction launch" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.035]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#18243b]/70 via-transparent to-transparent" />
                <span className="absolute left-5 top-5 rounded-full border border-[#ffffff]/65 bg-[#ffffff]/78 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#20304d] backdrop-blur-sm">
                  {availability.auction ? "Available now" : "Unavailable"}
                </span>
              </div>
              <div className="flex items-end justify-between gap-4 p-6">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--m-text-secondary)]">Price discovery</p>
                  <h2 className="mt-2 text-[28px] font-medium tracking-[-0.045em] text-[var(--m-text-primary)]">Auction launch</h2>
                  <p className="mt-2 max-w-[30ch] text-[14px] leading-6 text-[var(--m-text-secondary)]">Discover a fair opening price through a transparent auction before the market opens.</p>
                </div>
                <span aria-hidden className="mb-1 grid size-10 shrink-0 place-items-center rounded-full border border-[var(--m-border)] text-lg text-[var(--m-text-secondary)] transition group-hover:border-[var(--m-primary)] group-hover:text-[var(--m-primary)]">↗</span>
              </div>
            </button>

            <button
              type="button"
              data-testid="create-coin-start"
              onClick={() => {
                if (!availability.fair) return;
                setStarted(true);
                try {
                  window.localStorage.setItem(startedStorageKey, "1");
                } catch {
                  // Continue in-memory when storage is unavailable.
                }
              }}
              disabled={!availability.fair}
              className="group relative min-w-0 overflow-hidden rounded-[26px] border border-[#27314d] bg-[#10172a] text-left shadow-[0_18px_55px_rgba(9,15,35,0.24)] transition duration-300 hover:-translate-y-1 hover:border-[#7582b8] hover:shadow-[0_30px_80px_rgba(9,15,35,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-primary)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--m-background)]"
            >
              <div className="relative aspect-[1.55] overflow-hidden">
                <img src="/images/launch-fair.png" alt="Community fair-launch scene" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.035]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1020]/75 via-transparent to-transparent" />
                <span className="absolute left-5 top-5 rounded-full border border-[#f3f4f6]/25 bg-[#11182c]/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#f3f4f6]/85 backdrop-blur-sm">
                  {availability.fair ? "Available now" : "Unavailable"}
                </span>
              </div>
              <div className="flex items-end justify-between gap-4 p-6">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#9faad0]">Community-first</p>
                  <h2 className="mt-2 text-[28px] font-medium tracking-[-0.045em] text-[#f3f4f6]">Fair launch</h2>
                  <p className="mt-2 max-w-[30ch] text-[14px] leading-6 text-[#aab4d0]">Put the community first with an open launch, an orderbook and locked backing liquidity.</p>
                </div>
                <span aria-hidden className="mb-1 grid size-10 shrink-0 place-items-center rounded-full border border-[#f3f4f6]/25 text-lg text-[#f3f4f6] transition group-hover:border-[#f3f4f6] group-hover:bg-[#f3f4f6] group-hover:text-[#10172a]">↗</span>
              </div>
            </button>
          </div>

        </div>
      </section>
    );
  }

}
