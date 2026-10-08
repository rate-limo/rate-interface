/**
 * What to call a wallet, given what each profile table says about it.
 *
 * ## The precedence is the part worth pinning
 *
 * The wallet's OWN authored name wins; the lazily generated handle only ever
 * fills a blank. Never the reverse — that is the bug migration 0002 removed,
 * where a derived value permanently outranked something the user had typed.
 *
 * `displayName` before `username` because the first is what the edit modal
 * calls "Display name" and the second is the `@handle` beneath it.
 *
 * Returns null rather than a shortened address: the caller decides how to draw
 * an unnamed wallet, and the button and the menu draw it differently — mono and
 * truncated in one, full and wrapped in the other.
 */
export function pickWalletName(
  authored: { displayName?: string | null; username?: string | null } | null | undefined,
  generatedHandle: string | null | undefined,
): string | null {
  return (
    nonEmpty(authored?.displayName) ?? nonEmpty(authored?.username) ?? nonEmpty(generatedHandle) ?? null
  );
}

/** Blank strings are how an unset field arrives from a form, and are not names. */
function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
