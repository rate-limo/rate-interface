"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Pencil, X as CloseIcon, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ProfileData, SignMessage } from "@/lib/portfolio/profile";
import {
  addressGradient,
  fetchProfile,
  isSignatureRejection,
  saveProfile,
  uploadProfileImage,
} from "@/lib/portfolio/profile";
import {
  openXLinkWindow,
  type XLinkWindow,
  parseXLinkMessage,
  startXLink,
  xFailureMessage,
  X_LINK_RETURN_PATH,
} from "@/lib/profile/xLink";
import { unlinkX } from "@/lib/profile/unlinkX";

const USERNAME_MAX = 20;
const DISPLAY_NAME_MAX = 50;
const BIO_MAX = 160;
const X_HANDLE_MAX = 15;

/** X's own wordmark, not lucide's close-icon "X" -- those look identical at a
 * glance but are unrelated glyphs. Kept as an inline path rather than a dep:
 * lucide has no brand mark for this (deliberately -- see its icon-scope docs),
 * and this is the only place in the app that needs it. */
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LabeledField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength: number;
  prefix?: string;
}) {
  return (
    <label className="block rounded-2xl bg-[color:var(--m-surface-2)] px-4 py-3">
      <span className="block text-[13px] text-[color:var(--m-text-secondary)]">{label}</span>
      <span className="mt-1 flex items-center gap-0.5">
        {prefix && <span className="text-[16px] font-medium text-[color:var(--m-text-primary)]">{prefix}</span>}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          placeholder={placeholder}
          className="w-full bg-transparent text-[16px] font-medium text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary)] placeholder:font-normal"
        />
      </span>
    </label>
  );
}

