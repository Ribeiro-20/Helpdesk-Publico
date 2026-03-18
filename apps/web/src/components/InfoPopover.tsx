"use client";

import { Info } from "lucide-react";

type InfoPopoverProps = {
  text: string;
  ariaLabel?: string;
  placement?: "side" | "bottom";
  side?: "left" | "right";
};

export default function InfoPopover({
  text,
  ariaLabel = "Informacao",
  placement = "side",
  side = "right",
}: InfoPopoverProps) {
  const tooltipPositionClass =
    placement === "bottom"
      ? "left-1/2 top-[calc(100%+8px)] -translate-x-1/2"
      : side === "left"
        ? "right-[calc(100%+8px)] top-1/2 -translate-y-1/2"
        : "left-[calc(100%+8px)] top-1/2 -translate-y-1/2";

  const arrowPositionClass =
    placement === "bottom"
      ? "left-1/2 -top-1 -translate-x-1/2 border-l border-t"
      : side === "left"
        ? "-right-1 top-1/2 -translate-y-1/2 border-r border-t"
        : "-left-1 top-1/2 -translate-y-1/2 border-l border-b";

  return (
    <div className="relative inline-flex group">
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
        aria-label={ariaLabel}
      >
        <Info className="w-3 h-3" />
      </button>

      <div
        role="tooltip"
        aria-label={ariaLabel}
        className={`pointer-events-none absolute z-50 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl ring-1 ring-black/5 opacity-0 invisible transition-opacity duration-150 group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible ${tooltipPositionClass}`}
      >
        <span
          className={`absolute h-2 w-2 rotate-45 bg-white border-gray-200 ${arrowPositionClass}`}
        />
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
          Informacao
        </p>
        <p className="text-xs leading-5 text-gray-700">{text}</p>
      </div>
    </div>
  );
}