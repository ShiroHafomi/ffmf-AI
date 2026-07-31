"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  duration?: number; // ms, default 600
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Animates a number from its previous value to the new value
 * with a smooth step-by-step transition. Uses requestAnimationFrame
 * for 60fps performance and respects prefers-reduced-motion.
 */
export function AnimatedNumber({
  value,
  duration = 600,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const raf = useRef<number | null>(null);
  const prevValue = useRef(value);

  useEffect(() => {
    const start = prevValue.current;
    const end = value;
    prevValue.current = value;

    // Skip animation if user prefers reduced motion or values are the same
    const prefersReduced = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;

    if (start === end || prefersReduced) {
      setDisplay(end);
      return;
    }

    const startTime = performance.now();
    const delta = end - start;

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3); // cubic ease-out

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOut(progress);
      setDisplay(start + delta * eased);

      if (progress < 1) {
        raf.current = requestAnimationFrame(step);
      }
    }

    raf.current = requestAnimationFrame(step);

    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  return (
    <span className={className} aria-label={`${prefix}${value}${suffix}`}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}