export function EditProfileModal({
  open,
  onOpenChange,
  networkName,
  address,
  profile,
  signMessageAsync,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  networkName: string;
  address: string;
  profile: ProfileData | null;
  signMessageAsync: SignMessage;
  onSaved: (profile: ProfileData) => void;
}) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [xHandle, setXHandle] = useState<string | null>(null);
  const [unlinkingX, setUnlinkingX] = useState(false);
  const [connectingX, setConnectingX] = useState(false);
  /**
   * The popup we are waiting on, so its closing can be noticed.
   *
   * A ref rather than state: nothing renders from it, and setting state from
   * the poll below would re-run the effect that owns the poll.
   */
  const xPopup = useRef<XLinkWindow | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Re-seed from the live profile every time the modal opens, so a second
  // open after a cancelled edit doesn't show stale draft text.
  useEffect(() => {
    if (!open) return;
    setUsername(profile?.username ?? "");
    setDisplayName(profile?.displayName ?? "");
    setBio(profile?.bio ?? "");
    setXHandle(profile?.xHandle ?? null);
    setConnectingX(false);
    setAvatarUrl(profile?.avatarUrl ?? null);
    setBannerUrl(profile?.bannerUrl ?? null);
  }, [open, profile]);

  /**
   * The same fallback the profile itself renders.
   *
   * This modal used to paint a flat `--m-surface-2` banner and a flat
   * `--m-primary` avatar disc, while `ProfileHeader` and the public
   * `IdentityCard` both derive a per-wallet gradient from the address. So a user
   * with no uploads opened Edit and saw a grey box where their profile shows
   * colour — the editor disagreeing with the thing it edits, which reads as the
   * default having been lost.
   *
   * `addressGradient` is the one derivation for this (same hash-to-palette
   * approach as `tokenColor`), so it is imported rather than approximated. Any
   * surface showing a wallet with no avatar goes through it.
   */
  /**
   * A link is VERIFIED only when `xUserId` is set — the callback is the only
   * thing that writes it. Keying off the handle instead would badge every
   * hand-typed string from before OAuth existed as confirmed.
   */
  const xLinked = !!profile?.xUserId;

  /**
   * Disconnect, which the modal had no way to do.
   *
   * Connecting X was one-way: the row could be written and never cleared, so a user who
   * linked the wrong account, or simply changed their mind, had no route back short of
   * deleting the whole profile. `xUserId` going null is what makes the handle unverified
   * again; everything the user authored themselves survives it.
   */
  async function handleUnlinkX() {
    setUnlinkingX(true);
    try {
      const outcome = await unlinkX(address, signMessageAsync);
      if (outcome.ok) {
        setXHandle(null);
        toast.success("X disconnected");
        return;
      }
      // A declined signature is a decision, not a failure — reported as neutral.
      if (outcome.declined) toast.info(outcome.message);
      else toast.error(outcome.message);
    } finally {
      setUnlinkingX(false);
    }
  }

  /**
   * Sign, then hand off to X in a popup.
   *
   * The window is opened FIRST, synchronously, while the click is still the
   * current user gesture — `openXLinkWindow` explains why that ordering is the
   * whole trick. Everything after it may await freely.
   *
   * This used to navigate the tab, which ended the embedded wallet's session
   * (its key is in memory only) and closed this modal, so a successful link
   * looked like being randomly signed out. Keeping the opener alive is the fix:
   * the wallet stays connected and this component is still mounted to show what
   * happened.
   */
  async function handleConnectX() {
    const popup = openXLinkWindow();
    xPopup.current = popup;
    setConnectingX(true);
    try {
      const returnTo = popup.blocked
        ? // No opener to report back to, so the completion page needs to know
          // where to put the user afterwards.
          `${X_LINK_RETURN_PATH}?to=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`
        : X_LINK_RETURN_PATH;

      const { authorizeUrl } = await startXLink({ address, returnTo, signMessageAsync });

      if (popup.blocked) {
        window.location.href = authorizeUrl;
        // Deliberately not clearing the flag: the page is navigating away, and
        // resetting the button to "Connect" would flash it enabled mid-unload.
        return;
      }
      popup.navigate(authorizeUrl);
    } catch (err) {
      // Close the window we opened. A signature the user rejected leaves an
      // orphaned "Connecting to X…" popup otherwise, which they then have to
      // clean up themselves.
      popup.close();
      xPopup.current = null;
      setConnectingX(false);
      if (!isSignatureRejection(err)) {
        toast.error(err instanceof Error ? err.message : "Couldn't start X sign-in");
      }
    }
  }

  /**
   * The popup's answer.
   *
   * Mounted only while a link is in flight, so the app is not holding a
   * `message` listener open for the whole session. `parseXLinkMessage` does the
   * origin check — see its note on why an unchecked listener here is exploitable.
   *
   * On success the profile is RE-FETCHED rather than patched from the message:
   * the callback writes the handle, the numeric id and the copied avatar, and
   * only the server knows what it actually stored. `onSaved` then pushes it to
   * the page behind the modal, so the header updates too.
   */
  useEffect(() => {
    if (!connectingX) return;
    async function onMessage(event: MessageEvent) {
      const outcome = parseXLinkMessage(event);
      if (!outcome) return;
      xPopup.current = null;
      setConnectingX(false);
      if (!outcome.ok) {
        toast.error(xFailureMessage(outcome.reason));
        return;
      }
      try {
        const fresh = await fetchProfile(networkName, address);
        setXHandle(fresh.xHandle ?? null);
        onSaved(fresh);
        toast.success("X account connected");
      } catch {
        // The link itself succeeded — only the read-back failed. Saying
        // otherwise would send the user round the OAuth loop a second time for
        // something already written.
        toast.success("X account connected. Refresh to see it.");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [connectingX, networkName, address, onSaved]);

  /**
   * Give up when the popup goes away without answering.
   *
   * The handshake's only success signal is a `message` from the popup, and there
   * are several ordinary ways never to get one: the user closes the window,
   * dismisses X's consent screen, or the popup finishes on an origin the opener
   * does not share — `postMessage` targets the popup's own origin, so a
   * mismatch means the browser silently refuses to deliver it and BOTH sides
   * believe they did their part.
   *
   * Reported as "after connecting X, it just stays like this — Opening X…": the
   * button disabled forever, with no way back except closing the modal and
   * losing the unsaved bio and display name typed above it.
   *
   * Polling `popup.closed` is the only way to observe this. There is no event
   * for a window someone else closed, and `unload` on a cross-origin popup is
   * not readable. 500ms is imperceptible against a human closing a window.
   *
   * The timeout is the backstop for the case polling CANNOT see: a popup left
   * open on a page that will never post back. Ten minutes is longer than any
   * real consent flow and short enough that nobody sits with a dead button.
   */
  useEffect(() => {
    if (!connectingX) return;
    const popup = xPopup.current;

    const giveUp = (message: string) => {
      xPopup.current = null;
      setConnectingX(false);
      toast.error(message);
    };

    // The blocked-popup path navigates the whole tab and never reaches here, so
    // a null or blocked handle means there is nothing to watch.
    /*
     * A CLOSED popup is a question, not an answer.
     *
     * Reported as this firing over and over on a sign-in that was going fine.
     * `window.closed` is not the reliable signal this code assumed: a popup
     * whose document sets `Cross-Origin-Opener-Policy` severs the opener
     * relationship, and the handle the opener still holds then reports
     * `closed === true` immediately — while the real window is open in front of
     * the user, working. The same severing is why the `postMessage` never
     * arrives, so both halves of the handshake fail together and the failure
     * looks like the user closed the window.
     *
     * So the close is treated as a prompt to ASK THE SERVER. The callback
     * writes the handle server-side before the popup ever closes, which makes
     * the profile the one account of what happened that does not depend on two
     * browsing contexts still being able to see each other. Only a profile that
     * comes back with no X handle is reported as an abandoned sign-in.
     */
    const settle = async () => {
      try {
        const fresh = await fetchProfile(networkName, address);
        if (fresh.xHandle) {
          xPopup.current = null;
          setConnectingX(false);
          setXHandle(fresh.xHandle);
          onSaved(fresh);
          toast.success("X account connected");
          return;
        }
      } catch {
        // Unreachable profile: fall through and report the close. Claiming a
        // link that may not exist is the worse of the two wrong answers.
      }
      giveUp("X sign-in was closed before it finished.");
    };

    const poll = popup && !popup.blocked
      ? window.setInterval(() => {
          if (!popup.closed) return;
          window.clearInterval(poll);
          void settle();
        }, 500)
      : undefined;

    const timeout = window.setTimeout(
      () => giveUp("X sign-in timed out. Try again."),
      10 * 60 * 1000,
    );

    return () => {
      if (poll !== undefined) window.clearInterval(poll);
      window.clearTimeout(timeout);
    };
  }, [connectingX, networkName, address, onSaved]);

  /**
   * The same outcome, arriving the other way.
   *
   * When the popup is blocked the handshake navigates the tab, and the answer
   * comes back as `?x=linked` / `?x=failed` on the URL instead of a message.
   * Before this existed nothing read those parameters at all — the user landed
   * back on the page with a query string and no indication either way.
   *
   * It lives here rather than in the two parents (`ProfileHeader` on /portfolio
   * and `IdentityCard` on /profile/[address]) because both render this modal
   * whenever the viewer is the owner — `open` controls visibility, not mounting
   * — so one effect covers both surfaces without either having to know the flow
   * exists. It deliberately does NOT depend on `open`: the tab reloaded, so the
   * modal is closed at this point.
   *
   * The one case it cannot cover: both parents gate on `isSelf`, which needs a
   * connected wallet. On the fallback path an EMBEDDED wallet is exactly what
   * the navigation destroyed, so there is no owner, this never mounts, and the
   * link lands silently. That is the old bug in its last corner — reachable
   * only by a passkey user whose browser also blocked the popup. Fixing it
   * properly means the parents reading `?x=` before they know who the viewer
   * is, which is a bigger change than the corner deserves; the popup path is
   * what almost everyone gets.
   */
  const handledReturn = useRef(false);
  useEffect(() => {
    if (handledReturn.current) return;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("x");
    if (outcome !== "linked" && outcome !== "failed") return;
    handledReturn.current = true;

    // Strip the parameters before doing anything async, so a refresh — or the
    // back button — cannot replay the toast.
    const reason = params.get("reason");
    params.delete("x");
    params.delete("reason");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );

    if (outcome === "failed") {
      toast.error(xFailureMessage(reason));
      return;
    }
    fetchProfile(networkName, address)
      .then((fresh) => {
        setXHandle(fresh.xHandle ?? null);
        onSaved(fresh);
        toast.success("X account connected");
      })
      .catch(() => toast.success("X account connected. Refresh to see it."));
  }, [networkName, address, onSaved]);

  const gradient = addressGradient(address);
  const gradientCss = `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`;

  async function handleImagePick(kind: "avatar" | "banner", e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(kind);
    try {
      const url = await uploadProfileImage(networkName, address, kind, file, signMessageAsync);
      if (kind === "avatar") setAvatarUrl(url);
      else setBannerUrl(url);
    } catch (err) {
      if (!isSignatureRejection(err)) {
        toast.error(err instanceof Error ? err.message : `Couldn't upload ${kind}`);
      }
    } finally {
      setUploading(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await saveProfile(
        networkName,
        address,
        {
          username: username.trim() || null,
          displayName: displayName.trim() || null,
          bio: bio.trim() || null,
          xHandle,
        },
        signMessageAsync,
      );
      onSaved({ ...saved, avatarUrl, bannerUrl });
      toast.success("Profile saved");
      onOpenChange(false);
    } catch (err) {
      if (!isSignatureRejection(err)) {
        toast.error(err instanceof Error ? err.message : "Couldn't save profile");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Close className="absolute -top-14 right-0 flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--m-border)] bg-[color:var(--m-surface-deep)] text-[color:var(--m-text-primary)] transition-colors hover:bg-[color:var(--m-surface)]">
            <CloseIcon className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          <DialogPrimitive.Title className="sr-only">Edit profile</DialogPrimitive.Title>

          <div className="max-h-[85vh] overflow-y-auto rounded-3xl border border-[color:var(--m-border)] bg-[color:var(--m-surface-deep)] pb-5">
            {/* banner */}
            <div
              className="relative h-[130px] w-full rounded-t-3xl"
              style={{ backgroundImage: gradientCss }}
            >
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                className="hidden"
                onChange={(e) => void handleImagePick("banner", e)}
              />
              {bannerUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bannerUrl} alt="" className="h-full w-full rounded-t-3xl object-cover" />
              )}
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                disabled={uploading === "banner"}
                className="absolute right-3 bottom-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--m-surface)] text-[color:var(--m-text-primary)] transition-colors hover:bg-[color:var(--m-border)] disabled:opacity-50"
              >
                <Pencil className="h-4 w-4" />
                <span className="sr-only">Edit cover image</span>
              </button>

              {/* avatar */}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                className="hidden"
                onChange={(e) => void handleImagePick("avatar", e)}
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploading === "avatar"}
                className="absolute -bottom-10 left-5 h-[100px] w-[100px] overflow-hidden rounded-full border-4 border-[color:var(--m-surface-deep)] transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundImage: gradientCss }}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[28px] font-semibold text-[color:var(--m-text-on-media)]">
                    {(displayName || username || address).slice(displayName || username ? 0 : 2, (displayName || username ? 0 : 2) + 1).toUpperCase()}
                  </span>
                )}
              </button>
            </div>

            <div className="mt-12 space-y-3 px-5">
              <LabeledField
                label="Username"
                value={username}
                onChange={setUsername}
                placeholder="username"
                maxLength={USERNAME_MAX}
                prefix="@"
              />
              <LabeledField
                label="Display name"
                value={displayName}
                onChange={setDisplayName}
                placeholder="Display name"
                maxLength={DISPLAY_NAME_MAX}
              />

              <div className="rounded-2xl bg-[color:var(--m-surface-2)] px-4 py-3">
                <span className="block text-[13px] text-[color:var(--m-text-secondary)]">Bio</span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                  placeholder="Add a bio"
                  rows={3}
                  className="mt-1 w-full resize-none bg-transparent text-[16px] font-medium text-[color:var(--m-text-primary)] outline-none placeholder:text-[color:var(--m-text-secondary)] placeholder:font-normal"
                />
                <div className="mt-1 text-right text-[12px] text-[color:var(--m-text-secondary)]">
                  {bio.length}/{BIO_MAX}
                </div>
              </div>

              {/* Real OAuth, not a text field.
                  This used to be an input you typed a handle into — self-
                  reported, unverifiable, and the reason `admin.profiles.xHandle`
                  still carries rows nothing confirmed. `xUserId` is what makes a
                  link real, and only the callback writes it, so a verified badge
                  keys off that rather than off the handle's presence. */}
              {xLinked ? (
                <div className="flex items-center gap-2 rounded-2xl bg-[color:var(--m-surface-2)] px-4 py-3">
                  <XLogo className="h-4 w-4 shrink-0 text-[color:var(--m-text-primary)]" />
                  <span className="flex-1 text-[15px] font-medium text-[color:var(--m-text-primary)]">
                    @{xHandle}
                  </span>
                  <span className="rounded-[5px] border border-[color:var(--m-border)] bg-[color:var(--m-surface)] px-1.5 py-0.5 font-mono text-[9.5px] text-[color:var(--m-primary)]">
                    verified
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleUnlinkX()}
                    disabled={unlinkingX}
                    className="shrink-0 rounded-[5px] px-1.5 py-0.5 text-[12px] font-medium text-[color:var(--m-text-secondary)] transition-colors hover:text-[color:var(--m-error)] disabled:opacity-60"
                  >
                    {unlinkingX ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleConnectX()}
                  disabled={connectingX}
                  className="flex w-full items-center gap-2 rounded-2xl bg-[color:var(--m-surface-2)] px-4 py-3 text-left text-[color:var(--m-primary)] disabled:opacity-60"
                >
                  <XLogo className="h-4 w-4 shrink-0" />
                  <span className="text-[15px] font-medium">
                    {connectingX ? "Opening X…" : "Connect X account"}
                  </span>
                </button>
              )}

              {/* An unverified handle from before OAuth existed. Shown, because
                  it is what the profile still displays, but never as confirmed —
                  and connecting above replaces it with the real thing. */}
              {!xLinked && xHandle && (
                <p className="px-1 text-[12px] text-[color:var(--m-text-secondary)]">
                  Currently showing <b>@{xHandle}</b>, which you typed in. Connect to verify it.
                </p>
              )}

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || uploading !== null}
                className="w-full rounded-2xl bg-[color:var(--m-primary)] py-3.5 text-[16px] font-semibold text-[color:var(--m-on-primary)] transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
