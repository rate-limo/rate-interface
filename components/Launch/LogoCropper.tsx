"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  clampBox,
  initialBox,
  moveBox,
  resizeFromCorner,
  scaleBox,
  type Corner,
  type CropBox,
} from "@/lib/launch/cropBox";

const OUTPUT_SIZE = 512;
const MAX_BYTES = 1024 * 1024;
const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];

async function croppedFile(file: File, box: CropBox): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const { x, y, side } = clampBox(box, bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the image.");
  context.drawImage(bitmap, x, y, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  bitmap.close();

  let quality = 0.9;
  let blob: Blob | null = null;
  do {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    quality -= 0.1;
  } while (blob && blob.size > MAX_BYTES && quality >= 0.4);
  if (!blob || blob.size > MAX_BYTES) throw new Error("The cropped image could not be reduced below 1 MB.");
  const stem = file.name.replace(/\.[^.]+$/, "") || "token-logo";
  return new File([blob], `${stem}-cropped.webp`, { type: "image/webp" });
}

type Gesture =
  | { kind: "move"; startX: number; startY: number; box: CropBox }
  | { kind: "resize"; corner: Corner; box: CropBox }
  | { kind: "pinch"; distance: number; box: CropBox };

/**
 * The whole image, with the square that will be kept drawn on top: drag inside
 * it to move, pull a corner to resize, pinch or scroll to scale. Arrow keys
 * move it and + / − resize it when it has focus. Everything outside is dimmed.
 *
 * Rendered through a portal: inside the launch flow it sat in a stacking context
 * below the phone's tab bar, which drew over the dialog's buttons.
 */
export function LogoCropper({
  file,
  onCancel,
  onApply,
}: {
  file: File;
  onCancel: () => void;
  onApply: (file: File) => void;
}) {
  const [source, setSource] = useState("");
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<CropBox | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const live = useRef({ box, natural });
  useLayoutEffect(() => {
    live.current = { box, natural };
  });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const nextSource = URL.createObjectURL(file);
    setSource(nextSource);
    return () => URL.revokeObjectURL(nextSource);
  }, [file]);

  // Wheel scaling needs a NON-passive listener: React's onWheel is passive, so
  // it cannot stop the page behind the dialog from scrolling.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      const { box: b, natural: n } = live.current;
      if (!b || !n) return;
      event.preventDefault();
      setBox(scaleBox(b, Math.exp(event.deltaY * 0.0015), n.w, n.h));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [mounted, source]);

  /** Client pixels → source pixels. The image is drawn scaled to fit the stage. */
  const toSource = (clientX: number, clientY: number) => {
    const rect = stageRef.current!.getBoundingClientRect();
    const n = live.current.natural!;
    return { x: ((clientX - rect.left) / rect.width) * n.w, y: ((clientY - rect.top) / rect.height) * n.h };
  };

  const begin = (event: React.PointerEvent, kind: "move" | Corner) => {
    const { box: b } = live.current;
    if (!b) return;
    event.stopPropagation();
    stageRef.current?.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) {
      const [p, q] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", distance: Math.hypot(p.x - q.x, p.y - q.y), box: b };
      return;
    }
    const at = toSource(event.clientX, event.clientY);
    gesture.current =
      kind === "move" ? { kind: "move", startX: at.x, startY: at.y, box: b } : { kind: "resize", corner: kind, box: b };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    const n = live.current.natural;
    if (!g || !n) return;
    if (g.kind === "pinch") {
      const [p, q] = [...pointers.current.values()];
      if (!q || g.distance <= 0) return;
      setBox(scaleBox(g.box, g.distance / Math.hypot(p.x - q.x, p.y - q.y), n.w, n.h));
      return;
    }
    const at = toSource(event.clientX, event.clientY);
    setBox(
      g.kind === "move"
        ? moveBox(g.box, at.x - g.startX, at.y - g.startY, n.w, n.h)
        : resizeFromCorner(g.box, g.corner, at.x, at.y, n.w, n.h),
    );
  };

  const onPointerEnd = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
    else if (gesture.current?.kind === "pinch" && live.current.box) {
      // One finger left after a pinch: carry on as a move from where it is.
      const [p] = [...pointers.current.values()];
      const at = toSource(p.x, p.y);
      gesture.current = { kind: "move", startX: at.x, startY: at.y, box: live.current.box };
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const { box: b, natural: n } = live.current;
    if (!b || !n) return;
    const step = (Math.min(n.w, n.h) / 50) * (event.shiftKey ? 5 : 1);
    const next =
      event.key === "ArrowLeft" ? moveBox(b, -step, 0, n.w, n.h)
      : event.key === "ArrowRight" ? moveBox(b, step, 0, n.w, n.h)
      : event.key === "ArrowUp" ? moveBox(b, 0, -step, n.w, n.h)
      : event.key === "ArrowDown" ? moveBox(b, 0, step, n.w, n.h)
      : event.key === "+" || event.key === "=" ? scaleBox(b, 1.1, n.w, n.h)
      : event.key === "-" || event.key === "_" ? scaleBox(b, 1 / 1.1, n.w, n.h)
      : null;
    if (!next) return;
    event.preventDefault();
    setBox(next);
  };

  const apply = async () => {
    if (!box) return;
    setWorking(true);
    setError(null);
    try {
      onApply(await croppedFile(file, box));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The image could not be cropped.");
      setWorking(false);
    }
  };

  // Literal colours, not Tailwind's white/black: the theme maps \`white\` to the
  // primary TEXT colour, which is near-black in light mode, so the frame and its
  // grid vanished on a dark photo. These marks sit on the photo, not the theme.
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  const dialog = (
    <div className="fixed inset-0 z-[200] grid place-items-center overflow-y-auto bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="crop-title">
      <div className="w-full max-w-[520px] rounded-[18px] border border-[var(--m-border)] bg-[var(--m-surface)] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="crop-title" className="text-[17px] font-semibold text-[var(--m-text-primary)]">Crop token image</h3>
            <p className="mt-1 text-[12px] text-[var(--m-text-secondary)]">Drag the square to move it · pull a corner to resize. Saved as a 512px WebP under 1 MB.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close crop editor" className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--m-border)] text-[var(--m-text-secondary)]">×</button>
        </div>

        <div className="mt-5 grid place-items-center rounded-xl bg-[var(--m-surface-2)] p-5">
          <div
            ref={stageRef}
            data-testid="logo-crop-stage"
            className="relative touch-none select-none"
            // A second finger can land outside the square and still pinch.
            onPointerDown={(event) => {
              if (pointers.current.size > 0) begin(event, "move");
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            {source && (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
              <img
                src={source}
                alt="Image to crop"
                draggable={false}
                onLoad={(event) => {
                  const n = { w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight };
                  setNatural(n);
                  setBox(initialBox(n.w, n.h));
                }}
                className="block max-h-[min(56vh,420px)] max-w-full"
              />
            )}
            {natural && box && (
              // Four panels dim everything outside the square. Not a clipped
              // box-shadow: the stage must NOT clip, or the corner handles of a
              // square touching the image edge are cut in half.
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-x-0 top-0 bg-[rgba(0,0,0,.55)]" style={{ height: pct(box.y, natural.h) }} />
                <div className="absolute inset-x-0 bottom-0 bg-[rgba(0,0,0,.55)]" style={{ height: pct(natural.h - box.y - box.side, natural.h) }} />
                <div className="absolute left-0 bg-[rgba(0,0,0,.55)]" style={{ top: pct(box.y, natural.h), height: pct(box.side, natural.h), width: pct(box.x, natural.w) }} />
                <div className="absolute right-0 bg-[rgba(0,0,0,.55)]" style={{ top: pct(box.y, natural.h), height: pct(box.side, natural.h), width: pct(natural.w - box.x - box.side, natural.w) }} />
              </div>
            )}
            {natural && box && (
              <div
                data-testid="logo-crop-box"
                role="group"
                tabIndex={0}
                aria-label="Crop area. Arrow keys move it; plus and minus resize it."
                onKeyDown={onKeyDown}
                onPointerDown={(event) => begin(event, "move")}
                className="absolute cursor-move outline-none ring-[var(--m-primary)] focus-visible:ring-2"
                style={{
                  left: pct(box.x, natural.w),
                  top: pct(box.y, natural.h),
                  width: pct(box.side, natural.w),
                  height: pct(box.side, natural.h),
                }}
              >
                <div className="pointer-events-none absolute inset-0 border-2 border-[rgba(255,255,255,.92)]" />
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40 [&>*]:border-[rgba(255,255,255,.7)]">
                  {Array.from({ length: 9 }).map((_, index) => <span key={index} className="border-r border-b" />)}
                </div>
                {CORNERS.map((corner) => (
                  <span
                    key={corner}
                    data-testid={`logo-crop-${corner}`}
                    onPointerDown={(event) => begin(event, corner)}
                    className={`absolute grid size-7 place-items-center ${
                      { nw: "-left-3.5 -top-3.5 cursor-nwse-resize", ne: "-right-3.5 -top-3.5 cursor-nesw-resize", sw: "-bottom-3.5 -left-3.5 cursor-nesw-resize", se: "-bottom-3.5 -right-3.5 cursor-nwse-resize" }[corner]
                    }`}
                  >
                    <span className="size-3.5 rounded-[3px] border-2 border-[#fff] bg-[var(--m-primary)] shadow" />
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && <p className="mt-3 text-[12px] text-[var(--m-error)]">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl border border-[var(--m-border)] py-3 text-[13px] font-medium text-[var(--m-text-primary)]">Cancel</button>
          <button type="button" disabled={working || !box} onClick={apply} className="rounded-xl bg-[var(--m-primary)] py-3 text-[13px] font-medium text-[var(--m-on-primary)] disabled:opacity-50">{working ? "Preparing…" : "Use cropped image"}</button>
        </div>
      </div>
    </div>
  );

  return mounted ? createPortal(dialog, document.body) : null;
}
