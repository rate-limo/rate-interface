"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { previewSound, useSoundSettings, writeSoundSettings } from "@/lib/sound";

/**
 * Sound on/off. Shaped exactly like `ThemeToggle` and placed beside it — in the
 * StatusBar on desktop, in the ☰ More sheet on a phone — because the two are the
 * same kind of thing: a preference about how the app presents itself.
 *
 * It opts out of the click delegate (`data-sound="none"`) and sounds itself
 * AFTER the change: turning sound on plays `toggleOn` (the proof it worked),
 * turning it off plays `toggleOff` once, as the last thing you hear.
 */
export function SoundToggle({ className = "" }: { className?: string }) {
  const { enabled } = useSoundSettings();
  // Same rule as ThemeToggle: the server renders the default, so the icon waits
  // for mount rather than flashing the wrong state.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span className={`inline-block h-8 w-8 ${className}`} />;
  }

  return (
    <button
      type="button"
      data-sound="none"
      role="switch"
      aria-checked={enabled}
      onClick={() => {
        writeSoundSettings({ enabled: !enabled });
        previewSound(enabled ? "toggleOff" : "toggleOn");
      }}
      aria-label={enabled ? "Turn interface sounds off" : "Turn interface sounds on"}
      title={enabled ? "Sound on" : "Sound off"}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-dark-grey-1 transition-colors hover:text-purple-400 ${className}`}
    >
      {enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
    </button>
  );
}
