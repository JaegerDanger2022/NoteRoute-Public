"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "@/components/layout/UpgradeModal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function SettingsModal() {
  const { user, signOut } = useAuthStore();
  const { settingsOpen, openSettings, closeSettings, openSignOut } =
    useUIStore();

  const [isAdmin, setIsAdmin] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Delete account
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteCustomVectors, setDeleteCustomVectors] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [customIndex, setCustomIndex] = useState<{
    index_name: string;
    index_status: string;
    has_bedrock_creds: boolean;
  } | null>(null);
  const [customLLM, setCustomLLM] = useState<{ provider: string } | null>(null);

  // BYOI
  const [byoiOpen, setByoiOpen] = useState(false);
  const [byoiPineconeKey, setByoiPineconeKey] = useState("");
  const [byoiBedrockKeyId, setByoiBedrockKeyId] = useState("");
  const [byoiBedrockSecret, setByoiBedrockSecret] = useState("");
  const [byoiBedrockRegion, setByoiBedrockRegion] = useState("us-east-1");
  const [byoiBedrockExpanded, setByoiBedrockExpanded] = useState(false);
  const [byoiSaving, setByoiSaving] = useState(false);

  // Confirm dialogs
  const [confirmByoiOpen, setConfirmByoiOpen] = useState(false);
  const [confirmLlmOpen, setConfirmLlmOpen] = useState(false);

  // BYOLLM
  const [llmOpen, setLlmOpen] = useState(false);
  const [llmProvider, setLlmProvider] = useState<"openai" | "anthropic">(
    "openai",
  );
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmSaving, setLlmSaving] = useState(false);

  useEffect(() => {
    if (!settingsOpen) return;
    (async () => {
      try {
        const [indexRes, llmRes, adminRes] = await Promise.all([
          api.get("/api/v1/users/me/custom-index"),
          api.get("/api/v1/users/me/custom-llm"),
          api.get("/api/v1/admin/me"),
        ]);
        setCustomIndex(
          indexRes.data.index_status !== "none" ? indexRes.data : null,
        );
        setCustomLLM(llmRes.data.provider ? llmRes.data : null);
        setIsAdmin(adminRes.data.is_admin === true);
      } catch {}
    })();
  }, [settingsOpen]);

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await api.delete("/api/v1/users/me", {
        params: { delete_custom_vectors: deleteCustomVectors },
      });
      await signOut();
    } catch {
      toast.error("Could not delete account. Please try again.");
      setDeleting(false);
    }
  };

  const saveByoi = async () => {
    if (!byoiPineconeKey.trim()) return;
    setByoiSaving(true);
    try {
      const body: Record<string, string> = {
        pinecone_api_key: byoiPineconeKey.trim(),
      };
      if (byoiBedrockKeyId.trim()) {
        body.bedrock_aws_access_key_id = byoiBedrockKeyId.trim();
        body.bedrock_aws_secret_access_key = byoiBedrockSecret.trim();
        body.bedrock_aws_region = byoiBedrockRegion.trim() || "us-east-1";
      }
      const res = await api.post("/api/v1/users/me/custom-index", body);
      setCustomIndex(res.data);
      setByoiOpen(false);
      openSettings();
      setByoiPineconeKey("");
      setByoiBedrockKeyId("");
      setByoiBedrockSecret("");
      setByoiBedrockExpanded(false);
      toast.success("Pinecone index connected!");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not connect index.");
    } finally {
      setByoiSaving(false);
    }
  };

  const disconnectByoi = async () => {
    try {
      await api.delete("/api/v1/users/me/custom-index");
      setCustomIndex(null);
      toast.success("Custom index disconnected.");
    } catch {
      toast.error("Could not disconnect index.");
    }
  };

  const saveLlm = async () => {
    if (!llmApiKey.trim()) return;
    setLlmSaving(true);
    try {
      const res = await api.post("/api/v1/users/me/custom-llm", {
        provider: llmProvider,
        api_key: llmApiKey.trim(),
      });
      setCustomLLM({ provider: res.data.provider });
      setLlmApiKey("");
      setLlmOpen(false);
      openSettings();
      toast.success("AI model connected!");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not connect AI model.");
    } finally {
      setLlmSaving(false);
    }
  };

  const disconnectLlm = async () => {
    try {
      await api.delete("/api/v1/users/me/custom-llm");
      setCustomLLM(null);
      toast.success("AI model disconnected.");
    } catch {
      toast.error("Could not disconnect AI model.");
    }
  };

  return (
    <>
      {/* ── Settings dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={settingsOpen}
        onOpenChange={(v) => (v ? openSettings() : closeSettings())}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>

          {/* Account */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
              Account
            </p>
            <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm text-foreground truncate ml-4 max-w-[180px]">
                {user?.email}
              </span>
            </div>
            <button
              onClick={() => {
                closeSettings();
                setUpgradeOpen(true);
              }}
              className="w-full flex items-center justify-between rounded-lg bg-muted px-4 py-3 hover:bg-accent transition-colors">
              <span className="text-sm text-muted-foreground">Plans &amp; Billing</span>
              <span className="text-muted-foreground">›</span>
            </button>
          </div>

          {/* Vector Index */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
              Vector Index
            </p>
            {customIndex ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    {customIndex.index_name}
                  </span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded ${customIndex.index_status === "ready" ? "bg-green-900/50 text-green-400" : customIndex.index_status === "deleted" || customIndex.index_status === "error" || customIndex.index_status === "key_invalid" ? "bg-red-900/50 text-red-400" : "bg-blue-900/50 text-blue-400"}`}>
                    {customIndex.index_status === "key_invalid" ? "API key invalid" : customIndex.index_status}
                  </span>
                </div>
                {customIndex.index_status === "error" && (
                  <p className="text-xs text-red-400 px-1">
                    Connection failed — the API key may be invalid. Try reconnecting with a valid key.
                  </p>
                )}
                {customIndex.index_status === "key_invalid" && (
                  <p className="text-xs text-red-400 px-1">
                    Your Pinecone API key was revoked or deleted. Re-enter a valid key to restore access to this index.
                  </p>
                )}
                {customIndex.has_bedrock_creds && (
                  <p className="text-xs text-muted-foreground px-1">
                    Custom Bedrock credentials active
                  </p>
                )}
                <button
                  onClick={() => {
                    closeSettings();
                    setByoiOpen(true);
                  }}
                  className="w-full flex items-center justify-between rounded-lg bg-muted px-4 py-3 hover:bg-accent transition-colors">
                  <span className="text-sm text-muted-foreground">
                    Reconnect / update
                  </span>
                  <span className="text-muted-foreground">›</span>
                </button>
                <button
                  onClick={() => setConfirmByoiOpen(true)}
                  className="w-full rounded-lg bg-muted px-4 py-3 text-left hover:bg-accent transition-colors">
                  <span className="text-sm text-destructive font-semibold">
                    Disconnect index
                  </span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  closeSettings();
                  setByoiOpen(true);
                }}
                className="w-full flex items-center justify-between rounded-lg bg-muted px-4 py-3 hover:bg-accent transition-colors">
                <span className="text-sm text-muted-foreground">
                  Connect your own Pinecone index
                </span>
                <span className="text-muted-foreground">›</span>
              </button>
            )}
          </div>

          {/* AI Models */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
              AI Models
            </p>
            {customLLM ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    {customLLM.provider === "openai" ? "OpenAI" : "Anthropic"}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-900/50 text-green-400">
                    connected
                  </span>
                </div>
                <button
                  onClick={() => {
                    setLlmProvider(
                      customLLM.provider as "openai" | "anthropic",
                    );
                    closeSettings();
                    setLlmOpen(true);
                  }}
                  className="w-full flex items-center justify-between rounded-lg bg-muted px-4 py-3 hover:bg-accent transition-colors">
                  <span className="text-sm text-muted-foreground">
                    Update key
                  </span>
                  <span className="text-muted-foreground">›</span>
                </button>
                <button
                  onClick={() => setConfirmLlmOpen(true)}
                  className="w-full rounded-lg bg-muted px-4 py-3 text-left hover:bg-accent transition-colors">
                  <span className="text-sm text-destructive font-semibold">
                    Disconnect AI model
                  </span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  closeSettings();
                  setLlmOpen(true);
                }}
                className="w-full flex items-center justify-between rounded-lg bg-muted px-4 py-3 hover:bg-accent transition-colors">
                <span className="text-sm text-muted-foreground">
                  Bring your own AI model key
                </span>
                <span className="text-muted-foreground">›</span>
              </button>
            )}
          </div>

          {/* Admin */}
          {isAdmin && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                Admin
              </p>
              <Link
                href="/x7k2m9"
                onClick={closeSettings}
                className="w-full flex items-center justify-between rounded-lg bg-muted px-4 py-3 hover:bg-accent transition-colors">
                <span className="text-sm text-muted-foreground">
                  Admin dashboard
                </span>
                <span className="text-muted-foreground">›</span>
              </Link>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
              Actions
            </p>
            <button
              onClick={() => {
                closeSettings();
                openSignOut();
              }}
              className="w-full rounded-lg bg-muted px-4 py-3 text-left hover:bg-accent transition-colors">
              <span className="text-sm text-destructive font-semibold">
                Sign out
              </span>
            </button>
            <button
              onClick={() => { setDeleteCustomVectors(false); setConfirmDeleteOpen(true); }}
              className="w-full rounded-lg bg-muted px-4 py-3 text-left hover:bg-accent transition-colors">
              <span className="text-sm text-destructive/70 font-semibold">
                Delete account
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete account confirm ──────────────────────────────────────── */}
      <Dialog open={confirmDeleteOpen} onOpenChange={(v) => !deleting && setConfirmDeleteOpen(v)}>
        <DialogContent className="max-w-sm bg-zinc-900 border-zinc-700 text-white">
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400">
            This permanently deletes your account, all slots, sources, integrations, and history. This cannot be undone.
          </p>
          {customIndex && (
            <label className="flex items-center justify-between gap-3 rounded-lg bg-zinc-800 px-4 py-3 cursor-pointer">
              <div>
                <p className="text-sm text-zinc-300">Also delete my private Pinecone vectors</p>
                <p className="text-xs text-zinc-500 mt-0.5">Removes data from your own index ({customIndex.index_name})</p>
              </div>
              <input
                type="checkbox"
                checked={deleteCustomVectors}
                onChange={(e) => setDeleteCustomVectors(e.target.checked)}
                className="h-4 w-4 accent-red-500"
              />
            </label>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 border-zinc-700" onClick={() => setConfirmDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" className="flex-1" onClick={deleteAccount} disabled={deleting}>
              {deleting ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : "Delete my account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Upgrade modal ───────────────────────────────────────────────── */}
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => {
          setUpgradeOpen(false);
          openSettings();
        }}
      />

      {/* ── BYOI dialog ─────────────────────────────────────────────────── */}
      <Dialog
        open={byoiOpen}
        onOpenChange={(o) => {
          setByoiOpen(o);
          if (!o) openSettings();
        }}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Connect your Pinecone index</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            NoteRoute will create an index named{" "}
            <code className="font-mono text-xs">
              noteroute-{"{"}'your-id'{"}"}
            </code>{" "}
            in your Pinecone account. Your API key is stored encrypted and never
            shared.
          </p>
          <div className="rounded-lg border border-amber-900/40 bg-amber-950/30 px-4 py-3 text-xs text-amber-300/90 leading-relaxed">
            <span className="font-semibold">One index at a time.</span>{" "}
            NoteRoute searches a single vector store per session — either the
            shared index or yours. Slots stored on a different index won't be
            ranked until you switch back to the index they were indexed on.
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Pinecone API key *</Label>
              <Input
                type="password"
                placeholder="pcsk_…"
                value={byoiPineconeKey}
                onChange={(e) => setByoiPineconeKey(e.target.value)}
                autoComplete="off"
              />
            </div>
            {/* Bedrock section — hidden until ready */}
            {false && byoiBedrockExpanded && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Supply your own AWS Bedrock keys to use your own quota for
                  embeddings and summarisation.
                </p>
                <div className="space-y-1.5">
                  <Label>AWS Access Key ID</Label>
                  <Input
                    placeholder="AKIA…"
                    value={byoiBedrockKeyId}
                    onChange={(e) => setByoiBedrockKeyId(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>AWS Secret Access Key</Label>
                  <Input
                    type="password"
                    placeholder="Secret key"
                    value={byoiBedrockSecret}
                    onChange={(e) => setByoiBedrockSecret(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>AWS Region</Label>
                  <Input
                    placeholder="us-east-1"
                    value={byoiBedrockRegion}
                    onChange={(e) => setByoiBedrockRegion(e.target.value)}
                  />
                </div>
              </div>
            )}
            <Button
              className="w-full"
              onClick={saveByoi}
              disabled={!byoiPineconeKey.trim() || byoiSaving}>
              {byoiSaving ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Connecting…
                </span>
              ) : (
                "Connect index"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Disconnect index confirm ────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmByoiOpen}
        onOpenChange={setConfirmByoiOpen}
        title="Disconnect index"
        description="This will route your slots back to the shared NoteRoute index. Your Pinecone index will not be deleted."
        confirmLabel="Disconnect"
        destructive
        onConfirm={disconnectByoi}
      />

      {/* ── Disconnect AI model confirm ──────────────────────────────────── */}
      <ConfirmDialog
        open={confirmLlmOpen}
        onOpenChange={setConfirmLlmOpen}
        title="Disconnect AI model"
        description="Your notes will be processed using NoteRoute's default Bedrock models."
        confirmLabel="Disconnect"
        destructive
        onConfirm={disconnectLlm}
      />

      {/* ── LLM dialog ──────────────────────────────────────────────────── */}
      <Dialog
        open={llmOpen}
        onOpenChange={(o) => {
          setLlmOpen(o);
          if (!o) openSettings();
        }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Connect AI model</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Used for summarizing and ranking your notes.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <div className="flex gap-2">
                {(["openai", "anthropic"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setLlmProvider(p)}
                    className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${llmProvider === p ? "bg-foreground text-background border-foreground" : "bg-muted text-muted-foreground border-transparent"}`}>
                    {p === "openai" ? "OpenAI" : "Anthropic"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>API key</Label>
              <Input
                type="password"
                placeholder={llmProvider === "openai" ? "sk-…" : "sk-ant-…"}
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                autoComplete="off"
              />
            </div>
            <Button
              className="w-full"
              onClick={saveLlm}
              disabled={!llmApiKey.trim() || llmSaving}>
              {llmSaving ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Connecting…
                </span>
              ) : (
                "Connect"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
