"use client";

import React, { useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  side?: "right" | "bottom" | "top" | "left";
}

export function Tooltip({ content, children, side = "right" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeout = useRef<NodeJS.Timeout>(undefined);

  const show = () => {
    timeout.current = setTimeout(() => setVisible(true), 400);
  };
  const hide = () => {
    clearTimeout(timeout.current);
    setVisible(false);
  };

  const positionClasses = {
    right: "left-full ml-2 top-1/2 -translate-y-1/2",
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
  };

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div
          className={cn(
            "absolute z-50 px-2 py-1 text-xs font-medium text-white bg-zinc-800 rounded-md shadow-lg whitespace-nowrap pointer-events-none",
            "animate-in fade-in-0 zoom-in-95 duration-150",
            positionClasses[side]
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
