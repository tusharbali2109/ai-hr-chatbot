"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Video as VideoIcon, AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  submitCandidateInterviewAnswerAction,
  finalizeCandidateInterviewAction,
  logProctoringWarningAction,
  rejectInterviewForProctoringAction,
} from "@/lib/actions/candidate-interview";
import { startFaceMonitor, type FaceMonitorHandle } from "@/lib/interview/face-monitor";
import { AIAvatar } from "./AIAvatar";

type Phase = "consent" | "requesting_media" | "media_denied" | "speaking" | "listening" | "submitting" | "closing" | "ending" | "rejecting";

const INTERVIEWER_NAME = "Priya";
const MAX_WARNINGS = 3;
const WARNING_COOLDOWN_MS = 8000;

// The Web Speech API has no standard TS lib types — narrow, local shape only.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1.15;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

const PROCTORING_RULES = [
  "Keep your camera and microphone on for the entire interview.",
  "Stay visible and facing the camera — don't leave the frame or let someone else appear with you.",
  "Don't switch to another tab, app, or window during the interview.",
  "Don't paste text into your answers — type your own responses.",
  "You'll get a warning for each violation. After 3 warnings, the interview ends automatically and your application is marked rejected.",
];

export function VideoInterviewRunner({
  interviewId,
  initialQuestion,
  initialQuestionId,
}: {
  interviewId: string;
  initialQuestion: string;
  initialQuestionId: string;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceMonitorRef = useRef<FaceMonitorHandle | null>(null);
  const warningCountRef = useRef(0);
  const lastWarnedAtRef = useRef<Map<string, number>>(new Map());
  const rejectingRef = useRef(false);
  const fullscreenEngagedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("consent");
  const [mediaReady, setMediaReady] = useState(false);
  const [question, setQuestion] = useState(initialQuestion);
  const [questionId, setQuestionId] = useState(initialQuestionId);
  const [transcript, setTranscript] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [warningCount, setWarningCount] = useState(0);
  const [micSupported, setMicSupported] = useState(true);

  const isActivePhase = phase !== "consent" && phase !== "requesting_media" && phase !== "media_denied" && phase !== "rejecting";

  // ---- Central proctoring-violation intake: dedupes rapid repeats of the
  // same reason (a single alt-tab can fire both a blur and a visibility
  // event), counts distinct violations, and auto-rejects at the limit. ----
  const pushWarning = useCallback(
    (reason: string, message: string) => {
      if (rejectingRef.current) return;
      const now = Date.now();
      const last = lastWarnedAtRef.current.get(reason) ?? 0;
      if (now - last < WARNING_COOLDOWN_MS) return;
      lastWarnedAtRef.current.set(reason, now);

      const count = warningCountRef.current + 1;
      warningCountRef.current = count;
      setWarningCount(count);
      void logProctoringWarningAction(interviewId, reason);

      if (count >= MAX_WARNINGS) {
        rejectingRef.current = true;
        setWarning(`${message} That's warning ${count} of ${MAX_WARNINGS} — ending the interview now.`);
        stopListening();
        faceMonitorRef.current?.stop();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        if (typeof window !== "undefined") window.speechSynthesis?.cancel();
        setPhase("rejecting");
        void rejectInterviewForProctoringAction(interviewId, count).finally(() => {
          router.push("/candidate/video-interview/rejected");
        });
      } else {
        setWarning(`${message} (Warning ${count} of ${MAX_WARNINGS} — the interview ends automatically after ${MAX_WARNINGS}.)`);
      }
    },
    [interviewId, router]
  );

  // ---- Camera/mic setup — only requested once the candidate accepts the
  // proctoring terms on the consent screen. ----
  useEffect(() => {
    if (phase !== "requesting_media") return;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setMediaReady(true);
      })
      .catch(() => {
        if (!cancelled) setPhase("media_denied");
      });
    return () => {
      cancelled = true;
    };
  }, [phase]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      faceMonitorRef.current?.stop();
    };
  }, []);

  // ---- Proctoring: tab visibility + window focus (folded into one reason
  // — a single alt-tab away from the interview shouldn't count twice just
  // because both events happen to fire). ----
  useEffect(() => {
    function onLeftWindow() {
      if (!isActivePhase) return;
      pushWarning("left_interview_window", "You left the interview tab or window — please stay on this page.");
    }
    function onVisibilityChange() {
      if (document.hidden) onLeftWindow();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onLeftWindow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onLeftWindow);
    };
  }, [isActivePhase, pushWarning]);

  // ---- Proctoring: fullscreen exit (only warns if fullscreen was actually
  // successfully engaged in the first place — some browsers/contexts block
  // the request entirely, which must not itself count as a violation). ----
  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement && fullscreenEngagedRef.current && isActivePhase) {
        pushWarning("fullscreen_exited", "You exited fullscreen — please stay in fullscreen for the interview.");
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [isActivePhase, pushWarning]);

  // ---- Proctoring: camera/mic track health. ----
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const handlers: Array<() => void> = [];
    stream.getTracks().forEach((track) => {
      const onEnded = () => {
        pushWarning(
          `${track.kind}_track_ended`,
          `Your ${track.kind === "video" ? "camera" : "microphone"} was disconnected — please reconnect it.`
        );
      };
      track.addEventListener("ended", onEnded);
      handlers.push(() => track.removeEventListener("ended", onEnded));
    });
    return () => handlers.forEach((off) => off());
  }, [mediaReady, pushWarning]);

  // ---- Proctoring: face monitor (no face / multiple faces / looking away),
  // running against the candidate's own video element once media is ready. ----
  useEffect(() => {
    if (!mediaReady || !videoRef.current) return;
    const handle = startFaceMonitor(videoRef.current, {
      onViolation: (reason) => {
        const messages: Record<string, string> = {
          no_face_detected: "We couldn't see your face — please make sure you're visible on camera.",
          multiple_faces_detected: "More than one person appears to be in frame — please continue alone.",
          looking_away: "Please keep facing the camera and screen during the interview.",
        };
        pushWarning(reason, messages[reason] ?? "Proctoring violation detected.");
      },
    });
    faceMonitorRef.current = handle;
    return () => handle.stop();
  }, [mediaReady, pushWarning]);

  const startListening = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setMicSupported(false);
      setPhase("listening");
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        finalText += result[0].transcript + " ";
      }
      setTranscript(finalText.trim());
    };
    recognition.onerror = () => {
      // Non-fatal — the candidate can still type/edit before submitting.
    };
    recognitionRef.current = recognition;
    recognition.start();
    setPhase("listening");
  }, []);

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }

  function handleAcceptConsent() {
    if (typeof document !== "undefined" && document.documentElement.requestFullscreen) {
      document.documentElement
        .requestFullscreen()
        .then(() => {
          fullscreenEngagedRef.current = true;
        })
        .catch(() => {
          // Fullscreen denied/unsupported — proctoring continues without it.
        });
    }
    setPhase("requesting_media");
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    pushWarning("paste_blocked", "Pasting text isn't allowed — please type your answer yourself.");
  }

  // ---- Speak the current question aloud, then start listening for the
  // answer. Runs once media is granted and whenever a new question arrives
  // — an effect synchronizing this component with the external Web Speech
  // APIs, not a plain render-derived state update, so it legitimately calls
  // setState from within the effect (via speak()'s promise resolution).
  useEffect(() => {
    if (!mediaReady || !question) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing with the Web Speech API, not deriving render state
    setPhase("speaking");
    void speak(question).then(() => {
      if (!cancelled) startListening();
    });
    return () => {
      cancelled = true;
    };
  }, [mediaReady, question, startListening]);

  async function handleSubmitAnswer() {
    stopListening();
    setPhase("submitting");
    try {
      const result = await submitCandidateInterviewAnswerAction(interviewId, questionId, transcript);
      setTranscript("");
      if (result.done) {
        setPhase("closing");
      } else {
        setQuestion(result.question ?? "");
        setQuestionId(result.questionId ?? "");
        setPhase("speaking");
      }
    } catch {
      setWarning("Something went wrong submitting your answer — please try again.");
      setPhase("listening");
    }
  }

  async function handleEndInterview() {
    setPhase("ending");
    faceMonitorRef.current?.stop();
    try {
      await finalizeCandidateInterviewAction(interviewId);
    } finally {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      router.push("/candidate/video-interview/completed");
    }
  }

  useEffect(() => {
    if (phase === "closing") {
      void speak("Thank you — that covers all the questions. Whenever you're ready, click End Interview to finish.");
    }
  }, [phase]);

  if (phase === "consent") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-6 sm:py-10">
        <div className="w-full max-w-lg rounded-[var(--radius-lg)] border border-border bg-surface p-5 sm:p-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent text-accent-foreground">
              <ShieldAlert className="h-4.5 w-4.5" />
            </span>
            <h1 className="text-base font-semibold text-foreground sm:text-lg">Before you begin</h1>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            This AI video interview with {INTERVIEWER_NAME}, your AI interviewer, is monitored for integrity. Please read and accept the
            following before continuing:
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {PROCTORING_RULES.map((rule, i) => (
              <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning/15 text-[11px] font-semibold text-warning">
                  {i + 1}
                </span>
                {rule}
              </li>
            ))}
          </ul>
          <Button className="mt-6 w-full" onClick={handleAcceptConsent}>
            I understand — start the interview
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "media_denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-danger" />
          <h1 className="mt-3 text-xl font-semibold text-foreground">Camera and microphone required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This interview needs access to your camera and microphone. Please allow access in your browser and reload this page.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "rejecting") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-danger" />
          <p className="mt-3 text-sm text-muted-foreground">Ending the interview…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-5 sm:px-6 sm:py-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 sm:mb-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent text-accent-foreground">
            <VideoIcon className="h-4 w-4" />
          </div>
          <h1 className="text-base font-semibold text-foreground sm:text-lg">AI Video Interview</h1>
        </div>
        {warningCount > 0 && (
          <span className="flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {warningCount} / {MAX_WARNINGS} warnings
          </span>
        )}
      </div>

      {warning && (
        <div className="mb-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-sm leading-snug text-warning sm:items-center sm:px-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" />
          {warning}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        {/* AI interviewer */}
        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 sm:gap-4 sm:p-6">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${phase === "speaking" ? "animate-pulse bg-accent" : "bg-muted-foreground"}`} />
            {INTERVIEWER_NAME} {phase === "speaking" ? "speaking…" : phase === "listening" ? "listening…" : ""}
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-4 sm:gap-6 sm:py-8">
            <AIAvatar state={phase === "speaking" ? "speaking" : phase === "listening" ? "listening" : "idle"} />
            <p className="max-w-sm text-center text-sm leading-relaxed text-foreground sm:text-base">{question}</p>
          </div>
        </div>

        {/* Candidate camera */}
        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 sm:gap-4 sm:p-6">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {phase === "listening" ? <Mic className="h-3.5 w-3.5 text-success" /> : <MicOff className="h-3.5 w-3.5" />}
            {phase === "listening" ? "Listening…" : "You"}
          </div>
          <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-md)] bg-black">
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          </div>

          {!micSupported && (
            <p className="text-xs text-danger">
              Speech recognition isn&apos;t supported in this browser — try Chrome, or type your answer below.
            </p>
          )}

          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            onPaste={handlePaste}
            rows={4}
            placeholder="Your answer will appear here as you speak — you can also edit it before submitting."
            className="min-h-24 flex-1 resize-none rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
          />

          {phase === "closing" || phase === "ending" ? (
            <Button className="w-full" onClick={handleEndInterview} disabled={phase === "ending"}>
              {phase === "ending" ? "Ending…" : "End Interview"}
            </Button>
          ) : (
            <Button className="w-full" onClick={handleSubmitAnswer} disabled={phase === "submitting" || phase === "speaking" || !transcript.trim()}>
              {phase === "submitting" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit Answer"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
