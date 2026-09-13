"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The control that opens the search modal.
 *
 * It is a BUTTON, not an input, in both forms. A field that swallows the first
 * keystroke and then re-renders it inside a dialog is the classic version of this
 * bug — the character is typed into a node that unmounts. The button carries the
 * placeholder text so it still reads as a search field.
 *
 * State lives in `AppShell`, not here: the desktop bar and the mobile header both
 * mount at every width (only CSS hides one), so a trigger that owned its own
 * dialog would put two of them in the tree and a ⌘K listener on each.
 */

/** Whether to render the desktop pill or the mobile icon button. */
type Variant = "field" | "icon";

export function SearchTrigger({
    onOpen,
    variant = "field",
    className,
}: {
    onOpen: () => void;
    variant?: Variant;
    className?: string;
}) {
    if (variant === "icon") {
        return (
            <button
                type="button"
                onClick={onOpen}
                aria-label="Search tokens, pools and wallets"
                className={className}
            >
                <Search className="h-5 w-5" />
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label="Search tokens, pools and wallets"
            aria-keyshortcuts="Meta+K Control+K"
            className={cn(
                "flex items-center gap-3 rounded-xl border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-4 py-2.5 text-left text-sm text-[color:var(--m-text-secondary)] transition-colors hover:border-[color:var(--m-text-secondary-2)] hover:text-[color:var(--m-text-primary)]",
                className,
            )}
        >
            <Search className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Search tokens, pools, and wallets</span>
            <ShortcutHint />
        </button>
    );
}

/**
 * `⌘K` on Apple platforms, `Ctrl K` everywhere else.
 *
 * Rendered null until an effect runs. `navigator.platform` does not exist on the
 * server, so picking the glyph during render is a hydration mismatch — and the
 * hint is decoration, so the empty first paint costs nothing.
 */
function ShortcutHint() {
    const [label, setLabel] = useState<string | null>(null);

    useEffect(() => {
        const apple = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
        setLabel(apple ? "⌘K" : "Ctrl K");
    }, []);

    if (!label) return null;
    return (
        <kbd className="shrink-0 rounded border border-[color:var(--m-border)] px-1.5 py-0.5 font-dm-mono text-[10px] text-[color:var(--m-text-secondary)]">
            {label}
        </kbd>
    );
}

/**
 * Registers the global ⌘K / Ctrl-K shortcut. Call once, from the shell.
 *
 * Ignores the chord while the user is typing into another field — a page with its
 * own inputs (the swap card's amount, the support composer) must not have ⌘K stolen
 * mid-entry — and lets the browser keep the combination inside a text selection.
 */
export function useSearchShortcut(onOpen: () => void): void {
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.key !== "k" && event.key !== "K") return;
            if (!event.metaKey && !event.ctrlKey) return;
            const target = event.target as HTMLElement | null;
            const tag = target?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
            event.preventDefault();
            onOpen();
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onOpen]);
}
