"use client";

import { motion } from "framer-motion";

const WAVEFORM_BARS = [0, 1, 2, 3, 4];

/** A real short clip of the interviewer (public/interviewer-loop.mp4, muted,
 * looping continuously) standing in for a live video call — the actual
 * question audio comes from window.speechSynthesis (see
 * VideoInterviewRunner's speak()), not from this clip's own (stripped)
 * audio track, so it plays regardless of which question is current. The
 * accent ring + waveform only appear while a question is actually being
 * spoken, giving the loop a "talking now" cue without real lip-sync. */
export function AIInterviewerVideo({ speaking }: { speaking: boolean }) {
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-[var(--radius-md)] bg-black ring-2 transition-colors duration-300 ${
        speaking ? "ring-accent" : "ring-transparent"
      }`}
    >
      <video
        src="/interviewer-loop.mp4"
        poster="/interviewer-loop-poster.jpg"
        autoPlay
        loop
        muted
        playsInline
        className="h-full w-full object-cover"
      />
      {speaking && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-end gap-0.5 rounded-full bg-black/45 px-2.5 py-1.5 backdrop-blur-sm">
          {WAVEFORM_BARS.map((i) => (
            <motion.span
              key={i}
              className="w-1 rounded-full bg-white"
              animate={{ height: [4, 13, 6, 16, 4] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
