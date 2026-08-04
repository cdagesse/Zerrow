"use client";

import { useState } from "react";
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TooltipProps {
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
  children: React.ReactElement<any>;
  content?: string;
  contentComponent?: React.ReactNode;
  hide?: boolean;
  side?: "top" | "right" | "bottom" | "left";
}

export const Tooltip = ({
  children,
  content,
  contentComponent,
  hide,
  side,
}: TooltipProps) => {
  // Make tooltip work on mobile with a click
  const [isOpen, setIsOpen] = useState(false);

  if (hide) return children;

  return (
    <TooltipProvider delayDuration={200}>
      <ShadcnTooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger
          asChild
          onClick={(event) => {
            // Touch has no hover, so a tap toggles the tooltip. With a
            // mouse, a click must close it (Radix already closes its own
            // state on click) — toggling here instead desyncs the
            // controlled state and leaves the tooltip stuck open over
            // neighboring elements.
            //
            // Which branch applies is a property of the pointer that fired
            // this click, not of the device: a hybrid laptop reports hover
            // for its mouse while the user is tapping the screen. `click` is
            // a PointerEvent everywhere current; older browsers send a plain
            // MouseEvent, and keyboard activation reports no pointer at all,
            // so both fall back to the device query.
            const pointerType =
              "pointerType" in event.nativeEvent
                ? (event.nativeEvent as PointerEvent).pointerType
                : "";
            const isTouch = pointerType
              ? pointerType !== "mouse"
              : window.matchMedia("(hover: none)").matches;

            if (isTouch) {
              setIsOpen(!isOpen);
            } else {
              setIsOpen(false);
            }
          }}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent side={side}>
          {contentComponent || <p className="max-w-xs">{content}</p>}
        </TooltipContent>
      </ShadcnTooltip>
    </TooltipProvider>
  );
};
