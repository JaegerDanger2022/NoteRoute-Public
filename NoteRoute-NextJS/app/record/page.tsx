"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Camera, X, Check, ChevronDown, Plus, Type, ScanSearch, ScanText, Pencil } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useSourceStore, Source } from "@/store/sourceStore";
import { useUIStore } from "@/store/uiStore";
import { api, API_BASE_URL } from "@/lib/api";
import { AppShell } from "@/components/layout/AppShell";
import { CircularWaveform } from "@/components/ui/circular-waveform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";

/** Convert Tiptap JSON/HTML to markdown for the backend. */
function tiptapHtmlToMarkdown(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  function nodeToMd(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = Array.from(el.childNodes).map(nodeToMd).join("");
    if (tag === "strong") return `**${inner}**`;
    if (tag === "em") return `_${inner}_`;
    if (tag === "u") return `__${inner}__`;
    if (tag === "h1") return `# ${inner}\n`;
    if (tag === "h2") return `## ${inner}\n`;
    if (tag === "li") return `- ${inner}\n`;
    if (tag === "ul" || tag === "ol") return inner;
    if (tag === "br") return "\n";
    if (tag === "p") {
      const t = inner.trim();
      return t ? t + "\n" : "\n";
    }
    return inner;
  }
  return Array.from(div.childNodes).map(nodeToMd).join("").trim();
}

/** Apply a block-level format to the current selection inside the editor. */
function applyBlockFormat(tag: "h1" | "h2" | "h3" | "p" | "li") {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);

  // Find the closest block ancestor inside the editor
  let block: Node | null = range.commonAncestorContainer;
  while (block && block.nodeType !== Node.ELEMENT_NODE)
    block = block.parentNode;
  while (
    block &&
    !["DIV", "P", "H1", "H2", "H3", "LI", "UL", "OL"].includes(
      (block as HTMLElement).tagName,
    )
  ) {
    block = block.parentNode;
  }
  if (!block) return;

  const el = block as HTMLElement;
  // If already that tag, toggle back to paragraph
  const currentTag = el.tagName.toLowerCase();
  const targetTag = currentTag === tag ? "p" : tag;

  if (targetTag === "li") {
    // Wrap in ul if not already inside one
    document.execCommand("insertUnorderedList", false);
  } else {
    document.execCommand("formatBlock", false, targetTag);
  }
}

type PipelineStatus =
  | "idle"
  | "recording"
  | "uploading"
  | "transcribing"
  | "embedding"
  | "searching"
  | "ranking"
  | "awaiting_confirmation"
  | "delivering"
  | "delivered"
  | "failed";

type RankedSlot = {
  slot_id: string;
  slot_name: string;
  integration_type: string;
  resource_id: string;
  score_combined: number;
};

type DocTab = { tab_id: string; tab_title: string };

const PROVIDER_LABEL: Record<string, string> = {
  notion: "Notion",
  google: "Google Docs",
  slack: "Slack",
  todoist: "Todoist",
  trello: "Trello",
};

const CREATE_DOC_NOUN: Record<string, string> = {
  notion: "page",
  google: "doc",
  slack: "message",
  todoist: "task",
  trello: "card",
};

const TOOLBAR_ITEMS = [
  { label: "B", prefix: "**", suffix: "**" },
  { label: "I", prefix: "_", suffix: "_" },
  { label: "• List", prefix: "\n- ", suffix: "" },
  { label: "# H1", prefix: "# ", suffix: "" },
  { label: "## H2", prefix: "## ", suffix: "" },
];

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseFailReason(rawError: string | null | undefined): string | null {
  if (!rawError) return null;
  const e = rawError.toLowerCase();
  if (e.includes("429") || e.includes("too many requests") || e.includes("rate limit") || e.includes("quota") || e.includes("insufficient_quota") || e.includes("credits")) {
    return "Your AI model key has run out of credits or hit its rate limit.";
  }
  if (e.includes("401") || e.includes("unauthorized") || e.includes("invalid api key") || e.includes("authentication")) {
    return "Your AI model API key is invalid or was revoked.";
  }
  return null; // generic — no specific hint
}

