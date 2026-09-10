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
 * can rotate keys the moment a quota runs out, without a redeploy. Multiple
 * keys can be pasted (one per line) — the engine walks the list when a key
 * is rate-limited.
 */
export function AIProvidersPanel({ gemini }: { gemini: GeminiSettingsView }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [keysText, setKeysText] = useState("");
  const [model, setModel] = useState(gemini.model ?? "");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const pastedCount = keysText.split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean).length;

  async function handleSave() {
    if (pastedCount === 0) {
      showToast("Paste at least one Gemini API key.", "danger");
      return;
    }
    setSaving(true);
    try {
      await updateGeminiKeyAction(keysText, model.trim() || null);
      setKeysText("");
      showToast(`Saved ${pastedCount} Gemini key${pastedCount === 1 ? "" : "s"}. New AI calls will use them within a few seconds.`, "success");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save the Gemini keys.", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    try {
      await clearGeminiKeyAction();
      showToast("Saved Gemini keys removed. The app now uses the GEMINI_API_KEY environment value, if any.", "success");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to clear the Gemini keys.", "danger");
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
                    {gemini.keyCount} key{gemini.keyCount === 1 ? "" : "s"} configured
                    {gemini.maskedKeys.length > 0 && <> — <code className="rounded bg-surface-elevated px-1">{gemini.maskedKeys.join(", ")}</code></>}
                    {gemini.usingEnvFallback
                      ? " (from GEMINI_API_KEY env — save below to override)"
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

          <label className="mb-1 block text-xs font-medium text-foreground">
            Gemini API keys <span className="font-normal text-muted-foreground">— one per line; the app rotates to the next when one hits its limit</span>
          </label>
          <textarea
            rows={4}
            spellCheck={false}
            autoComplete="off"
            placeholder={"AQ.xxxxxxxx\nAQ.yyyyyyyy\nAIzaZzzzzzzz"}
            value={keysText}
            onChange={(e) => setKeysText(e.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground transition-colors duration-[var(--duration-fast)] focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              placeholder="Model (optional, default gemini-3.6-flash)"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full sm:w-72"
            />
            <Button size="sm" onClick={handleSave} disabled={saving || clearing}>
              {saving ? "Saving…" : pastedCount > 1 ? `Save ${pastedCount} keys` : "Save key"}
            </Button>
            {gemini.hasKey && !gemini.usingEnvFallback && (
              <Button size="sm" variant="ghost" onClick={handleClear} disabled={saving || clearing}>
                {clearing ? "Removing…" : "Remove saved keys"}
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
