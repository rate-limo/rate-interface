"use client";

import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The card chrome around one workspace panel: the surface, border and a
 * title bar that doubles as the drag handle. The body fills whatever box
 * MovableGrid positions the card in; content scrolls inside it rather than
 * forcing the card taller (`min-h-0` + `overflow` — the flex-child clamp).
 */
export function Panel({
  title,
  children,
  onDragHandleDown,
  dragging = false,
}: {
  title: string;
  children: React.ReactNode;
  /** Pointer-down on the handle starts a drag; wired by MovableGrid. */
  onDragHandleDown?: (e: React.PointerEvent) => void;
  dragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-[16px] border border-neutral-light-white-12 bg-neutral-dark-default",
        dragging && "opacity-70 ring-2 ring-purple-400",
      )}
    >
      <div
        onPointerDown={onDragHandleDown}
        className={cn(
          "flex shrink-0 items-center gap-1.5 border-b border-neutral-light-white-12 px-3 py-2 select-none",
          onDragHandleDown ? "cursor-grab touch-none active:cursor-grabbing" : "",
        )}
      >
        {onDragHandleDown && (
          <GripVertical className="h-3.5 w-3.5 text-dark-grey-1" aria-hidden />
        )}
        <span className="text-[11px] font-medium uppercase tracking-wider text-dark-grey-1">
          {title}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
