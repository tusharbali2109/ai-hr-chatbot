"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Mic, MicOff, Video as VideoIcon, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { submitCandidateInterviewAnswerAction, finalizeCandidateInterviewAction, logProctoringWarningAction } from "@/lib/actions/candidate-interview";

type Phase = "requesting_media" | "media_denied" | "speaking" | "listening" | "submitting" | "closing" | "ending";

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
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

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

  const [phase, setPhase] = useState<Phase>("requesting_media");
  const [mediaReady, setMediaReady] = useState(false);
  const [question, setQuestion] = useState(initialQuestion);
  const [questionId, setQuestionId] = useState(initialQuestionId);
  const [transcript, setTranscript] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [micSupported, setMicSupported] = useState(true);

  // ---- Camera/mic setup ----
  useEffect(() => {
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
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ---- Proctoring: tab visibility + track health ----
  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden && phase !== "requesting_media" && phase !== "media_denied") {
        setWarning("You switched away from this tab — please stay on the interview page.");
        void logProctoringWarningAction(interviewId, "tab_hidden");
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [interviewId, phase]);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const handlers: Array<() => void> = [];
    stream.getTracks().forEach((track) => {
      const onEnded = () => {
        setWarning(`Your ${track.kind === "video" ? "camera" : "microphone"} was disconnected — please reconnect it.`);
        void logProctoringWarningAction(interviewId, `${track.kind}_track_ended`);
      };
      track.addEventListener("ended", onEnded);
      handlers.push(() => track.removeEventListener("ended", onEnded));
    });
    return () => handlers.forEach((off) => off());
  }, [interviewId, phase]);

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
    try {
      await finalizeCandidateInterviewAction(interviewId);
    } finally {
      router.push("/candidate/video-interview/completed");
    }
  }

  useEffect(() => {
    if (phase === "closing") {
      void speak("Thank you — that covers all the questions. Whenever you're ready, click End Interview to finish.");
    }
  }, [phase]);

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

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-accent text-accent-foreground">
          <VideoIcon className="h-4 w-4" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">AI Video Interview</h1>
      </div>

      {warning && (
        <div className="mb-4 flex items-center gap-2 rounded-[var(--radius-md)] border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {warning}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-6 md:grid-cols-2">
        {/* Left: AI interviewer */}
        <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-6">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${phase === "speaking" ? "animate-pulse bg-accent" : "bg-muted-foreground"}`} />
            AI Interviewer {phase === "speaking" ? "speaking…" : ""}
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Bot className="h-9 w-9" />
            </span>
            <p className="max-w-sm text-center text-base leading-relaxed text-foreground">{question}</p>
          </div>
        </div>

        {/* Right: candidate camera */}
        <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-6">
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
            rows={4}
            placeholder="Your answer will appear here as you speak — you can also edit it before submitting."
            className="flex-1 resize-none rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
          />

          {phase === "closing" || phase === "ending" ? (
            <Button onClick={handleEndInterview} disabled={phase === "ending"}>
              {phase === "ending" ? "Ending…" : "End Interview"}
            </Button>
          ) : (
            <Button onClick={handleSubmitAnswer} disabled={phase === "submitting" || phase === "speaking" || !transcript.trim()}>
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
