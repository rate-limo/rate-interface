"use client";

import { useEffect, useRef, useState } from "react";

const OUTPUT_SIZE = 512;
const MAX_BYTES = 1024 * 1024;

async function croppedFile(
  file: File,
  zoom: number,
  focusX: number,
  focusY: number,
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height) / zoom;
  const sx = (bitmap.width - side) * focusX;
  const sy = (bitmap.height - side) * focusY;
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the image.");
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
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
  const [zoom, setZoom] = useState(1);
  const [focusX, setFocusX] = useState(0.5);
  const [focusY, setFocusY] = useState(0.5);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const nextSource = URL.createObjectURL(file);
    setSource(nextSource);
    return () => URL.revokeObjectURL(nextSource);
  }, [file]);

  const apply = async () => {
    setWorking(true);
    setError(null);
    try {
      onApply(await croppedFile(file, zoom, focusX, focusY));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The image could not be cropped.");
      setWorking(false);
    }
  };

  const moveCrop = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - drag.x) / Math.max(rect.width, 1);
    const dy = (event.clientY - drag.y) / Math.max(rect.height, 1);
    dragRef.current = { pointerId: drag.pointerId, x: event.clientX, y: event.clientY };
    setFocusX((current) => clamp(current - dx / Math.max(zoom, 1), 0, 1));
    setFocusY((current) => clamp(current - dy / Math.max(zoom, 1), 0, 1));
  };

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="crop-title">
      <div className="w-full max-w-[480px] rounded-[18px] border border-[var(--m-border)] bg-[var(--m-surface)] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="crop-title" className="text-[17px] font-semibold text-[var(--m-text-primary)]">Crop token image</h3>
            <p className="mt-1 text-[12px] text-[var(--m-text-secondary)]">Position a square crop. Iter exports a 512px WebP under 1 MB.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close crop editor" className="grid size-8 place-items-center rounded-lg border border-[var(--m-border)] text-[var(--m-text-secondary)]">×</button>
        </div>

        <div
          className="relative mx-auto mt-5 aspect-square w-full max-w-[340px] cursor-grab touch-none overflow-hidden bg-[var(--m-surface-2)] active:cursor-grabbing"
          onPointerDown={(event) => {
            dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={moveCrop}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
          {source && (
            <img
              src={source}
              alt="Crop preview"
              className="h-full w-full object-cover"
              style={{ objectPosition: `${focusX * 100}% ${focusY * 100}%`, transform: `scale(${zoom})` }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 border-2 border-white/80 shadow-[inset_0_0_0_1px_rgba(0,0,0,.2)]" />
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-35 [&>*]:border-white/70">
            {Array.from({ length: 9 }).map((_, index) => <span key={index} className="border-r border-b last:border-r-0" />)}
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <CropRange label="Zoom" value={zoom} min={1} max={3} step={0.01} onChange={setZoom} />
          <CropRange label="Horizontal position" value={focusX} min={0} max={1} step={0.01} onChange={setFocusX} />
          <CropRange label="Vertical position" value={focusY} min={0} max={1} step={0.01} onChange={setFocusY} />
        </div>
        {error && <p className="mt-3 text-[12px] text-[var(--m-error)]">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl border border-[var(--m-border)] py-3 text-[13px] font-medium text-[var(--m-text-primary)]">Cancel</button>
          <button type="button" disabled={working} onClick={apply} className="rounded-xl bg-[var(--m-primary)] py-3 text-[13px] font-medium text-[var(--m-on-primary)] disabled:opacity-50">{working ? "Preparing…" : "Use cropped image"}</button>
        </div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function CropRange({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="grid grid-cols-[128px_1fr] items-center gap-3 text-[11.5px] text-[var(--m-text-secondary)]">
      <span>{label}</span>
      <input type="range" aria-label={label} value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-[var(--m-primary)]" />
    </label>
  );
}
