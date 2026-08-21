"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { useToast } from "@/components/ui/Toast";
import { deleteCandidateAction } from "@/lib/actions/candidates";

/** Only rendered for role === "admin" by the caller — this component still
 * assumes nothing on its own, the real enforcement is the requireAdmin()
 * check inside deleteCandidateAction itself. */
export function DeleteCandidateButton({ candidateId, candidateName }: { candidateId: string; candidateName: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await deleteCandidateAction(candidateId);
        setOpen(false);
        showToast(`${candidateName} was deleted.`, "success");
        router.push("/candidates");
      } catch (err) {
        showToast(`Couldn't delete candidate: ${err instanceof Error ? err.message : "Unknown error"}`, "danger");
        setOpen(false);
      }
    });
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)} disabled={isPending}>
        <Trash2 className="h-3.5 w-3.5" />
        Delete Candidate
      </Button>
      <ConfirmationDialog
        open={open}
        title="Delete candidate?"
        description={`This permanently deletes ${candidateName} and every application, screening, interview, and assessment tied to them. This cannot be undone.`}
        confirmLabel={isPending ? "Deleting…" : "Delete"}
        danger
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
