"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { askAboutCandidateAction } from "@/lib/actions/candidate-chat";
import type { ExplainCandidateChatTurn } from "@/lib/ai/provider";

const STARTER_QUESTIONS = [
  "Why might this candidate be a good fit?",
  "What are their weak points?",
  "Summarize their interview",
  "Why was this candidate rejected?",
];

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `chat-msg-${idCounter}`;
}

export function ExplainCandidateChat({ applicationId }: { applicationId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;

    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text }]);
    setBusy(true);

    const priorTurns: ExplainCandidateChatTurn[] = messages.map((m) => ({ role: m.role, text: m.text }));

    try {
      const answer = await askAboutCandidateAction(applicationId, text, priorTurns);
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", text: answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong answering that — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Explain This Candidate</h2>
        <Badge tone="accent" className="text-[10px]">
          AI
        </Badge>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Ask a question and get an answer grounded only in this candidate&apos;s screening, interview, assessment, and stage history.
      </p>

      {messages.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {STARTER_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => void ask(q)}
              className="rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div ref={scrollRef} className="mb-3 flex max-h-96 flex-col gap-3 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-background p-3">
          {messages.map((msg) => (
            <div key={msg.id} className={msg.role === "user" ? "flex justify-end" : "flex items-start gap-2"}>
              {msg.role === "assistant" && (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Bot className="h-3 w-3" />
                </span>
              )}
              <div
                className={
                  msg.role === "user"
                    ? "max-w-[80%] rounded-[var(--radius-lg)] rounded-tr-sm bg-accent px-3 py-2 text-sm text-accent-foreground"
                    : "max-w-[80%] rounded-[var(--radius-lg)] rounded-tl-sm border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground whitespace-pre-line"
                }
              >
                {msg.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Bot className="h-3 w-3" />
              </span>
              <div className="flex gap-1 rounded-[var(--radius-lg)] rounded-tl-sm border border-border bg-surface-elevated px-3 py-2.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mb-3 text-xs text-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(input);
            }
          }}
          disabled={busy}
          placeholder="Ask about this candidate…"
          className="h-10 flex-1 rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none disabled:opacity-60"
        />
        <Button size="md" onClick={() => void ask(input)} disabled={busy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
