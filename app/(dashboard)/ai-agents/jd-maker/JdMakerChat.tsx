"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, RotateCcw, MessageSquare, ShieldCheck, Sparkles, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import type { RequirementExtraction, JDGeneration } from "@/lib/ai/schemas";
import type { StructuredInputOverrides } from "@/lib/ai/provider";
import { extractRequirementAction, generateJdAction } from "@/lib/actions/jd";
import { ReviewStep } from "../../jobs/new/ReviewStep";

const STARTER_ROLES = ["Software Engineer", "Sales Executive", "HR Manager"];

interface ChatMessage {
  id: string;
  role: "bot" | "user";
  text: string;
  chips?: string[];
}

function summarizeUnderstanding(req: RequirementExtraction): string {
  const bits: string[] = [`Role: ${req.role}`];
  if (req.experience_min != null || req.experience_max != null) {
    bits.push(`Experience: ${req.experience_min ?? "?"}–${req.experience_max ?? "?"} yrs`);
  }
  if (req.mandatory_skills.length > 0) bits.push(`Must-have skills: ${req.mandatory_skills.join(", ")}`);
  if (req.preferred_skills.length > 0) bits.push(`Nice-to-have: ${req.preferred_skills.join(", ")}`);
  if (req.work_mode && req.work_mode !== "Not specified") bits.push(`Work mode: ${req.work_mode}`);
  if (req.location && req.location !== "Not specified") bits.push(`Location: ${req.location}`);
  return `Here's what I understood so far:\n${bits.map((b) => `• ${b}`).join("\n")}`;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `msg-${idCounter}`;
}

const INITIAL_MESSAGE: ChatMessage = {
  id: "starter",
  role: "bot",
  text: "Hi! I'm JD Maker 👋 Let's put together a great job description. What role are you hiring for?",
  chips: STARTER_ROLES,
};

