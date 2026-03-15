import json
import logging

import boto3
import httpx

from app.config import settings
from app.graph.state import NoteRouteState

logger = logging.getLogger(__name__)

_bedrock_client = None



def _get_bedrock():
    global _bedrock_client
    if _bedrock_client is None:
        _bedrock_client = boto3.client(
            "bedrock-runtime",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
    return _bedrock_client


async def _fetch_global_config() -> dict:
    """Fetch GlobalConfig from backend internal endpoint."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.backend_url}/api/v1/admin/internal/config"
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("Could not fetch global config: %s", e)
    return {"use_nova": False}


async def _fetch_slot_metadata(slot_ids: list[str]) -> dict[str, dict]:
    """Fetch slot name, integration_type, and resource_id from the backend internal API."""
    if not slot_ids:
        return {}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.backend_url}/api/v1/slots/internal/batch",
                params={"ids": ",".join(slot_ids)},
            )
            if resp.status_code == 200:
                return {item["slot_id"]: item for item in resp.json()}
    except Exception as e:
        logger.warning("Could not fetch slot metadata: %s", e)
    return {}


def _rank_openai(prompt: str, api_key: str) -> list[str]:
    """Call OpenAI gpt-4o to rank slot IDs (sync)."""
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o",
                "max_tokens": 200,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"].strip()
        return json.loads(text)


def _rank_anthropic(prompt: str, api_key: str) -> list[str]:
    """Call Anthropic claude-sonnet direct to rank slot IDs (sync)."""
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-6-20251001",
                "max_tokens": 200,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        text = resp.json()["content"][0]["text"].strip()
        return json.loads(text)


async def rank_node(state: NoteRouteState) -> dict:
    """Enrich candidate slots with metadata, then use an LLM to rank by relevance."""
    candidates = state.get("candidate_slots")
    transcript = state.get("transcript", "")
    summary = state.get("summary_text", "")
    llm_provider = state.get("custom_llm_provider")
    llm_api_key = state.get("custom_llm_api_key")

    if not candidates:
        return {"ranked_slots": []}

    # Drop candidates below the minimum relevance threshold before ranking
    candidates = [c for c in candidates if c.get("score_combined", 0.0) >= 0.05]
    if not candidates:
        return {"ranked_slots": []}

    # Enrich candidates with slot name, integration_type, and resource_id from backend
    slot_ids = [c["slot_id"] for c in candidates]
    metadata = await _fetch_slot_metadata(slot_ids)
    for c in candidates:
        meta = metadata.get(c["slot_id"], {})
        c["slot_name"] = meta.get("slot_name", c.get("slot_name", ""))
        c["integration_type"] = meta.get("integration_type", c.get("integration_type", ""))
        c["resource_id"] = meta.get("resource_id", c.get("resource_id", ""))

    # Drop candidates that have no MongoDB record (stale Pinecone entries)
    candidates = [c for c in candidates if c.get("slot_name")]
    if not candidates:
        return {"ranked_slots": []}

    slots_text = "\n".join(
        f"- Slot ID: {c['slot_id']}, Name: {c['slot_name']}, Type: {c['integration_type']}"
        for c in candidates
    )

    prompt = (
        "You are a knowledge routing assistant. Given a note and a list of candidate "
        "Knowledge Slots, rank them from most to least relevant.\n\n"
        f"Note Summary: {summary}\n\n"
        f"Full Text: {transcript}\n\n"
        f"Candidate Slots:\n{slots_text}\n\n"
        "Rank purely by the semantic match between the note's topic and each slot's name. "
        "Use your own judgment — ignore any implicit ordering in the list. "
        "Ask yourself: if a user wrote this note, which slot is the most natural place to file it?\n"
        "If multiple slots cover the same narrow topic, prefer the most specific match "
        "and push near-duplicates lower — favour breadth over a cluster of similar slots.\n"
        "Return a JSON array of slot_ids ordered from most to least relevant. "
        "Example: [\"slot_id_1\", \"slot_id_2\", \"slot_id_3\"]\n"
        "Respond with only the JSON array, no other text."
    )

    global_cfg = await _fetch_global_config()
    use_nova = global_cfg.get("use_nova", False)

    try:
        import asyncio
        if llm_provider == "openai" and llm_api_key:
            ranked_ids: list[str] = await asyncio.to_thread(_rank_openai, prompt, llm_api_key)
        elif llm_provider == "anthropic" and llm_api_key:
            ranked_ids = await asyncio.to_thread(_rank_anthropic, prompt, llm_api_key)
        else:
            # Default: Bedrock
            client = _get_bedrock()
            if use_nova:
                body = json.dumps({
                    "messages": [{"role": "user", "content": [{"text": prompt}]}],
                    "inferenceConfig": {"maxTokens": 200},
                })
                response = client.invoke_model(
                    modelId=settings.NOVA_LITE_MODEL_ID,
                    body=body,
                    contentType="application/json",
                    accept="application/json",
                )
                result = json.loads(response["body"].read())
                ranked_ids = json.loads(result["output"]["message"]["content"][0]["text"])
            else:
                body = json.dumps({
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 200,
                    "messages": [{"role": "user", "content": prompt}],
                })
                response = client.invoke_model(
                    modelId=settings.CLAUDE_MODEL_ID,
                    body=body,
                    contentType="application/json",
                    accept="application/json",
                )
                result = json.loads(response["body"].read())
                ranked_ids = json.loads(result["content"][0]["text"])
    except Exception as e:
        logger.error("LLM ranking failed: %s", e)
        # Fall back to vector score order
        ranked_ids = [c["slot_id"] for c in candidates]

    # Reconstruct ranked_slots preserving full enriched metadata
    slot_map = {c["slot_id"]: c for c in candidates}
    ranked_slots = [slot_map[sid] for sid in ranked_ids if sid in slot_map]
    # Append any candidates not mentioned by LLM (shouldn't happen, but safe)
    mentioned = set(ranked_ids)
    for c in candidates:
        if c["slot_id"] not in mentioned:
            ranked_slots.append(c)

    return {"ranked_slots": ranked_slots}
