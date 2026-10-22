import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";

/** Dois universos lado a lado, com uma região compartilhada. */
export const ParallelUniverseIcon = forwardRef<SVGSVGElement, LucideProps>(function ParallelUniverseIcon(
  { size = 24, color = "currentColor", strokeWidth = 2, absoluteStrokeWidth, children, ...props }, ref,
) {
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="9" cy="12" r="7" />
      <circle cx="15" cy="12" r="7" />
      {children}
    </svg>
  );
});
