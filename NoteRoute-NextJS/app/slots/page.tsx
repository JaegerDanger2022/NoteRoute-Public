"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useSourceStore } from "@/store/sourceStore";
import { useAuthStore } from "@/store/authStore";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Slot = {
  id: string;
  source_id: string;
  name: string;
  description: string;
  destination: {
    resource_id: string;
    resource_name: string;
    resource_url?: string;
  };
  index_status: "pending" | "indexing" | "indexed" | "failed";
  index_name: string;
  read_content: boolean;
  is_active: boolean;
};

type Resource = {
  id: string;
  name: string;
  title?: string;
  parent_id?: string | null;
  url?: string;
};

const PRESET_TAGS = [
  "work",
  "personal",
  "meetings",
  "ideas",
  "journal",
  "research",
  "tasks",
  "notes",
];

const PROVIDER_LABEL: Record<string, string> = {
  notion: "Notion",
  google: "Google Docs",
  slack: "Slack",
  todoist: "Todoist",
  trello: "Trello",
};
const PROVIDER_BADGE: Record<string, string> = {
  notion: "N",
  google: "G",
  slack: "S",
  todoist: "T",
  trello: "Tr",
};

const PROVIDER_TOOLTIP: Record<string, string> = {
  notion: "Slots map to Notion pages or databases. When a note is delivered, NoteRoute appends a new block to the selected page.",
  google: "Slots map to Google Docs. When a note is delivered, NoteRoute appends text to the end of the selected document.",
  slack: "Slots map to Slack channels. When a note is delivered, NoteRoute posts a message to the selected channel.",
  todoist: "Slots map to Todoist projects. When a note is delivered, NoteRoute creates a new task in the selected project.",
  trello: "Slots map to Trello lists. When a note is delivered, NoteRoute creates a new card in the selected list.",
};