export function JdMakerChat() {
  const { showToast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [rawRequirement, setRawRequirement] = useState("");
  const [requirement, setRequirement] = useState<RequirementExtraction | null>(null);
  const [overrides] = useState<StructuredInputOverrides>({});
  const [awaitingGenerateConfirm, setAwaitingGenerateConfirm] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ jobId: string; jd: JDGeneration } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, result]);

  function addMessage(msg: Omit<ChatMessage, "id">) {
    setMessages((prev) => [...prev, { ...msg, id: nextId() }]);
  }

  function reset() {
    idCounter = 0;
    setMessages([INITIAL_MESSAGE]);
    setRawRequirement("");
    setRequirement(null);
    setAwaitingGenerateConfirm(false);
    setInput("");
    setBusy(false);
    setResult(null);
  }

  async function runExtraction(combinedText: string) {
    setBusy(true);
    try {
      const extracted = await extractRequirementAction(combinedText, overrides);
      setRawRequirement(combinedText);
      setRequirement(extracted);

      if (extracted.clarification_needed && extracted.clarification_question) {
        addMessage({ role: "bot", text: extracted.clarification_question, chips: extracted.clarification_options });
        setAwaitingGenerateConfirm(false);
      } else {
        addMessage({ role: "bot", text: summarizeUnderstanding(extracted) });
        addMessage({ role: "bot", text: "Ready for me to draft the full job description?", chips: ["Generate JD ✨", "Add more details"] });
        setAwaitingGenerateConfirm(true);
      }
    } catch (err) {
      addMessage({ role: "bot", text: err instanceof Error ? err.message : "I couldn't process that — could you rephrase?" });
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate() {
    if (!requirement) return;
    setBusy(true);
    addMessage({ role: "bot", text: "Drafting the job description now…" });
    try {
      const generated = await generateJdAction(requirement, overrides);
      setResult(generated);
      addMessage({ role: "bot", text: "Done! Here's your draft — review, tweak, and approve it below." });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to generate the job description.", "danger");
      addMessage({ role: "bot", text: "Something went wrong generating the JD — want to try again?", chips: ["Generate JD ✨"] });
    } finally {
      setBusy(false);
    }
  }

  function handleChip(chip: string) {
    if (chip === "Generate JD ✨") {
      addMessage({ role: "user", text: chip });
      setAwaitingGenerateConfirm(false);
      void handleGenerate();
      return;
    }
    if (chip === "Add more details") {
      addMessage({ role: "user", text: chip });
      addMessage({ role: "bot", text: "Sure — tell me what else to add or change." });
      setAwaitingGenerateConfirm(false);
      return;
    }

    addMessage({ role: "user", text: chip });
    const combined = rawRequirement ? `${rawRequirement}\n\n${chip}` : chip;
    void runExtraction(combined);
  }

  function handleSubmitText() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    addMessage({ role: "user", text });

    if (awaitingGenerateConfirm) {
      setAwaitingGenerateConfirm(false);
      const combined = rawRequirement ? `${rawRequirement}\n\n${text}` : text;
      void runExtraction(combined);
      return;
    }

    const combined = rawRequirement ? `${rawRequirement}\n\n${text}` : text;
    void runExtraction(combined);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-7xl flex-col px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/ai-agents"
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-border text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-accent text-accent-foreground">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-foreground">JD Maker</h1>
              <Badge tone="accent">AI AGENT</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Interactive specialist workspace</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" />
          Start over
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="flex flex-col gap-5 overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-surface p-5">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Specialist // Active</p>
            <div className="relative mx-auto mt-4 flex h-24 w-24 items-center justify-center">
              <span className="absolute inset-0 animate-pulse rounded-full border border-dashed border-accent/40" />
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-[var(--shadow-soft)]">
                <Bot className="h-7 w-7" />
              </span>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Current Agent</p>
            <h2 className="mt-1 text-base font-semibold text-foreground">JD Maker</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Guides the brief, sharpens the details, and turns the conversation into a polished job description.
            </p>
          </div>

          <ul className="flex flex-col gap-2.5 border-t border-border pt-4 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-accent" />
              Guided conversation
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent" />
              Private workspace
            </li>
            <li className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              Export-ready output
            </li>
          </ul>
        </aside>

        <section className="flex min-h-0 flex-col rounded-[var(--radius-lg)] border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Live session
            </div>
            <span className="text-xs text-muted-foreground">{messages.length} message{messages.length === 1 ? "" : "s"}</span>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-4">
              {messages.map((msg) => (
                <div key={msg.id} className={msg.role === "user" ? "flex justify-end" : "flex items-start gap-2.5"}>
                  {msg.role === "bot" && (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <Bot className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <div className={msg.role === "user" ? "max-w-[75%]" : "max-w-[75%]"}>
                    <div
                      className={
                        msg.role === "user"
                          ? "rounded-[var(--radius-lg)] rounded-tr-sm bg-accent px-4 py-2.5 text-sm text-accent-foreground"
                          : "rounded-[var(--radius-lg)] rounded-tl-sm border border-border bg-surface-elevated px-4 py-2.5 text-sm text-foreground whitespace-pre-line"
                      }
                    >
                      {msg.text}
                    </div>
                    {msg.chips && msg.chips.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {msg.chips.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            disabled={busy}
                            onClick={() => handleChip(chip)}
                            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {busy && (
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Bot className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex gap-1 rounded-[var(--radius-lg)] rounded-tl-sm border border-border bg-surface-elevated px-4 py-3">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  </div>
                </div>
              )}

              {result && (
                <div className="rounded-[var(--radius-lg)] border border-border bg-background p-4">
                  <ReviewStep jobId={result.jobId} initialJd={result.jd} requirement={requirement!} />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border p-4">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitText();
                }
              }}
              disabled={busy || Boolean(result)}
              placeholder={result ? "JD generated — edit it above." : "Type a role, or answer the question above…"}
              className="h-10 flex-1 rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none disabled:opacity-60"
            />
            <Button size="md" onClick={handleSubmitText} disabled={busy || !input.trim() || Boolean(result)}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
