import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from langgraph.types import Command
from pydantic import BaseModel

import app.graph.graph as graph_module
from app.graph.state import NoteRouteState

router = APIRouter(tags=["pipeline"])
logger = logging.getLogger(__name__)

# Fields that are large / internal and never needed by the frontend over SSE.
_SSE_STRIP = {
    "summary_vector", "content_vector",
    "custom_pinecone_api_key", "custom_index_name",
    "custom_bedrock_key_id", "custom_bedrock_secret", "custom_bedrock_region",
    "custom_llm_provider", "custom_llm_api_key",
}


def _sse_payload(node_name: str, node_output: dict) -> str:
    """Build a lean SSE data line — strips large/internal fields, serialises datetimes."""
    payload = {"node": node_name}
    for k, v in node_output.items():
        if k in _SSE_STRIP:
            continue
        if isinstance(v, datetime):
            v = v.isoformat()
        payload[k] = v
    return f"data: {json.dumps(payload)}\n\n"


class RunRequest(BaseModel):
    run_id: str
    user_id: str
    audio_s3_key: str
    audio_duration_sec: float = 0.0
    source_id: str | None = None


class TextRunRequest(BaseModel):
    run_id: str
    user_id: str
    text: str
    source_id: str | None = None


class ImageRunRequest(BaseModel):
    run_id: str
    user_id: str
    image_s3_key: str
    extraction_mode: str = "vision"  # "ocr" | "vision"
    source_id: str | None = None


class TranscribeRequest(BaseModel):
    audio_s3_key: str
    audio_duration_sec: float = 0.0
    user_id: str = ""  # if provided, BYOLLM creds are fetched and used for polishing


class ExtractImageRequest(BaseModel):
    image_s3_key: str
    extraction_mode: str = "vision"  # "ocr" | "vision"
    user_id: str = ""


class ConfirmRequest(BaseModel):
    run_id: str
    confirmed_slot_id: str | None = None
    save_as_slot: bool = False
    target_tab_id: str | None = None
    doc_title: str | None = None
    trello_format: str = "note"  # "note" | "checklist"
    trello_checklist_title: str | None = None
    trello_checklist_id: str | None = None
    notion_parent_page_id: str | None = None


def _thread_config(run_id: str) -> dict:
    return {"configurable": {"thread_id": run_id}}


def _base_state() -> NoteRouteState:
    """Return a blank state with all fields at their defaults."""
    return {
        "run_id": "",
        "user_id": "",
        "audio_s3_key": "",
        "audio_duration_sec": 0.0,
        "source_id": None,
        "image_s3_key": None,
        "extraction_mode": None,
        "custom_pinecone_api_key": None,
        "custom_index_name": None,
        "custom_bedrock_key_id": None,
        "custom_bedrock_secret": None,
        "custom_bedrock_region": None,
        "custom_llm_provider": None,
        "custom_llm_api_key": None,
        "transcript": None,
        "transcript_confidence": None,
        "summary_text": None,
        "summary_vector": None,
        "content_vector": None,
        "candidate_slots": None,
        "ranked_slots": None,
        "confirmed_slot_id": None,
        "save_as_slot": None,
        "target_tab_id": None,
        "doc_title": None,
        "trello_format": None,
        "trello_checklist_title": None,
        "trello_checklist_id": None,
        "confirmation_status": None,
        "delivery_status": None,
        "delivery_error": None,
        "delivered_at": None,
        "error": None,
        "retry_count": 0,
    }


def _build_initial_state(body: RunRequest) -> NoteRouteState:
    return {
        **_base_state(),
        "run_id": body.run_id,
        "user_id": body.user_id,
        "audio_s3_key": body.audio_s3_key,
        "audio_duration_sec": body.audio_duration_sec,
        "source_id": body.source_id,
    }


@router.post("/transcribe")
async def transcribe_audio(body: TranscribeRequest) -> dict:
    """Transcribe an audio file from S3 and return a polished transcript.
    Polishing uses BYOLLM creds if user_id is provided, otherwise falls back to Bedrock."""
    from app.graph.nodes.transcribe import transcribe_node
    from app.graph.nodes.embed import _fetch_custom_creds, _polish
    state: NoteRouteState = {
        **_base_state(),
        "user_id": body.user_id,
        "audio_s3_key": body.audio_s3_key,
        "audio_duration_sec": body.audio_duration_sec,
    }
    result = await transcribe_node(state)
    if result.get("error"):
        return {"error": result["error"]}
    raw_transcript = result.get("transcript", "")
    if not raw_transcript:
        return {"transcript": ""}

    # Polish the transcript (same as full pipeline for voice notes)
    try:
        if body.user_id:
            creds = await _fetch_custom_creds(body.user_id)
        else:
            creds = {}
        has_bedrock = creds.get("has_bedrock") or (creds.get("has_custom") and creds.get("bedrock_aws_access_key_id"))
        key_id = creds.get("bedrock_aws_access_key_id") if has_bedrock else None
        secret = creds.get("bedrock_aws_secret_access_key") if has_bedrock else None
        region = creds.get("bedrock_aws_region") if has_bedrock else None
        llm_provider = creds.get("llm_provider")
        llm_api_key = creds.get("llm_api_key")
        polished = await _polish(raw_transcript, key_id, secret, region, llm_provider, llm_api_key)
    except Exception as e:
        logger.warning("Polish failed, returning raw transcript: %s", e)
        polished = raw_transcript

    return {"transcript": polished, "raw_transcript": raw_transcript}