export default function SlotsPage() {
  const { sources, fetchSources } = useSourceStore();
  const { user, loading: authLoading } = useAuthStore();

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxSlots, setMaxSlots] = useState(50);
  const [isAdmin, setIsAdmin] = useState(false);
  const [indexDeleted, setIndexDeleted] = useState(false);
  const [collapsedSourceIds, setCollapsedSourceIds] = useState<Set<string>>(
    new Set(),
  );

  // Add slot modal
  const [addingToSourceId, setAddingToSourceId] = useState<string | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null,
  );
  const [slotName, setSlotName] = useState("");
  const [slotDescription, setSlotDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [resourceSearch, setResourceSearch] = useState("");
  const [slotTags, setSlotTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [readContent, setReadContent] = useState(false);
  const [projectSections, setProjectSections] = useState<Resource[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  // Trello two-step flow
  const [selectedBoard, setSelectedBoard] = useState<Resource | null>(null);
  const [trelloLists, setTrelloLists] = useState<Resource[]>([]);
  const [trelloListsLoading, setTrelloListsLoading] = useState(false);
  const [checkedListIds, setCheckedListIds] = useState<Set<string>>(new Set());
  const [trelloDescriptions, setTrelloDescriptions] = useState<
    Record<string, string>
  >({});
  // Google Picker
  const [pickerLoading, setPickerLoading] = useState(false);
  const gapiLoadedRef = useRef(false);
  const pickerOpenRef = useRef(false); // true while the Google Picker overlay is visible
  // sourceId stashed so we can re-open dialog after picker closes
  const pickerSourceIdRef = useRef<string | null>(null);
  // Delete confirmation
  const [slotToDelete, setSlotToDelete] = useState<Slot | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Info tooltip
  const [openTooltipId, setOpenTooltipId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll pending slots every 3s
  useEffect(() => {
    const pendingIds = slots
      .filter(
        (s) => s.index_status === "pending" || s.index_status === "indexing",
      )
      .map((s) => s.id);
    if (pendingIds.length === 0) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const stillPending: string[] = [];
      await Promise.all(
        slots
          .filter(
            (s) =>
              s.index_status === "pending" || s.index_status === "indexing",
          )
          .map(async (s) => {
            try {
              const res = await api.get(`/api/v1/slots/${s.id}`);
              const updated: Slot = res.data;
              const isBusy =
                updated.index_status === "pending" ||
                updated.index_status === "indexing";
              if (!isBusy) {
                setSlots((prev) =>
                  prev.map((p) =>
                    p.id === s.id
                      ? {
                          ...p,
                          index_status: updated.index_status,
                          index_name: updated.index_name,
                        }
                      : p,
                  ),
                );
              } else {
                stillPending.push(s.id);
              }
            } catch {}
          }),
      );
      if (stillPending.length === 0 && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 3000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [slots.map((s) => s.id + s.index_status).join(",")]);

  const loadSlots = useCallback(async () => {
    try {
      const [slotsRes, meRes, customIdxRes] = await Promise.all([
        api.get("/api/v1/slots"),
        api.get("/api/v1/users/me"),
        api
          .get("/api/v1/users/me/custom-index")
          .catch(() => ({ data: { index_status: "none" } })),
      ]);
      setSlots(slotsRes.data);
      setMaxSlots(meRes.data.limits?.max_slots ?? 50);
      setIsAdmin(meRes.data.is_admin ?? false);
      setIndexDeleted(customIdxRes.data.index_status === "deleted");
    } catch {
      toast.error("Failed to load slots");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchSources();
    loadSlots();
  }, [authLoading, user]);

  const loadGapi = (): Promise<void> =>
    new Promise((resolve) => {
      if (gapiLoadedRef.current) { resolve(); return; }
      const existing = document.getElementById("gapi-script");
      if (existing) {
        existing.addEventListener("load", () => { gapiLoadedRef.current = true; resolve(); });
        return;
      }
      const script = document.createElement("script");
      script.id = "gapi-script";
      script.src = "https://apis.google.com/js/api.js";
      script.onload = () => {
        (window as any).gapi.load("picker", () => { gapiLoadedRef.current = true; resolve(); });
      };
      document.head.appendChild(script);
    });

  const launchGooglePicker = async (sourceId: string) => {
    setPickerLoading(true);
    try {
      await loadGapi();
      const tokenRes = await api.get("/api/v1/integrations/google/access-token");
      const accessToken: string = tokenRes.data.access_token;
      const projectNumber = process.env.NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER ?? "";

      // Use a plain View (not DocsView) so drive.file scope doesn't hide
      // existing docs — DocsView filters to app-created files with that scope.
      const docsView = new (window as any).google.picker.View(
        (window as any).google.picker.ViewId.DOCS,
      ).setMimeTypes(
        "application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet,application/vnd.google-apps.presentation",
      );

      // Close the Radix Dialog before showing the Picker — the Dialog's focus
      // trap and dismissable layer intercept all pointer events that land on
      // the Picker iframe when they share the DOM, making files unclickable.
      // We stash the sourceId so we can re-open the dialog after the Picker
      // resolves (pick or cancel).
      pickerSourceIdRef.current = sourceId;
      pickerOpenRef.current = true;
      setAddingToSourceId(null); // close dialog temporarily

      const picker = new (window as any).google.picker.PickerBuilder()
        .addView(docsView)
        .setOAuthToken(accessToken)
        .setAppId(projectNumber)
        .setOrigin(window.location.origin)
        .setCallback((data: any) => {
          const Action = (window as any).google.picker.Action;
          const Document = (window as any).google.picker.Document;
          if (data.action === Action.PICKED) {
            pickerOpenRef.current = false;
            const doc = data.docs[0];
            const resource: Resource = {
              id: doc[Document.ID],
              name: doc[Document.NAME],
              url: doc[Document.URL],
            };
            // Re-open the dialog with the selected resource already populated
            setSelectedResource(resource);
            setSlotName(resource.name);
            setAddingToSourceId(pickerSourceIdRef.current);
            pickerSourceIdRef.current = null;
          } else if (data.action === Action.CANCEL) {
            pickerOpenRef.current = false;
            // Re-open dialog so user can try again
            setAddingToSourceId(pickerSourceIdRef.current);
            pickerSourceIdRef.current = null;
          }
        })
        .build();

      picker.setVisible(true);
    } catch {
      pickerOpenRef.current = false;
      // Re-open dialog so user sees the error in context
      setAddingToSourceId(pickerSourceIdRef.current);
      pickerSourceIdRef.current = null;
      toast.error("Could not open Google Picker.");
    } finally {
      setPickerLoading(false);
    }
  };

  const openAddSlot = async (sourceId: string) => {
    setAddingToSourceId(sourceId);
    setSelectedResource(null);
    setSlotName("");
    setSlotDescription("");
    setSlotTags([]);
    setTagInput("");
    setReadContent(false);
    setResourceSearch("");

    const source = sources.find((s) => s.id === sourceId);
    if (source?.provider === "google") {
      // Google uses the Picker — no resource list to load
      return;
    }

    setResourcesLoading(true);
    try {
      const res = await api.get(`/api/v1/sources/${sourceId}/resources`);
      setResources(res.data);
    } catch {
      toast.error("Could not load resources for this source.");
      setAddingToSourceId(null);
    } finally {
      setResourcesLoading(false);
    }
  };

  const closeModal = () => {
    setAddingToSourceId(null);
    setResources([]);
    setSelectedResource(null);
    setSlotName("");
    setSlotDescription("");
    setResourceSearch("");
    setSlotTags([]);
    setTagInput("");
    setReadContent(false);
    setProjectSections([]);
    setSelectedBoard(null);
    setTrelloLists([]);
    setCheckedListIds(new Set());
    setTrelloDescriptions({});
  };

  const saveSlot = async () => {
    if (!selectedResource || !slotName.trim() || !addingToSourceId) return;
    if (!readContent && !slotDescription.trim()) {
      toast.error("Description is required when Read & index content is off.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/api/v1/slots", {
        source_id: addingToSourceId,
        name: slotName.trim(),
        description: slotDescription.trim(),
        tags: slotTags,
        read_content: readContent,
        include_subpages: false,
        destination: {
          resource_id: selectedResource.id,
          resource_name: selectedResource.name,
          resource_url: selectedResource.url ?? null,
        },
      });
      setSlots((prev) => [...prev, res.data]);
      closeModal();
      toast.success("Slot created! Indexing in background…");
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ??
        e?.response?.data?.error ??
        "Could not save slot.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const saveTrelloSlots = async () => {
    if (!selectedBoard || checkedListIds.size === 0 || !addingToSourceId)
      return;
    if (!readContent) {
      const missing = Array.from(checkedListIds).some(
        (id) => !trelloDescriptions[id]?.trim(),
      );
      if (missing) {
        toast.error(
          "Add a description for each selected list or turn on Read & index content.",
        );
        return;
      }
    }
    setSaving(true);
    try {
      const slotsToCreate = trelloLists
        .filter((l) => checkedListIds.has(l.id))
        .map((l) => ({
          source_id: addingToSourceId,
          name: `${selectedBoard.name} > ${l.name}`,
          description: (trelloDescriptions[l.id] || "").trim(),
          tags: [],
          read_content: readContent,
          destination: {
            resource_id: l.id,
            resource_name: `${selectedBoard.name} > ${l.name}`,
            resource_url: selectedBoard.url ?? null,
          },
        }));
      const res = await api.post("/api/v1/slots/bulk", {
        slots: slotsToCreate,
      });
      setSlots((prev) => [...prev, ...res.data]);
      closeModal();
      toast.success(
        `${res.data.length} slot${res.data.length !== 1 ? "s" : ""} created! Indexing in background…`,
      );
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ??
        e?.response?.data?.error ??
        "Could not save slots.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const reindexSlot = async (slot: Slot) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slot.id ? { ...s, index_status: "indexing" } : s,
      ),
    );
    try {
      await api.post(`/api/v1/slots/${slot.id}/reindex`);
      toast.success("Re-indexing started — will update in a few seconds.");
    } catch {
      setSlots((prev) =>
        prev.map((s) =>
          s.id === slot.id ? { ...s, index_status: "failed" } : s,
        ),
      );
      toast.error("Could not start re-indexing.");
    }
  };

  const confirmDelete = async () => {
    if (!slotToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/api/v1/slots/${slotToDelete.id}`);
      setSlots((prev) => prev.filter((s) => s.id !== slotToDelete.id));
      toast.success("Slot removed.");
      setSlotToDelete(null);
    } catch {
      toast.error("Could not remove slot.");
    } finally {
      setDeleting(false);
    }
  };

  const addingSource = sources.find((s) => s.id === addingToSourceId) ?? null;
  const slottedResourceIds = new Set(
    slots
      .filter((s) => s.source_id === addingToSourceId)
      .map((s) => s.destination.resource_id),
  );

  const filteredResources = !resourceSearch.trim()
    ? resources
    : (() => {
        const q = resourceSearch.toLowerCase();
        // Top-level pages whose title matches
        const matchedParentIds = new Set(
          resources
            .filter(
              (r) =>
                !r.parent_id && (r.title ?? r.name).toLowerCase().includes(q),
            )
            .map((r) => r.id),
        );
        // Child pages whose title directly matches (and their parent didn't)
        const matchedChildIds = new Set(
          resources
            .filter(
              (r) =>
                r.parent_id &&
                !matchedParentIds.has(r.parent_id) &&
                (r.title ?? r.name).toLowerCase().includes(q),
            )
            .map((r) => r.id),
        );
        // Keep original order: for each matched parent include it + all its children;
        // then append directly-matched children (whose parent didn't match)
        return resources.filter(
          (r) =>
            matchedParentIds.has(r.id) || // matched top-level page
            (r.parent_id && matchedParentIds.has(r.parent_id)) || // child of matched parent
            matchedChildIds.has(r.id), // directly matched child
        );
      })();

  const toggleTag = (tag: string) =>
    setSlotTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );

  const toggleSourceCollapse = (sourceId: string) => {
    setCollapsedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  };

  const trelloDescriptionsValid =
    readContent ||
    Array.from(checkedListIds).every(
      (id) => (trelloDescriptions[id] || "").trim().length > 0,
    );

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-6 py-8 pt-16 md:pt-8">
        <div className="flex items-baseline justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Slots</h1>
          <span className={`text-sm ${isAdmin ? "text-red-500" : "text-muted-foreground"}`}>
            {slots.length} / {isAdmin ? "∞" : maxSlots}
          </span>
        </div>

        {indexDeleted && (
          <div className="bg-red-950/40 border border-red-900/50 rounded-xl p-4 mb-4 text-sm text-red-300">
            ⚠ Your Pinecone index/API key was deleted. Slots are using the
            shared index. Go to Settings → Vector Index to reconnect.
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : sources.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">
            No sources connected yet.
            <br />
            Go to the Sources tab to add one.
          </p>
        ) : (
          <div className="space-y-8">
            {sources.map((source) => {
              const sourceSlots = slots.filter(
                (s) => s.source_id === source.id,
              );
              const isCollapsed = collapsedSourceIds.has(source.id);
              return (
                <div key={source.id}>
                  {/* Section header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground">
                      {PROVIDER_BADGE[source.provider]}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-foreground text-sm">
                          {source.name}
                        </p>
                        <div className="relative">
                          <button
                            type="button"
                            className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() =>
                              setOpenTooltipId(
                                openTooltipId === source.id ? null : source.id,
                              )
                            }
                            onBlur={() => setOpenTooltipId(null)}
                            aria-label="Slot info">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3.5 w-3.5">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="16" x2="12" y2="12" />
                              <line x1="12" y1="8" x2="12.01" y2="8" />
                            </svg>
                          </button>
                          {openTooltipId === source.id && (
                            <div className="absolute left-0 top-6 z-50 w-64 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                              {PROVIDER_TOOLTIP[source.provider]}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {PROVIDER_LABEL[source.provider]} · {sourceSlots.length}{" "}
                        slot{sourceSlots.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleSourceCollapse(source.id)}>
                      {isCollapsed ? "Expand" : "Collapse"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openAddSlot(source.id)}>
                      + Add
                    </Button>
                  </div>

                  {/* Slot list */}
                  {sourceSlots.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 pl-1">
                      No slots yet. Click + Add to create one.
                    </p>
                  ) : (
                    <div
                      className={`space-y-2 overflow-hidden transition-all duration-300 ease-in-out ${
                        isCollapsed
                          ? "max-h-0 opacity-0"
                          : "max-h-[2000px] opacity-100"
                      }`}>
                      {sourceSlots.map((slot) => {
                        const isBusy =
                          slot.index_status === "pending" ||
                          slot.index_status === "indexing";
                        const isFailed = slot.index_status === "failed";
                        return (
                          <div
                            key={slot.id}
                            className={`flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 ${isBusy ? "opacity-50" : ""}`}>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-foreground truncate">
                                {slot.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {isBusy ? "Indexing…" : slot.index_name ? (slot.index_name === "noteroute-shared" ? "shared index" : slot.index_name) : "not indexed"}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 ml-3">
                              {isBusy ? (
                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                              ) : (
                                <div
                                  className={`h-2 w-2 rounded-full ${isFailed ? "bg-red-500" : "bg-green-500"}`}
                                />
                              )}
                              {!isBusy && (
                                <button
                                  onClick={() => reindexSlot(slot)}
                                  title="Re-read & re-index content"
                                  className="text-muted-foreground hover:text-primary transition-colors text-xs">
                                  ↺
                                </button>
                              )}
                              <button
                                onClick={() => setSlotToDelete(slot)}
                                className="text-muted-foreground hover:text-destructive transition-colors">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete slot confirmation dialog */}
      <Dialog
        open={!!slotToDelete}
        onOpenChange={(open) => !open && setSlotToDelete(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Remove slot</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove{" "}
            <span className="text-foreground font-medium">
              "{slotToDelete?.name}"
            </span>
            ? This cannot be undone.
          </p>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setSlotToDelete(null)}
              disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={confirmDelete}
              disabled={deleting}>
              {deleting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Removing…
                </span>
              ) : (
                "Remove"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add slot dialog */}
      <Dialog
        open={!!addingToSourceId}
        onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add slot to {addingSource?.name}</DialogTitle>
          </DialogHeader>

          {resourcesLoading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">
                Loading resources…
              </p>
            </div>
          ) : addingSource?.provider === "google" && !selectedResource ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <p className="text-sm text-muted-foreground text-center">
                Choose a Google Doc using the Drive file picker.
              </p>
              <Button
                onClick={() => launchGooglePicker(addingToSourceId!)}
                disabled={pickerLoading}
              >
                {pickerLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Opening…
                  </span>
                ) : (
                  "Choose from Google Drive"
                )}
              </Button>
            </div>
          ) : selectedBoard && !selectedResource ? (
            // Trello step 2: list picker
            <div className="space-y-3">
              <button
                onClick={() => {
                  setSelectedBoard(null);
                  setTrelloLists([]);
                  setCheckedListIds(new Set());
                  setTrelloDescriptions({});
                }}
                className="w-full flex items-center justify-between rounded-lg bg-muted px-3 py-2.5 text-sm">
                <span className="font-semibold text-foreground">
                  {selectedBoard.name}
                </span>
                <span className="text-muted-foreground text-xs">← Back</span>
              </button>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                Choose lists
              </Label>
              <p className="text-xs text-muted-foreground">
                Description per list ({readContent ? "optional" : "required"})
              </p>
              {trelloListsLoading ? (
                <div className="flex justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {trelloLists.map((lst) => {
                    const checked = checkedListIds.has(lst.id);
                    const alreadyAdded = slottedResourceIds.has(lst.id);
                    return (
                      <div key={lst.id} className="space-y-2">
                        <button
                          onClick={() => {
                            if (alreadyAdded) return;
                            setCheckedListIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(lst.id)) next.delete(lst.id);
                              else next.add(lst.id);
                              return next;
                            });
                            setTrelloDescriptions((prev) => {
                              const next = { ...prev };
                              if (checked) delete next[lst.id];
                              return next;
                            });
                          }}
                          disabled={alreadyAdded}
                          className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                            alreadyAdded
                              ? "opacity-40 cursor-default"
                              : "hover:bg-accent cursor-pointer"
                          }`}>
                          <span className="text-foreground">{lst.name}</span>
                          {alreadyAdded ? (
                            <span className="text-xs text-muted-foreground">
                              Added
                            </span>
                          ) : checked ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                          )}
                        </button>
                        {checked && !alreadyAdded && (
                          <textarea
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[70px] resize-none"
                            value={trelloDescriptions[lst.id] ?? ""}
                            onChange={(e) =>
                              setTrelloDescriptions((prev) => ({
                                ...prev,
                                [lst.id]: e.target.value,
                              }))
                            }
                            placeholder="Description for this list"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Tags — applied to all created slots */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                  Tags{" "}
                  <span className="normal-case font-normal">
                    (optional, applied to all slots)
                  </span>
                </Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_TAGS.map((tag) => {
                    const active = slotTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                          active
                            ? "bg-foreground text-background border-foreground"
                            : "bg-muted text-muted-foreground border-transparent hover:border-muted-foreground"
                        }`}>
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Add custom tag…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const t = tagInput.trim().toLowerCase();
                        if (t && !slotTags.includes(t))
                          setSlotTags((prev) => [...prev, t]);
                        setTagInput("");
                      }
                    }}
                  />
                </div>
                {slotTags.filter((t) => !PRESET_TAGS.includes(t)).length >
                  0 && (
                  <div className="flex flex-wrap gap-2">
                    {slotTags
                      .filter((t) => !PRESET_TAGS.includes(t))
                      .map((tag) => (
                        <button
                          key={tag}
                          onClick={() =>
                            setSlotTags((prev) =>
                              prev.filter((t2) => t2 !== tag),
                            )
                          }
                          className="rounded-full px-2 py-1 text-xs font-medium bg-foreground text-background border border-foreground flex items-center gap-1">
                          {tag} <X className="h-3 w-3" />
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* Read & index toggle — same as non-Trello flow */}
              <div className="flex items-center justify-between rounded-lg bg-muted p-4 gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    Read & index content
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    NoteRoute will read each list once to build a richer index.
                    Content is summarised and not stored beyond the embedding.
                    If Read & index content is off, a description is required.
                  </p>
                </div>
                <button
                  onClick={() => setReadContent((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${readContent ? "bg-green-500" : "bg-muted-foreground/30"}`}
                  role="switch"
                  aria-checked={readContent}>
                  <span
                    className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${readContent ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
              </div>

              <Button
                className="w-full"
                onClick={saveTrelloSlots}
                disabled={
                  checkedListIds.size === 0 ||
                  saving ||
                  !trelloDescriptionsValid
                }>
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Saving…
                  </span>
                ) : (
                  `Add ${checkedListIds.size > 0 ? checkedListIds.size + " " : ""}slot${checkedListIds.size !== 1 ? "s" : ""}`
                )}
              </Button>
            </div>
          ) : !selectedResource ? (
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                Choose a resource
              </Label>
              <Input
                placeholder="Search…"
                value={resourceSearch}
                onChange={(e) => setResourceSearch(e.target.value)}
              />
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {filteredResources.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {resourceSearch
                      ? "No matches."
                      : "No resources found in this source."}
                  </p>
                ) : (
                  filteredResources.map((r) => {
                    const alreadyAdded = slottedResourceIds.has(r.id);
                    return (
                      <button
                        key={r.id}
                        onClick={async () => {
                          if (alreadyAdded) return;
                          const source = sources.find(
                            (s) => s.id === addingToSourceId,
                          );
                          if (source?.provider === "trello") {
                            setSelectedBoard(r);
                            setCheckedListIds(new Set());
                            setTrelloDescriptions({});
                            setTrelloListsLoading(true);
                            try {
                              const res = await api.get(
                                `/api/v1/sources/${addingToSourceId}/resources/${r.id}/children`,
                              );
                              setTrelloLists(res.data);
                            } catch {}
                            setTrelloListsLoading(false);
                          } else {
                            setSelectedResource(r);
                            setSlotName(r.name);
                            setProjectSections([]);
                            if (source?.provider === "todoist") {
                              setSectionsLoading(true);
                              try {
                                const res = await api.get(
                                  `/api/v1/sources/${addingToSourceId}/resources/${r.id}/children`,
                                );
                                setProjectSections(res.data);
                              } catch {}
                              setSectionsLoading(false);
                            }
                          }
                        }}
                        disabled={alreadyAdded}
                        className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                          alreadyAdded
                            ? "opacity-40 cursor-default"
                            : "hover:bg-accent cursor-pointer"
                        }`}>
                        <span
                          className={`text-foreground${!r.parent_id ? " underline" : ""}`}>
                          {r.name}
                        </span>
                        {alreadyAdded && (
                          <span className="text-xs text-muted-foreground">
                            Added
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selected resource */}
              <button
                onClick={() => {
                  setSelectedResource(null);
                  setProjectSections([]);
                }}
                className="w-full flex items-center justify-between rounded-lg bg-muted px-3 py-2.5 text-sm">
                <span className="font-semibold text-foreground">
                  {selectedResource.name}
                </span>
                <span className="text-muted-foreground text-xs">Change</span>
              </button>

              {/* Sections preview for Todoist projects */}
              {sectionsLoading ? (
                <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                  Loading sections…
                </div>
              ) : projectSections.length > 0 ? (
                <div className="rounded-lg bg-muted px-3 py-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                    Sections also embedded
                  </p>
                  {projectSections.map((s) => (
                    <p key={s.id} className="text-sm text-muted-foreground">
                      · {s.name}
                    </p>
                  ))}
                </div>
              ) : null}

              {/* Description */}
              <div className="space-y-1.5">
                <Label>
                  Description{" "}
                  <span className="text-muted-foreground font-normal">
                    ({readContent ? "optional" : "required"})
                  </span>
                </Label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px] resize-none"
                  value={slotDescription}
                  onChange={(e) => setSlotDescription(e.target.value)}
                  placeholder="What kind of notes go here?"
                />
                {!readContent && (
                  <p className="text-xs text-muted-foreground">
                    Required when Read & index content is off.
                  </p>
                )}
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label>
                  Tags{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_TAGS.map((tag) => {
                    const active = slotTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                          active
                            ? "bg-foreground text-background border-foreground"
                            : "bg-muted text-muted-foreground border-transparent hover:border-muted-foreground"
                        }`}>
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Add custom tag…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const t = tagInput.trim().toLowerCase();
                        if (t && !slotTags.includes(t))
                          setSlotTags((prev) => [...prev, t]);
                        setTagInput("");
                      }
                    }}
                  />
                </div>
                {/* Custom tags */}
                {slotTags.filter((t) => !PRESET_TAGS.includes(t)).length >
                  0 && (
                  <div className="flex flex-wrap gap-2">
                    {slotTags
                      .filter((t) => !PRESET_TAGS.includes(t))
                      .map((tag) => (
                        <button
                          key={tag}
                          onClick={() =>
                            setSlotTags((prev) =>
                              prev.filter((t2) => t2 !== tag),
                            )
                          }
                          className="rounded-full px-2 py-1 text-xs font-medium bg-foreground text-background border border-foreground flex items-center gap-1">
                          {tag} <X className="h-3 w-3" />
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* Read content toggle */}
              <div className="flex items-center justify-between rounded-lg bg-muted p-4 gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    Read & index content
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    NoteRoute will read this resource once to build a richer
                    index. Content is summarised and not stored beyond the
                    embedding. If Read & index content is off, a description is
                    required.
                  </p>
                </div>
                <button
                  onClick={() => setReadContent((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${readContent ? "bg-green-500" : "bg-muted-foreground/30"}`}
                  role="switch"
                  aria-checked={readContent}>
                  <span
                    className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${readContent ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
              </div>

              <Button
                className="w-full"
                onClick={saveSlot}
                disabled={
                  !slotName.trim() ||
                  saving ||
                  (!readContent && !slotDescription.trim())
                }>
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Saving…
                  </span>
                ) : (
                  "Save slot"
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
