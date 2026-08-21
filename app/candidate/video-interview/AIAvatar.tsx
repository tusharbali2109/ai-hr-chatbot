"use client";

import { motion } from "framer-motion";

export type AIAvatarState = "idle" | "speaking" | "listening";

const WAVEFORM_BARS = [0, 1, 2, 3, 4];

/** A stylized, animated AI-interviewer avatar — not a photorealistic video
 * avatar (that needs a paid third-party talking-head service), but reads
 * as visibly "alive": breathing when idle, an animated mouth + outward
 * pulse rings + a small voice-waveform while the question is being spoken
 * (window.speechSynthesis, see VideoInterviewRunner), and a slow blink
 * while listening for the candidate's answer. */
export function AIAvatar({ state }: { state: AIAvatarState }) {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center sm:h-32 sm:w-32">
      {state === "speaking" && (
        <>
          <motion.span
            className="absolute inset-0 rounded-full bg-accent/20"
            animate={{ scale: [1, 1.35, 1], opacity: [0.55, 0, 0.55] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.span
            className="absolute inset-0 rounded-full bg-accent/10"
            animate={{ scale: [1, 1.65, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
          />
        </>
      )}

      <motion.div
        className="relative z-10 flex h-15 w-15 items-center justify-center rounded-full bg-accent shadow-lg sm:h-20 sm:w-20"
        animate={state === "idle" ? { scale: [1, 1.035, 1] } : { scale: 1 }}
        transition={state === "idle" ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
      >
        <svg viewBox="0 0 64 64" className="h-8 w-8 sm:h-11 sm:w-11" aria-hidden="true">
          <motion.circle
            cx="24"
            cy="27"
            r="3.4"
            fill="white"
            style={{ transformOrigin: "24px 27px" }}
            animate={state === "listening" ? { scaleY: [1, 1, 0.15, 1, 1] } : { scaleY: 1 }}
            transition={state === "listening" ? { duration: 3.2, repeat: Infinity, times: [0, 0.85, 0.9, 0.95, 1] } : { duration: 0.2 }}
          />
          <motion.circle
            cx="40"
            cy="27"
            r="3.4"
            fill="white"
            style={{ transformOrigin: "40px 27px" }}
            animate={state === "listening" ? { scaleY: [1, 1, 0.15, 1, 1] } : { scaleY: 1 }}
            transition={state === "listening" ? { duration: 3.2, repeat: Infinity, times: [0, 0.85, 0.9, 0.95, 1], delay: 0.06 } : { duration: 0.2 }}
          />
          <motion.path
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            animate={
              state === "speaking"
                ? { d: ["M22 41 Q32 44 42 41", "M22 40 Q32 50 42 40", "M22 41 Q32 43 42 41", "M22 40 Q32 48 42 40", "M22 41 Q32 44 42 41"] }
                : { d: "M22 41 Q32 45 42 41" }
            }
            transition={state === "speaking" ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
          />
        </svg>
      </motion.div>

      {state === "speaking" && (
        <div className="absolute -bottom-2 flex items-end gap-0.5" aria-hidden="true">
          {WAVEFORM_BARS.map((i) => (
            <motion.span
              key={i}
              className="w-1 rounded-full bg-accent"
              animate={{ height: [4, 13, 6, 16, 4] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