@router.post("/extract-image")
async def extract_image(body: ExtractImageRequest) -> dict:
    """Extract text or description from an image stored in S3.
    Returns {transcript} — no pipeline, no routing."""
    from app.graph.nodes.image_extract import image_extract_node
    state: NoteRouteState = {
        **_base_state(),
        "user_id": body.user_id,
        "image_s3_key": body.image_s3_key,
        "extraction_mode": body.extraction_mode,
    }
    result = await image_extract_node(state)
    if result.get("error"):
        return {"error": result["error"]}
    return {"transcript": result.get("transcript", "")}


@router.post("/run")
async def run_pipeline(body: RunRequest) -> dict:
    """Start (or resume) the NoteRoute pipeline for a given run_id."""
    config = _thread_config(body.run_id)
    result = await graph_module.graph.ainvoke(_build_initial_state(body), config=config)
    return {
        "run_id": body.run_id,
        "status": "awaiting_confirmation" if result.get("ranked_slots") else "failed",
        "ranked_slots": result.get("ranked_slots"),
        "transcript": result.get("transcript"),
        "summary": result.get("summary_text"),
        "error": result.get("error"),
    }


@router.post("/run/text")
async def run_text_pipeline(body: TextRunRequest) -> dict:
    """Non-streaming pipeline run for a text note — skips transcription."""
    config = _thread_config(body.run_id)
    initial_state: NoteRouteState = {
        **_base_state(),
        "run_id": body.run_id,
        "user_id": body.user_id,
        "source_id": body.source_id,
        "transcript": body.text,
        "transcript_confidence": 1.0,
    }
    result = await graph_module.graph.ainvoke(initial_state, config=config)
    return {
        "run_id": body.run_id,
        "status": "awaiting_confirmation" if result.get("ranked_slots") else "failed",
        "ranked_slots": result.get("ranked_slots"),
        "summary": result.get("summary_text"),
        "error": result.get("error"),
    }


@router.post("/confirm")
async def confirm_slot(body: ConfirmRequest) -> dict:
    """Resume a paused pipeline with the user's confirmed slot selection."""
    config = _thread_config(body.run_id)
    logger.info("confirm called run_id=%s config=%s", body.run_id, config)
    # Check if checkpoint exists
    try:
        state_snapshot = await graph_module.graph.aget_state(config)
        logger.info("checkpoint state next=%s values_keys=%s", state_snapshot.next, list((state_snapshot.values or {}).keys()))
    except Exception as e:
        logger.warning("aget_state failed: %s", e)
    resume_value = {
        "confirmed_slot_id": body.confirmed_slot_id,
        "save_as_slot": body.save_as_slot,
        "target_tab_id": body.target_tab_id,
        "doc_title": body.doc_title,
        "trello_format": body.trello_format,
        "trello_checklist_title": body.trello_checklist_title,
        "trello_checklist_id": body.trello_checklist_id,
        "notion_parent_page_id": body.notion_parent_page_id,
    }
    # Use astream to collect all state updates after resume; ainvoke can return
    # None on some LangGraph versions when resuming from an interrupt checkpoint.
    result: dict = {}
    async for event in graph_module.graph.astream(
        Command(resume=resume_value),
        config=config,
        stream_mode="updates",
    ):
        logger.info("confirm stream event: %s", event)
        for _, node_output in event.items():
            if isinstance(node_output, dict):
                result.update(node_output)
    logger.info("confirm merged result: %s", result)
    return {
        "run_id": body.run_id,
        "status": result.get("delivery_status", "unknown"),
        "delivery_error": result.get("delivery_error"),
        "delivered_at": result.get("delivered_at").isoformat() if result.get("delivered_at") else None,
    }


@router.post("/stream/text")
async def stream_text_pipeline(body: TextRunRequest) -> StreamingResponse:
    """SSE stream for a text note — skips transcription."""
    config = _thread_config(body.run_id)
    logger.info("stream/text called run_id=%s config=%s", body.run_id, config)
    initial_state: NoteRouteState = {
        **_base_state(),
        "run_id": body.run_id,
        "user_id": body.user_id,
        "source_id": body.source_id,
        "transcript": body.text,
        "transcript_confidence": 1.0,
    }

    async def event_generator():
        async for event in graph_module.graph.astream(initial_state, config=config, stream_mode="updates"):
            for node_name, node_output in event.items():
                if not isinstance(node_output, dict):
                    continue
                yield _sse_payload(node_name, node_output)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/stream")
async def stream_pipeline(body: RunRequest) -> StreamingResponse:
    """SSE stream for the full pipeline. Emits events as each node completes."""
    config = _thread_config(body.run_id)

    async def event_generator():
        async for event in graph_module.graph.astream(_build_initial_state(body), config=config, stream_mode="updates"):
            for node_name, node_output in event.items():
                if not isinstance(node_output, dict):
                    continue
                yield _sse_payload(node_name, node_output)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/stream/image")
async def stream_image_pipeline(body: ImageRunRequest) -> StreamingResponse:
    """SSE stream for an image input — runs image_extract then the full downstream pipeline."""
    config = _thread_config(body.run_id)
    logger.info("stream/image called run_id=%s mode=%s config=%s", body.run_id, body.extraction_mode, config)
    initial_state: NoteRouteState = {
        **_base_state(),
        "run_id": body.run_id,
        "user_id": body.user_id,
        "source_id": body.source_id,
        "image_s3_key": body.image_s3_key,
        "extraction_mode": body.extraction_mode,
    }

    async def event_generator():
        async for event in graph_module.graph.astream(initial_state, config=config, stream_mode="updates"):
            for node_name, node_output in event.items():
                if not isinstance(node_output, dict):
                    continue
                yield _sse_payload(node_name, node_output)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
