"use client";

import { MotionConfig } from "framer-motion";

/** Respeta "reducir movimiento" del sistema en todas las animaciones. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