export default function RecordPage() {
  const { user, loading: authLoading, signOut } = useAuthStore();
  const {
    sources,
    activeSourceId,
    fetchSources,
    setActiveSource,
    reset: resetSources,
  } = useSourceStore();

  // Pipeline state
  const [status, setStatus] = useState<PipelineStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [rankedSlots, setRankedSlots] = useState<RankedSlot[]>([]);
  const [runId, setRunId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [deliveredSlot, setDeliveredSlot] = useState("");
  const [savedAsNewSlot, setSavedAsNewSlot] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [failReason, setFailReason] = useState<string | null>(null);
  const [editingTranscript, setEditingTranscript] = useState(false);

  // Input mode
  const [inputMode, setInputMode] = useState<"voice" | "text" | "image">(
    "voice",
  );

  // Image mode state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [extractionMode, setExtractionMode] = useState<"ocr" | "vision">(
    "vision",
  );
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [textNote, setTextNote] = useState(""); // markdown string sent to backend
  const [, setEditorTick] = useState(0);
  const tiptap = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder: "Write your note here…" }),
    ],
    content: "",
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      setTextNote(tiptapHtmlToMarkdown(editor.getHTML()));
    },
    // Re-render on every transaction so toolbar active states update immediately
    onTransaction: () => setEditorTick((t) => t + 1),
  });

  // Source selector
  const [sourceSelectorOpen, setSourceSelectorOpen] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");

  // Tab picker (Google Docs multi-tab)
  const [tabPickerOpen, setTabPickerOpen] = useState(false);
  const [availableTabs, setAvailableTabs] = useState<DocTab[]>([]);
  const [pendingSlot, setPendingSlot] = useState<RankedSlot | null>(null);
  const [tabsFetching, setTabsFetching] = useState(false);

  // Trello card picker
  const [trelloCardPickerOpen, setTrelloCardPickerOpen] = useState(false);
  const [availableTrelloCards, setAvailableTrelloCards] = useState<
    { id: string; name: string }[]
  >([]);
  const [trelloCardsFetching, setTrelloCardsFetching] = useState(false);
  const [pendingTrelloCardId, setPendingTrelloCardId] = useState<string | null>(
    null,
  );
  const [trelloChecklistTitleOpen, setTrelloChecklistTitleOpen] =
    useState(false);
  const [trelloChecklistTitle, setTrelloChecklistTitle] = useState("");
  // Trello card content preview
  const [trelloCardPreviewOpen, setTrelloCardPreviewOpen] = useState(false);
  const [trelloCardDetail, setTrelloCardDetail] = useState<{
    id: string;
    name: string;
    desc: string;
    url?: string;
    labels?: { name: string; color: string }[];
    due?: string | null;
    due_complete?: boolean;
    members?: { name: string; initials: string }[];
    cover_color?: string | null;
    comment_count?: number;
    attachment_count?: number;
    checklists: {
      id: string;
      name: string;
      items: { name: string; complete: boolean }[];
    }[];
  } | null>(null);
  const [trelloCardDetailFetching, setTrelloCardDetailFetching] =
    useState(false);

  // Name dialog — used both for save-as-new-slot and create-doc mode
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [pendingDocTitle, setPendingDocTitle] = useState("");
  const [notionPages, setNotionPages] = useState<{ id: string; name: string }[]>([]);
  const [notionParentPageId, setNotionParentPageId] = useState<string>("");

  // Create-doc mode — reuses the existing record/text UI, title sheet, and name dialog
  const [createDocMode, setCreateDocMode] = useState(false);
  const [googleWriteConfirmOpen, setGoogleWriteConfirmOpen] = useState(false);
  const pendingGoogleUpgradeRef = useRef<(() => void) | null>(null);
  const pendingAudioKeyRef = useRef<string>(""); // holds s3_key between upload and title confirmation
  const pendingTextRef = useRef<string>(""); // holds typed text between submit and title confirmation
  const pendingImageKeyRef = useRef<string>(""); // holds image s3_key between upload and title confirmation
  const isCreateDocFlowRef = useRef(false); // true while saveCreateDoc is in progress (survives dialog close)

  // Settings
  const { openSignOut } = useUIStore();

  // Audio recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [waveformSamples, setWaveformSamples] = useState<number[]>(Array(60).fill(0));

  // Recording time limit
  const [userTier, setUserTier] = useState<string>("free");
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const timeLimitIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchSources();
    api.get("/api/v1/users/me").then((res) => {
      setUserTier(res.data.tier ?? "free");
    }).catch(() => {});
  }, [authLoading, user]);

  const activeSource = sources.find((s) => s.id === activeSourceId) ?? null;
  const filteredSources = sourceSearch
    ? sources.filter(
        (s) =>
          s.name.toLowerCase().includes(sourceSearch.toLowerCase()) ||
          PROVIDER_LABEL[s.provider]
            ?.toLowerCase()
            .includes(sourceSearch.toLowerCase()),
      )
    : sources;

  // ── SSE parsing ────────────────────────────────────────────────────────────

  const handleSSEPayload = useCallback(
    (payload: Record<string, any>, currentRankedSlots: RankedSlot[]) => {
      const node = payload.node;
      if (payload.error) {
        setFailReason(parseFailReason(payload.error));
        setStatus("failed");
        return;
      }
      if (node === "transcribe" || node === "image_extract") {
        if (payload.transcript) setTranscript(payload.transcript);
        setStatus("embedding");
      }
      if (node === "embed") {
        setStatus("searching");
      }
      if (node === "search") {
        setStatus("ranking");
      }
      if (node === "rank" && payload.ranked_slots) {
        setRankedSlots(payload.ranked_slots);
        setStatus("awaiting_confirmation");
      }
      if (node === "deliver") {
        if (payload.delivery_status === "delivered") {
          const isSaved = payload.saved_as_new_slot === true;
          setSavedAsNewSlot(isSaved);
          setDeliveredSlot(
            isSaved
              ? (payload.slot_name ?? "new slot")
              : (currentRankedSlots.find((s) => s.slot_id === payload.slot_id)
                  ?.slot_name ?? "slot"),
          );
          setStatus("delivered");
        } else {
          setFailReason(parseFailReason(payload.delivery_error));
          setStatus("failed");
        }
      }
    },
    [],
  );

  const consumeSSEStream = async (
    response: Response,
    currentRankedSlots: RankedSlot[],
  ) => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let capturedRunId = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const payload = JSON.parse(line.slice(6));
          if (payload.run_id && !capturedRunId) {
            capturedRunId = payload.run_id;
            setRunId(capturedRunId);
          }
          if (payload.route_id) {
            setRouteId(payload.route_id);
          }
          handleSSEPayload(payload, currentRankedSlots);
        } catch {}
      }
    }
  };

  // ── Voice recording ─────────────────────────────────────────────────────────

  const startRecording = async () => {
    if (!activeSourceId) {
      toast.error("Please select a source before recording.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;

      // Wire up AnalyserNode for waveform visualization
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const BAR_COUNT = 60;
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        const step = Math.floor(bufferLength / BAR_COUNT);
        const samples = Array.from({ length: BAR_COUNT }, (_, i) => {
          const val = dataArray[i * step] ?? 0;
          return val / 255;
        });
        setWaveformSamples(samples);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);

      // Start time limit countdown
      const maxSecs = userTier === "pro" || userTier === "team" ? 15 * 60 : 5 * 60;
      const warnAt = Math.floor(maxSecs * 0.2);
      setTimeRemaining(maxSecs);
      let secsLeft = maxSecs;
      let warned = false;
      timeLimitIntervalRef.current = setInterval(() => {
        secsLeft -= 1;
        if (secsLeft <= warnAt && !warned) {
          warned = true;
          toast.warning(`Only ${formatTime(secsLeft)} remaining!`, { duration: 4000 });
        }
        if (secsLeft <= 0) {
          if (timeLimitIntervalRef.current !== null) {
            clearInterval(timeLimitIntervalRef.current);
            timeLimitIntervalRef.current = null;
          }
          setTimeRemaining(null);
          stopAndProcess();
          return;
        }
        setTimeRemaining(secsLeft);
      }, 1000);

      setStatus("recording");
      setTranscript("");
      setRankedSlots([]);
      setRunId("");
      setDeliveredSlot("");
      setSavedAsNewSlot(false);
    } catch {
      toast.error("Could not access microphone.");
    }
  };

  const stopTimeLimitInterval = () => {
    if (timeLimitIntervalRef.current !== null) {
      clearInterval(timeLimitIntervalRef.current);
      timeLimitIntervalRef.current = null;
    }
    setTimeRemaining(null);
  };

  const stopWaveform = () => {
    stopTimeLimitInterval();
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    analyserRef.current = null;
    setWaveformSamples(Array(60).fill(0));
  };

  const stopAndProcess = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    stopWaveform();
    if (createDocMode) isCreateDocFlowRef.current = true;
    setStatus("uploading");

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    });
    mediaRecorderRef.current = null;

    try {
      const audioBlob = new Blob(audioChunksRef.current, {
        type: "audio/webm",
      });

      // 1. Check Google write permission (if needed)
      if (activeSource?.provider === "google") {
        try {
          const res = await api.get("/api/v1/integrations/google/has-write");
          if (!res.data.has_write) {
            setStatus("idle");
            pendingGoogleUpgradeRef.current = async () => {
              const upgradeRes = await api.get(
                "/api/v1/integrations/google/upgrade-write?platform=web",
              );
              if (upgradeRes.data.url)
                window.open(upgradeRes.data.url, "_blank");
            };
            setGoogleWriteConfirmOpen(true);
            return;
          }
        } catch {}
      }

      // 2. Get presigned S3 URL
      const presignRes = await api.post("/api/v1/voice/presign", {
        content_type: "audio/webm",
      });
      const { upload_url, s3_key } = presignRes.data;

      // 3. Upload directly to S3
      const uploadRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": "audio/webm" },
        body: audioBlob,
      });
      if (!uploadRes.ok)
        throw new Error(`S3 upload failed: ${uploadRes.status}`);

      // 4a. Create-doc mode: show name dialog, actual API call happens on confirm
      if (createDocMode) {
        pendingAudioKeyRef.current = s3_key;
        isCreateDocFlowRef.current = true;
        setStatus("idle");
        setPendingDocTitle("");
        setNameDialogOpen(true);
        return;
      }

      // 4b. Kick off SSE stream
      setStatus("transcribing");
      const token = await user!.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/v1/process/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ audio_s3_key: s3_key, audio_duration_sec: 0 }),
      });

      if (!response.ok || !response.body) {
        setStatus("failed");
        return;
      }
      await consumeSSEStream(response, rankedSlots);
    } catch (e) {
      console.error(e);
      setStatus("failed");
    }
  };

  const cancelRecording = () => {
    stopWaveform();
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setStatus("idle");
  };

  const handleRecordButton = () => {
    if (status === "idle") startRecording();
    else if (status === "recording") stopAndProcess();
  };

  // ── Text submit ─────────────────────────────────────────────────────────────

  const submitText = async () => {
    const md = tiptap ? tiptapHtmlToMarkdown(tiptap.getHTML()) : textNote;
    const trimmed = md.trim();
    if (!trimmed) return;
    if (!activeSourceId) {
      toast.error("Please select a source first.");
      return;
    }

    if (activeSource?.provider === "google") {
      try {
        const res = await api.get("/api/v1/integrations/google/has-write");
        if (!res.data.has_write) {
          pendingGoogleUpgradeRef.current = async () => {
            const upgradeRes = await api.get(
              "/api/v1/integrations/google/upgrade-write?platform=web",
            );
            if (upgradeRes.data.url) window.open(upgradeRes.data.url, "_blank");
          };
          setGoogleWriteConfirmOpen(true);
          return;
        }
      } catch {}
    }

    // Create-doc mode: show name dialog, actual API call happens on confirm
    if (createDocMode) {
      pendingTextRef.current = trimmed;
      isCreateDocFlowRef.current = true;
      setPendingDocTitle("");
      setNameDialogOpen(true);
      return;
    }

    setStatus("searching");
    try {
      const token = await user!.getIdToken();
      const response = await fetch(
        `${API_BASE_URL}/api/v1/process/text-stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({ text: trimmed }),
        },
      );
      if (!response.ok || !response.body) {
        setStatus("failed");
        return;
      }
      await consumeSSEStream(response, []);
    } catch (e) {
      console.error(e);
      setStatus("failed");
    }
  };

  // ── Slot confirmation ────────────────────────────────────────────────────────

  const confirmSlot = async (
    slotId: string,
    tabId: string | null = null,
    trelloFormat: string = "note",
    trelloChecklistTitleVal: string = "",
    trelloChecklistIdVal: string = "",
  ) => {
    setStatus("delivering");
    try {
      const res = await api.post("/api/v1/process/confirm", {
        run_id: runId,
        confirmed_slot_id: slotId,
        save_as_slot: false,
        target_tab_id: tabId,
        transcript: transcript || undefined,
        trello_format: trelloFormat,
        trello_checklist_title: trelloChecklistTitleVal || undefined,
        trello_checklist_id: trelloChecklistIdVal || undefined,
      });
      if (res.data.delivery_status === "delivered") {
        setDeliveredSlot(
          rankedSlots.find((s) => s.slot_id === slotId)?.slot_name ?? "slot",
        );
        setSavedAsNewSlot(false);
        setStatus("delivered");
      } else {
        setFailReason(parseFailReason(res.data.delivery_error));
        setStatus("failed");
      }
    } catch {
      setFailReason(null);
      setStatus("failed");
    }
  };

  const onSelectSlot = async (slot: RankedSlot) => {
    if (slot.integration_type === "google" && slot.resource_id) {
      setPendingSlot(slot);
      setTabsFetching(true);
      setTabPickerOpen(true);
      try {
        const res = await api.get(`/api/v1/gdocs/${slot.resource_id}/tabs`);
        setAvailableTabs(res.data.tabs ?? []);
      } catch {
        setAvailableTabs([{ tab_id: "", tab_title: "Document" }]);
      } finally {
        setTabsFetching(false);
      }
    } else if (slot.integration_type === "trello" && slot.resource_id) {
      setPendingSlot(slot);
      setTrelloCardsFetching(true);
      setTrelloCardPickerOpen(true);
      try {
        const res = await api.get(`/api/v1/trello/${slot.resource_id}/cards`);
        setAvailableTrelloCards(res.data.cards ?? []);
      } catch {
        setAvailableTrelloCards([]);
      } finally {
        setTrelloCardsFetching(false);
      }
    } else {
      await confirmSlot(slot.slot_id);
    }
  };

  const saveAsNewSlot = async (docTitle: string) => {
    setStatus("delivering");
    try {
      const res = await api.post("/api/v1/process/confirm", {
        run_id: runId,
        confirmed_slot_id: null,
        save_as_slot: true,
        doc_title: docTitle.trim() || undefined,
        transcript: transcript || undefined,
        notion_parent_page_id: notionParentPageId || undefined,
      });
      if (res.data.delivery_status === "delivered") {
        setDeliveredSlot(docTitle.trim() || "new slot");
        setSavedAsNewSlot(true);
        setStatus("delivered");
      } else {
        setFailReason(parseFailReason(res.data.delivery_error));
        setStatus("failed");
      }
    } catch {
      setFailReason(null);
      setStatus("failed");
    }
  };

  // Called when user confirms the title in the name dialog while in create-doc mode
  const saveCreateDoc = async (docTitle: string) => {
    isCreateDocFlowRef.current = true;
    const hasMedia = !!(pendingAudioKeyRef.current || pendingImageKeyRef.current);
    // Show extraction step first if there's audio/image to process, else go straight to delivering
    setStatus(hasMedia ? "transcribing" : "delivering");
    try {
      const body: Record<string, string> = { doc_title: docTitle.trim() };
      if (activeSourceId) body.source_id = activeSourceId;
      if (pendingAudioKeyRef.current) {
        body.audio_s3_key = pendingAudioKeyRef.current;
      } else if (pendingImageKeyRef.current) {
        body.image_s3_key = pendingImageKeyRef.current;
        body.extraction_mode = extractionMode;
      } else {
        body.content = pendingTextRef.current;
      }
      // Extraction takes most of the time (~60s for vision). Flip to "Creating page"
      // only in the last ~5s by setting a timer for 85% of the 180s timeout — but in
      // practice we just switch 8s before we'd give up, so it almost always shows
      // "Extracting" for the bulk of the wait and "Creating page" only briefly at the end.
      const deliverTimer = hasMedia
        ? setTimeout(() => setStatus("delivering"), 60_000)
        : null;
      const res = await api.post("/api/v1/process/create-doc", body, { timeout: 180_000 });
      if (deliverTimer) clearTimeout(deliverTimer);
      pendingAudioKeyRef.current = "";
      pendingTextRef.current = "";
      pendingImageKeyRef.current = "";
      setTextNote("");
      tiptap?.commands.clearContent();
      if (res.data.transcript) setTranscript(res.data.transcript);
      setDeliveredSlot(res.data.slot_name ?? (docTitle.trim() || "new doc"));
      setSavedAsNewSlot(true);
      setCreateDocMode(false);
      isCreateDocFlowRef.current = false;
      setStatus("delivered");
    } catch (e: any) {
      isCreateDocFlowRef.current = false;
      toast.error(
        e?.response?.data?.detail ??
          e?.response?.data?.error ??
          "Could not create document.",
      );
      setStatus("idle");
    }
  };

  const reset = () => {
    setStatus("idle");
    setTranscript("");
    setTextNote("");
    tiptap?.commands.clearContent();
    setRankedSlots([]);
    setRunId("");
    setRouteId("");
    setDeliveredSlot("");
    setSavedAsNewSlot(false);
    setFailReason(null);
    setEditingTranscript(false);
    setPendingSlot(null);
    setAvailableTabs([]);
    setTabPickerOpen(false);
    setTrelloCardPreviewOpen(false);
    setTrelloCardDetail(null);
    setTrelloChecklistTitleOpen(false);
    setTrelloChecklistTitle("");
    setCreateDocMode(false);
    pendingAudioKeyRef.current = "";
    pendingTextRef.current = "";
    pendingImageKeyRef.current = "";
    setImageFile(null);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
  };

  const onImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(URL.createObjectURL(file));
    // Reset the input so the same file can be re-selected if needed
    e.target.value = "";
  };

  const submitImage = async () => {
    if (!imageFile || !activeSource) return;
    if (createDocMode) isCreateDocFlowRef.current = true;
    setStatus("uploading");
    try {
      // 1. Get presigned upload URL
      const mimeType = imageFile.type || "image/jpeg";
      const presignRes = await api.post(
        `/api/v1/voice/image-presign?content_type=${encodeURIComponent(mimeType)}`,
      );
      const { upload_url, s3_key } = presignRes.data;

      // 2. Upload image directly to S3
      await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: imageFile,
      });

      // 3a. Create-doc mode: show name dialog, actual API call happens on confirm
      if (createDocMode) {
        pendingImageKeyRef.current = s3_key;
        isCreateDocFlowRef.current = true;
        setStatus("idle");
        setPendingDocTitle("");
        setNameDialogOpen(true);
        return;
      }

      // 3b. Kick off SSE image pipeline
      setStatus("transcribing");
      const token = await user!.getIdToken();
      const response = await fetch(
        `${API_BASE_URL}/api/v1/process/image-stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            image_s3_key: s3_key,
            extraction_mode: extractionMode,
          }),
        },
      );

      const currentRankedSlots: RankedSlot[] = [];
      await consumeSSEStream(response, currentRankedSlots);
    } catch (e: any) {
      console.error("[SSE/image] fetch error:", e?.message ?? e);
      // ERR_HTTP2_PROTOCOL_ERROR can fire even after delivery completes — don't
      // override a successful delivered/awaiting_confirmation state.
      setStatus((prev) =>
        prev === "delivered" || prev === "awaiting_confirmation" ? prev : "failed"
      );
    }
  };

  const retryDelivery = async () => {
    if (!routeId) return;
    setRetrying(true);
    try {
      await api.post(`/api/v1/routes/${routeId}/retry`);
      setDeliveredSlot(rankedSlots[0]?.slot_name ?? "slot");
      setSavedAsNewSlot(false);
      setStatus("delivered");
    } catch {
      // stays failed — user can try again or go to history
    } finally {
      setRetrying(false);
    }
  };

  // ── Settings — fetch data whenever the dialog opens ──────────────────────────

  const isProcessing = [
    "uploading",
    "transcribing",
    "embedding",
    "searching",
    "ranking",
    "delivering",
  ].includes(status);
  const isIdle = status === "idle" || status === "recording";

  return (
    <AppShell>
      <div className="max-w-xl mx-auto px-6 py-8 pt-16 md:pt-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center">
          <h1 className="text-2xl font-bold text-foreground">
            {inputMode === "voice"
              ? "Voice Note"
              : inputMode === "text"
                ? "Text Note"
                : "Image Note"}
          </h1>
        </div>

        {/* Source selector */}
        <button
          onClick={() => setSourceSelectorOpen(true)}
          className={`w-full flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-accent ${
            !activeSource ? "border-dashed border-muted" : "border-border"
          }`}>
          {activeSource ? (
            <div>
              <p className="text-xs text-muted-foreground">Routing to</p>
              <p className="font-semibold text-foreground">
                {activeSource.name}
              </p>
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">
              Select a source to route to
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>

        {/* Input mode tabs */}
        {isIdle && (
          <div className="flex rounded-lg bg-muted p-1 gap-1">
            {(
              [
                { mode: "voice", label: "Voice", Icon: Mic },
                { mode: "text", label: "Text", Icon: Type },
                { mode: "image", label: "Image", Icon: Camera },
              ] as const
            ).map(({ mode, label, Icon }) => (
              <button
                key={mode}
                onClick={() => setInputMode(mode)}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  inputMode === mode
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}>
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Voice panel */}
        {inputMode === "voice" && isIdle && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="relative flex items-center justify-center">
              {status === "recording" && (
                <div className="absolute pointer-events-none text-red-500">
                  <CircularWaveform
                    samples={waveformSamples}
                    barCount={60}
                    barWidth={2.5}
                    barColor="currentColor"
                    waveAmplitude={36}
                    radius={82}
                    size={220}
                    barMinHeight={3}
                    strokeLinecap="round"
                    growOutwardsOnly={true}
                  />
                </div>
              )}
              <button
                onClick={handleRecordButton}
                disabled={!activeSource && status === "idle"}
                className={`relative z-10 h-36 w-36 rounded-full border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                  status === "recording"
                    ? "border-red-500 bg-red-950/30"
                    : !activeSource
                      ? "border-muted opacity-40 cursor-not-allowed bg-card"
                      : "border-border bg-card hover:bg-accent cursor-pointer"
                }`}>
                {status === "recording" ? (
                  <Square className="h-10 w-10 fill-current" />
                ) : (
                  <Mic className="h-10 w-10" />
                )}
                <span className="text-xs text-muted-foreground">
                  {status === "recording"
                    ? "Tap to stop"
                    : activeSource
                      ? "Tap to record"
                      : "Select a source first"}
                </span>
              </button>
            </div>
            {/* Time limit counter + cancel button */}
            {status === "recording" && (
              <div className="flex flex-col items-center gap-2">
                {timeRemaining !== null && (() => {
                  const maxSecs = userTier === "pro" || userTier === "team" ? 15 * 60 : 5 * 60;
                  const warnAt = Math.floor(maxSecs * 0.2);
                  const isWarning = timeRemaining <= warnAt;
                  return (
                    <span className={`text-sm font-mono tabular-nums ${isWarning ? "text-orange-400 animate-pulse" : "text-muted-foreground"}`}>
                      {formatTime(timeRemaining)} remaining
                    </span>
                  );
                })()}
                <button
                  onClick={cancelRecording}
                  className="text-sm text-red-400 border border-red-900/50 bg-red-950/20 rounded-lg px-4 py-2 hover:bg-red-950/40 transition-colors flex items-center gap-1.5">
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              </div>
            )}
            {/* Create new doc — below record button, matching mobile layout */}
            {activeSource && (
              <button
                onClick={() => setCreateDocMode((v) => !v)}
                className={`w-full flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-left transition-colors ${
                  createDocMode
                    ? "border-border bg-muted hover:bg-accent"
                    : "border-border bg-transparent hover:bg-muted"
                }`}>
                {createDocMode ? (
                  <X className="h-4 w-4 shrink-0 text-foreground" />
                ) : (
                  <Plus className="h-4 w-4 shrink-0 text-foreground" />
                )}
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {createDocMode
                      ? "Cancel — back to routing"
                      : `Create new ${CREATE_DOC_NOUN[activeSource.provider] ?? "doc"}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {createDocMode
                      ? "Transcription will save directly to "
                      : "Skip routing — save directly to "}
                    {activeSource.name}
                  </p>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Text panel — Tiptap WYSIWYG editor */}
        {inputMode === "text" && status === "idle" && (
          <div className="space-y-3">
            {/* Formatting toolbar */}
            <div className="flex gap-2 flex-wrap">
              {[
                {
                  label: "B",
                  title: "Bold",
                  action: () => tiptap?.chain().focus().toggleBold().run(),
                  active: tiptap?.isActive("bold"),
                },
                {
                  label: "I",
                  title: "Italic",
                  action: () => tiptap?.chain().focus().toggleItalic().run(),
                  active: tiptap?.isActive("italic"),
                },
                {
                  label: "U",
                  title: "Underline",
                  action: () => tiptap?.chain().focus().toggleUnderline().run(),
                  active: tiptap?.isActive("underline"),
                },
                {
                  label: "H1",
                  title: "Heading 1",
                  action: () =>
                    tiptap?.chain().focus().toggleHeading({ level: 1 }).run(),
                  active: tiptap?.isActive("heading", { level: 1 }),
                },
                {
                  label: "H2",
                  title: "Heading 2",
                  action: () =>
                    tiptap?.chain().focus().toggleHeading({ level: 2 }).run(),
                  active: tiptap?.isActive("heading", { level: 2 }),
                },
                {
                  label: "≡",
                  title: "Bullet list",
                  action: () =>
                    tiptap?.chain().focus().toggleBulletList().run(),
                  active: tiptap?.isActive("bulletList"),
                },
              ].map(({ label, title, action, active }) => (
                <button
                  key={label}
                  title={title}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    action();
                  }}
                  className={[
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors select-none",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-muted text-muted-foreground hover:text-foreground",
                  ].join(" ")}>
                  {label === "B" ? (
                    <strong>B</strong>
                  ) : label === "I" ? (
                    <em>I</em>
                  ) : label === "U" ? (
                    <span style={{ textDecoration: "underline" }}>U</span>
                  ) : (
                    label
                  )}
                </button>
              ))}
            </div>
            {/* Tiptap editor surface */}
            <EditorContent
              editor={tiptap}
              className="tiptap-editor min-h-[200px] w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground focus-within:ring-1 focus-within:ring-ring"
            />
            <Button
              className="w-full"
              onClick={submitText}
              disabled={!activeSource || !textNote.trim()}>
              {createDocMode
                ? "Create doc from note"
                : `Send to ${activeSource?.name ?? "source"} →`}
            </Button>
            {/* Create new doc toggle — below send button, matching mobile layout */}
            {activeSource && (
              <button
                onClick={() => setCreateDocMode((v) => !v)}
                className={`w-full flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-left transition-colors ${
                  createDocMode
                    ? "border-border bg-muted hover:bg-accent"
                    : "border-border bg-transparent hover:bg-muted"
                }`}>
                {createDocMode ? (
                  <X className="h-4 w-4 shrink-0 text-foreground" />
                ) : (
                  <Plus className="h-4 w-4 shrink-0 text-foreground" />
                )}
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {createDocMode
                      ? "Cancel — back to routing"
                      : `Create new ${CREATE_DOC_NOUN[activeSource.provider] ?? "doc"}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {createDocMode
                      ? "Text note will save directly to "
                      : "Skip routing — save directly to "}
                    {activeSource.name}
                  </p>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Image panel */}
        {inputMode === "image" && status === "idle" && (
          <div className="space-y-4">
            {/* Extraction mode toggle */}
            <div className="flex rounded-lg bg-muted p-1 gap-1">
              {(
                [
                  { mode: "vision", label: "Interpret image", Icon: ScanSearch },
                  { mode: "ocr", label: "Extract text", Icon: ScanText },
                ] as const
              ).map(({ mode, label, Icon }) => (
                <button
                  key={mode}
                  onClick={() => setExtractionMode(mode)}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                    extractionMode === mode
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}>
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Hidden file input */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onImageFileChange}
            />

            {/* Preview or picker */}
            {imagePreviewUrl ? (
              <div className="flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreviewUrl}
                  alt="Selected"
                  className="w-full max-h-64 object-cover rounded-xl border border-border"
                />
                <button
                  onClick={() => {
                    setImageFile(null);
                    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
                    setImagePreviewUrl(null);
                  }}
                  className="text-sm text-destructive hover:underline flex items-center gap-1">
                  <X className="h-3.5 w-3.5" /> Clear image
                </button>
              </div>
            ) : (
              <button
                onClick={() => imageInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-12 hover:bg-accent transition-colors cursor-pointer">
                <Camera className="h-10 w-10 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">
                    Upload image
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click to select from device — camera or gallery on mobile
                  </p>
                </div>
              </button>
            )}

            {/* Create new doc toggle */}
            {activeSource && (
              <button
                onClick={() => setCreateDocMode((v) => !v)}
                className={`w-full flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-left transition-colors ${
                  createDocMode
                    ? "border-border bg-muted hover:bg-accent"
                    : "border-border bg-transparent hover:bg-muted"
                }`}>
                {createDocMode ? (
                  <X className="h-4 w-4 shrink-0 text-foreground" />
                ) : (
                  <Plus className="h-4 w-4 shrink-0 text-foreground" />
                )}
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {createDocMode
                      ? "Cancel — back to routing"
                      : `Create new ${CREATE_DOC_NOUN[activeSource.provider] ?? "doc"}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {createDocMode
                      ? "Image will save directly to "
                      : "Skip routing — save directly to "}
                    {activeSource.name}
                  </p>
                </div>
              </button>
            )}

            {/* Submit */}
            <Button
              onClick={submitImage}
              disabled={!imageFile || !activeSource}
              className="w-full">
              {!activeSource
                ? "Select a source first"
                : !imageFile
                  ? "Select an image above"
                  : createDocMode
                    ? `Create ${CREATE_DOC_NOUN[activeSource.provider] ?? "doc"} from image →`
                    : "Route this image →"}
            </Button>
          </div>
        )}

        {/* Processing steps */}
        {isProcessing &&
          (() => {
            const isCreateDoc = isCreateDocFlowRef.current;
            const extractLabel = inputMode === "image"
              ? extractionMode === "ocr" ? "Extracting text" : "Interpreting image"
              : "Transcribing";
            const deliverLabel = isCreateDoc
              ? `Creating ${CREATE_DOC_NOUN[activeSource?.provider ?? ""] ?? "doc"}`
              : "Delivering";

            const STEPS: { key: PipelineStatus; label: string }[] = isCreateDoc
              ? ([
                  { key: "uploading", label: inputMode === "image" ? "Uploading image" : "Uploading" },
                  { key: "transcribing", label: extractLabel },
                  { key: "delivering", label: deliverLabel },
                ] as { key: PipelineStatus; label: string }[]).filter(({ key }) => inputMode === "text" ? key !== "uploading" && key !== "transcribing" : true)
              : [
                  { key: "uploading", label: inputMode === "image" ? "Uploading image" : "Uploading" },
                  { key: "transcribing", label: extractLabel },
                  { key: "embedding", label: "Finding matches" },
                  { key: "searching", label: "Searching slots" },
                  { key: "ranking", label: "Ranking matches" },
                  { key: "delivering", label: "Delivering" },
                ];
            // Hide upload/transcribe steps for text mode (they don't apply)
            const visibleSteps = isCreateDoc ? STEPS : STEPS.filter(({ key }) =>
              inputMode === "text" ? key !== "uploading" && key !== "transcribing" : true,
            );
            const ORDER: PipelineStatus[] = [
              "uploading",
              "transcribing",
              "embedding",
              "searching",
              "ranking",
              "delivering",
            ];
            const currentIdx = ORDER.indexOf(status as PipelineStatus);
            return (
              <div className="flex flex-col gap-3 py-6">
                {visibleSteps.map(({ key, label }) => {
                  const stepIdx = ORDER.indexOf(key);
                  const done = stepIdx < currentIdx;
                  const active = stepIdx === currentIdx;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div
                        className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${
                          done
                            ? "bg-green-500 text-black"
                            : active
                              ? "bg-foreground text-background"
                              : "bg-muted text-muted-foreground"
                        }`}>
                        {done ? (
                          <Check className="h-3 w-3" />
                        ) : active ? (
                          <span className="h-3 w-3 rounded-full border-2 border-background border-t-transparent animate-spin block" />
                        ) : null}
                      </div>
                      <span
                        className={`text-sm transition-colors ${
                          done
                            ? "text-green-500"
                            : active
                              ? "text-foreground font-semibold"
                              : "text-muted-foreground/40"
                        }`}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

        {/* Transcript */}
        {transcript && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Transcript</p>
              <div className="flex items-center gap-2">
                {inputMode === "image" && status === "awaiting_confirmation" && (
                  <button
                    onClick={() => setEditingTranscript((v) => !v)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                    <Pencil className="h-3 w-3" />
                    {editingTranscript ? "Done" : "Edit"}
                  </button>
                )}
                {status === "awaiting_confirmation" && (
                  <button
                    onClick={reset}
                    className="text-xs text-red-500 hover:text-red-400 transition-colors flex items-center gap-1">
                    <X className="h-3 w-3" /> Cancel
                  </button>
                )}
              </div>
            </div>
            {editingTranscript ? (
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                className="w-full bg-transparent text-sm text-foreground leading-relaxed resize-none outline-none border-none focus:ring-0 min-h-[80px]"
                autoFocus
              />
            ) : (
              <p className="text-sm text-foreground leading-relaxed">
                {transcript}
              </p>
            )}
          </div>
        )}

        {/* Slot confirmation */}
        {status === "awaiting_confirmation" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">
                Route to which slot?
              </p>
              {inputMode === "text" && (
                <button
                  onClick={reset}
                  className="text-xs text-red-500 hover:text-red-400 transition-colors flex items-center gap-1">
                  <X className="h-3 w-3" /> Cancel
                </button>
              )}
            </div>
            {(() => {
              const topScore = Math.max(...rankedSlots.map((s) => s.score_combined), 1);
              return rankedSlots.map((slot) => (
                <button
                  key={slot.slot_id}
                  onClick={() => onSelectSlot(slot)}
                  className="w-full flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-accent transition-colors">
                  <div>
                    <p className="font-semibold text-foreground">
                      {slot.slot_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {slot.integration_type}
                    </p>
                  </div>
                  <span className="text-green-400 font-bold ml-3">
                    {Math.round((slot.score_combined / topScore) * 100)}%
                  </span>
                </button>
              ));
            })()}
            {/* Save as new slot */}
            <button
              onClick={async () => {
                setPendingDocTitle("");
                setNotionParentPageId("");
                setNotionPages([]);
                if (activeSource?.provider === "notion") {
                  try {
                    const res = await api.get(`/api/v1/sources/${activeSource.id}/resources`);
                    setNotionPages(res.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
                  } catch { /* non-blocking — picker stays empty */ }
                }
                setNameDialogOpen(true);
              }}
              className="w-full rounded-xl border border-dashed border-green-800 bg-green-950/20 px-4 py-3 text-left hover:bg-green-950/30 transition-colors">
              <p className="text-green-400 font-semibold">+ Save as new slot</p>
              {activeSource && (
                <p className="text-xs text-green-700 mt-1">
                  Creates a new document in {activeSource.name}
                </p>
              )}
            </button>
          </div>
        )}

        {/* Success */}
        {status === "delivered" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Check className="h-14 w-14 text-green-400" />
            <p className="text-muted-foreground">
              {savedAsNewSlot ? "Saved as new slot" : "Delivered to"}
            </p>
            <p className="text-xl font-bold text-foreground">{deliveredSlot}</p>
            <Button variant="outline" onClick={reset} className="mt-2">
              Route Another
            </Button>
          </div>
        )}

        {/* Failed */}
        {status === "failed" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-red-400 text-lg">Something went wrong.</p>
            {failReason && (
              <p className="text-sm text-red-400/80 text-center max-w-xs">{failReason}</p>
            )}
            <div className="flex gap-3">
              {routeId && (
                <Button
                  variant="outline"
                  onClick={retryDelivery}
                  disabled={retrying}
                  className="border-red-900/50 text-red-400 hover:text-red-300">
                  {retrying ? "Retrying…" : "Retry delivery"}
                </Button>
              )}
              <Button variant="outline" onClick={reset}>
                Try Again
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Source selector dialog ─────────────────────────────────────── */}
      <Dialog
        open={sourceSelectorOpen}
        onOpenChange={(o) => {
          setSourceSelectorOpen(o);
          if (!o) setSourceSearch("");
        }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Select source</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Search sources…"
            value={sourceSearch}
            onChange={(e) => setSourceSearch(e.target.value)}
          />
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No sources connected.
              <br />
              Go to the Sources tab to add one.
            </p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {filteredSources.map((source) => (
                <button
                  key={source.id}
                  onClick={async () => {
                    setSourceSelectorOpen(false);
                    setSourceSearch("");
                    try {
                      await setActiveSource(source.id);
                    } catch {
                      toast.error("Could not set active source.");
                    }
                  }}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-accent transition-colors ${source.id === activeSourceId ? "bg-accent" : ""}`}>
                  <div>
                    <p className="font-medium text-foreground">{source.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {PROVIDER_LABEL[source.provider]}
                    </p>
                  </div>
                  {source.id === activeSourceId && (
                    <Check className="h-4 w-4 text-green-400" />
                  )}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Tab picker dialog ──────────────────────────────────────────── */}
      <Dialog open={tabPickerOpen} onOpenChange={setTabPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Choose a tab</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {pendingSlot?.slot_name}
          </p>
          {tabsFetching ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-1">
              {availableTabs.map((tab) => (
                <button
                  key={tab.tab_id || tab.tab_title}
                  onClick={async () => {
                    setTabPickerOpen(false);
                    if (pendingSlot)
                      await confirmSlot(
                        pendingSlot.slot_id,
                        tab.tab_id || null,
                      );
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-3 text-left hover:bg-accent transition-colors">
                  <span className="font-medium text-foreground">
                    {tab.tab_title}
                  </span>
                  <span className="text-muted-foreground">›</span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Trello card picker dialog ────────────────────────────────── */}
      <Dialog
        open={trelloCardPickerOpen}
        onOpenChange={setTrelloCardPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add to this list</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {pendingSlot?.slot_name}
          </p>
          {trelloCardsFetching ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-1">
              <button
                onClick={async () => {
                  setTrelloCardPickerOpen(false);
                  setPendingTrelloCardId(null);
                  if (pendingSlot)
                    await confirmSlot(pendingSlot.slot_id, null, "note");
                }}
                className="w-full flex items-center justify-between rounded-lg px-3 py-3 text-left hover:bg-accent transition-colors">
                <span className="font-medium text-green-400">
                  + Add as new card
                </span>
                <span className="text-muted-foreground">›</span>
              </button>
              {availableTrelloCards.map((card) => (
                <button
                  key={card.id}
                  onClick={async () => {
                    setTrelloCardPickerOpen(false);
                    setPendingTrelloCardId(card.id);
                    setTrelloCardDetailFetching(true);
                    setTrelloCardDetail(null);
                    setTrelloCardPreviewOpen(true);
                    try {
                      const res = await api.get(
                        `/api/v1/trello/cards/${card.id}`,
                      );
                      setTrelloCardDetail(res.data);
                    } catch {
                      setTrelloCardDetail({
                        id: card.id,
                        name: card.name,
                        desc: "",
                        checklists: [],
                      });
                    } finally {
                      setTrelloCardDetailFetching(false);
                    }
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-3 text-left hover:bg-accent transition-colors">
                  <span className="font-medium text-foreground">
                    {card.name}
                  </span>
                  <span className="text-muted-foreground">›</span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Trello card content preview dialog ───────────────────────── */}
      <Dialog
        open={trelloCardPreviewOpen}
        onOpenChange={setTrelloCardPreviewOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto p-0">
          {/* Cover strip */}
          {trelloCardDetail?.cover_color && (
            <div
              className="h-10 w-full rounded-t-lg"
              style={{ backgroundColor: trelloCardDetail.cover_color }}
            />
          )}
          <div className="px-5 pt-4 pb-5 space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base leading-snug">
                {trelloCardDetail?.name ?? "Card"}
              </DialogTitle>
            </DialogHeader>
            {trelloCardDetailFetching ? (
              <div className="flex justify-center py-6">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Labels */}
                {(trelloCardDetail?.labels ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {trelloCardDetail!.labels!.map((lbl, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: lbl.color || "#6b7280" }}>
                        {lbl.name || lbl.color}
                      </span>
                    ))}
                  </div>
                )}

                {/* Due date + members row */}
                {(trelloCardDetail?.due ||
                  (trelloCardDetail?.members ?? []).length > 0) && (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {trelloCardDetail?.due && (
                      <span
                        className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
                          trelloCardDetail.due_complete
                            ? "bg-green-700 text-green-100"
                            : new Date(trelloCardDetail.due) < new Date()
                              ? "bg-red-700 text-red-100"
                              : "bg-muted text-muted-foreground"
                        }`}>
                        {new Date(trelloCardDetail.due).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                        {trelloCardDetail.due_complete && <Check className="h-3 w-3 inline ml-1" />}
                      </span>
                    )}
                    {(trelloCardDetail?.members ?? []).map((m, i) => (
                      <span
                        key={i}
                        title={m.name}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                        {m.initials}
                      </span>
                    ))}
                  </div>
                )}

                {/* Description (Markdown) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      Description
                    </p>
                    <button
                      onClick={async () => {
                        setTrelloCardPreviewOpen(false);
                        if (pendingSlot)
                          await confirmSlot(
                            pendingSlot.slot_id,
                            pendingTrelloCardId,
                            "note",
                          );
                      }}
                      className="text-xs text-primary hover:underline">
                      Append here →
                    </button>
                  </div>
                  {trelloCardDetail?.desc ? (
                    <div className="prose prose-sm prose-invert max-w-none text-sm text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown>{trelloCardDetail.desc}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No description yet.
                    </p>
                  )}
                </div>

                {/* Checklists */}
                {(trelloCardDetail?.checklists ?? []).map((cl) => {
                  const done = cl.items.filter((it) => it.complete).length;
                  const pct =
                    cl.items.length > 0
                      ? Math.round((done / cl.items.length) * 100)
                      : 0;
                  return (
                    <div key={cl.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-widest text-muted-foreground">
                          {cl.name}
                        </p>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {pct}%
                          </span>
                          <button
                            onClick={async () => {
                              setTrelloCardPreviewOpen(false);
                              if (pendingSlot)
                                await confirmSlot(
                                  pendingSlot.slot_id,
                                  pendingTrelloCardId,
                                  "checklist",
                                  "",
                                  cl.id,
                                );
                            }}
                            className="text-xs text-primary hover:underline">
                            Append here →
                          </button>
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-green-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="space-y-1.5 pt-0.5">
                        {cl.items.map((item, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="mt-0.5 text-sm shrink-0">
                              {item.complete ? "☑" : "☐"}
                            </span>
                            <span
                              className={`text-sm ${item.complete ? "line-through text-muted-foreground" : "text-foreground"}`}>
                              {item.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Badges */}
                {((trelloCardDetail?.comment_count ?? 0) > 0 ||
                  (trelloCardDetail?.attachment_count ?? 0) > 0) && (
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    {(trelloCardDetail!.comment_count ?? 0) > 0 && (
                      <span>
                        💬 {trelloCardDetail!.comment_count} comment
                        {trelloCardDetail!.comment_count !== 1 ? "s" : ""}
                      </span>
                    )}
                    {(trelloCardDetail!.attachment_count ?? 0) > 0 && (
                      <span>
                        📎 {trelloCardDetail!.attachment_count} attachment
                        {trelloCardDetail!.attachment_count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                )}

                {/* New checklist button */}
                <button
                  onClick={() => {
                    setTrelloChecklistTitle("");
                    setTrelloChecklistTitleOpen(true);
                  }}
                  className="w-full flex items-center justify-between rounded-lg border border-dashed border-muted-foreground/40 px-4 py-2.5 text-left hover:bg-accent transition-colors">
                  <span className="text-sm text-muted-foreground">
                    + New checklist…
                  </span>
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Trello checklist title dialog ─────────────────────────────── */}
      <Dialog
        open={trelloChecklistTitleOpen}
        onOpenChange={setTrelloChecklistTitleOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Checklist title</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="e.g. Action items, Next steps…"
            value={trelloChecklistTitle}
            onChange={(e) => setTrelloChecklistTitle(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                setTrelloChecklistTitleOpen(false);
                if (pendingSlot)
                  await confirmSlot(
                    pendingSlot.slot_id,
                    pendingTrelloCardId,
                    "checklist",
                    trelloChecklistTitle.trim(),
                  );
              }
            }}
          />
          <button
            onClick={async () => {
              setTrelloChecklistTitleOpen(false);
              if (pendingSlot)
                await confirmSlot(
                  pendingSlot.slot_id,
                  pendingTrelloCardId,
                  "checklist",
                  trelloChecklistTitle.trim(),
                );
            }}
            className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground hover:opacity-90 transition-opacity">
            Add checklist →
          </button>
        </DialogContent>
      </Dialog>

      {/* ── Name dialog — used for both save-as-new-slot and create-doc ── */}
      <Dialog open={nameDialogOpen} onOpenChange={(open) => { setNameDialogOpen(open); if (!open && isCreateDocFlowRef.current && status === "idle") isCreateDocFlowRef.current = false; }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Name your document</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="e.g. Meeting notes, Project ideas…"
            value={pendingDocTitle}
            onChange={(e) => setPendingDocTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pendingDocTitle.trim()) {
                setNameDialogOpen(false);
                if (createDocMode) {
                  saveCreateDoc(pendingDocTitle);
                } else {
                  saveAsNewSlot(pendingDocTitle);
                }
              }
            }}
          />
          {!createDocMode && activeSource?.provider === "notion" && notionPages.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Parent page</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={notionParentPageId}
                onChange={(e) => setNotionParentPageId(e.target.value)}>
                <option value="">— pick a parent page —</option>
                {notionPages.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          <Button
            className="w-full bg-green-600 hover:bg-green-500 text-white"
            disabled={!pendingDocTitle.trim()}
            onClick={() => {
              setNameDialogOpen(false);
              if (createDocMode) {
                saveCreateDoc(pendingDocTitle);
              } else {
                saveAsNewSlot(pendingDocTitle);
              }
            }}>
            {createDocMode ? "Create & index" : "Create & deliver"}
          </Button>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={googleWriteConfirmOpen}
        onOpenChange={setGoogleWriteConfirmOpen}
        title="Google Docs write access"
        description="NoteRoute needs permission to write to your Google Docs. Open Google authorization now?"
        confirmLabel="Authorize"
        onConfirm={() => pendingGoogleUpgradeRef.current?.()}
      />
    </AppShell>
  );
}
