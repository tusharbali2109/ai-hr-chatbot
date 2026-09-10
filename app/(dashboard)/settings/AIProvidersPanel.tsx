"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { updateGeminiKeyAction, clearGeminiKeyAction } from "@/lib/actions/ai-settings";
import type { GeminiSettingsView } from "@/lib/services/ai-settings";

/**
 * Settings → AI Providers. Anthropic (primary) is environment-managed and
 * shown read-only. Gemini (automatic fallback) is editable here so an admin
 * can rotate the key the moment its quota runs out, without a redeploy.
 */
export function AIProvidersPanel({ gemini }: { gemini: GeminiSettingsView }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(gemini.model ?? "");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function handleSave() {
    if (!apiKey.trim()) {
      showToast("Paste a Gemini API key first.", "danger");
      return;
    }
    setSaving(true);
    try {
      await updateGeminiKeyAction(apiKey.trim(), model.trim() || null);
      setApiKey("");
      showToast("Gemini fallback key updated. New AI calls will use it within a few seconds.", "success");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save the Gemini key.", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    try {
      await clearGeminiKeyAction();
      showToast("Saved Gemini key removed. The app now uses the GEMINI_API_KEY environment value, if any.", "success");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to clear the Gemini key.", "danger");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <h3 className="mb-1 text-sm font-semibold text-foreground">AI Providers</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Every AI feature (resume screening, interview questions, evaluations, the candidate chat) tries Anthropic first and
        automatically falls back to Gemini if Anthropic is out of credits or unavailable.
      </p>

      <div className="flex flex-col divide-y divide-border">
        {/* Primary — Anthropic */}
        <div className="flex items-start justify-between gap-4 py-3 first:pt-0">
          <div>
            <p className="text-sm font-medium text-foreground">Anthropic (Claude) — primary</p>
            <p className="text-xs text-muted-foreground">
              Managed via the <code className="rounded bg-surface-elevated px-1">ANTHROPIC_API_KEY</code> server environment
              variable. Not editable here.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-surface-elevated px-2.5 py-1 text-xs text-muted-foreground">Environment</span>
        </div>

        {/* Fallback — Gemini */}
        <div className="py-3 last:pb-0">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Google Gemini — automatic fallback</p>
              <p className="text-xs text-muted-foreground">
                {gemini.hasKey ? (
                  <>
                    Current key <code className="rounded bg-surface-elevated px-1">{gemini.maskedKey}</code>
                    {gemini.usingEnvFallback
                      ? " (from GEMINI_API_KEY env — save one below to override)"
                      : gemini.updatedAt
                        ? ` · updated ${new Date(gemini.updatedAt).toLocaleString()}`
                        : ""}
                  </>
                ) : (
                  "No Gemini key configured — the fallback is inactive."
                )}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                gemini.hasKey ? "bg-accent/10 text-accent" : "bg-surface-elevated text-muted-foreground"
              }`}
            >
              {gemini.hasKey ? "Active" : "Inactive"}
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="password"
              autoComplete="off"
              placeholder="Paste a new Gemini API key (AQ.… or AIza…)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="sm:flex-1"
            />
            <Input
              placeholder="Model (optional, default gemini-3.6-flash)"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="sm:w-72"
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving || clearing}>
              {saving ? "Saving…" : "Save key"}
            </Button>
            {gemini.hasKey && !gemini.usingEnvFallback && (
              <Button size="sm" variant="ghost" onClick={handleClear} disabled={saving || clearing}>
                {clearing ? "Removing…" : "Remove saved key"}
              </Button>
            )}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-accent hover:underline"
            >
              Get a key
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
