import json
import logging

import boto3
import httpx

from app.config import settings
from app.graph.state import NoteRouteState

logger = logging.getLogger(__name__)

_bedrock_client = None



def _get_bedrock(key_id: str | None = None, secret: str | None = None, region: str | None = None):
    global _bedrock_client
    if key_id and secret:
        return boto3.client(
            "bedrock-runtime",
            aws_access_key_id=key_id,
            aws_secret_access_key=secret,
            region_name=region or settings.AWS_REGION,
        )
    if _bedrock_client is None:
        _bedrock_client = boto3.client(
            "bedrock-runtime",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
    return _bedrock_client


async def _fetch_custom_creds(user_id: str) -> dict:
    """Fetch BYOI + BYOLLM credentials from the backend internal API."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.backend_url}/api/v1/users/internal/{user_id}/custom-index-creds"
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("Could not fetch custom creds for user %s: %s", user_id, e)
    return {"has_custom": False}


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


async def _embed(
    text: str,
    key_id: str | None = None,
    secret: str | None = None,
    region: str | None = None,
    use_nova: bool = False,
) -> list[float]:
    client = _get_bedrock(key_id, secret, region)
    if use_nova:
        body = json.dumps({
            "schemaVersion": "nova-multimodal-embed-v1",
            "taskType": "SINGLE_EMBEDDING",
            "singleEmbeddingParams": {
                "embeddingPurpose": "GENERIC_INDEX",
                "embeddingDimension": 1024,
                "text": {"truncationMode": "END", "value": text},
            },
        })
        model_id = settings.NOVA_EMBED_MODEL_ID
    else:
        body = json.dumps({"inputText": text, "dimensions": 1024, "normalize": True})
        model_id = settings.BEDROCK_EMBED_MODEL_ID
    response = client.invoke_model(
        modelId=model_id,
        body=body,
        contentType="application/json",
        accept="application/json",
    )
    result = json.loads(response["body"].read())
    if use_nova:
        return result["embeddings"][0]["embedding"]
    return result["embedding"]


def _summarize_openai(transcript: str, api_key: str) -> str:
    """Summarize transcript using OpenAI gpt-4o-mini (sync)."""
    prompt = (
        "Summarize the following note in 200 words or fewer. "
        "Focus on the key topic and intent.\n\n"
        f"Note: {transcript}"
    )
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini",
                "max_tokens": 300,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


def _summarize_anthropic(transcript: str, api_key: str) -> str:
    """Summarize transcript using Anthropic claude-haiku direct (sync)."""
    prompt = (
        "Summarize the following note in 200 words or fewer. "
        "Focus on the key topic and intent.\n\n"
        f"Note: {transcript}"
    )
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 300,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        return resp.json()["content"][0]["text"].strip()


async def _summarize(
    transcript: str,
    key_id: str | None = None,
    secret: str | None = None,
    region: str | None = None,
    llm_provider: str | None = None,
    llm_api_key: str | None = None,
    use_nova: bool = False,
) -> str:
    """Summarize transcript — routes to OpenAI/Anthropic if BYOLLM creds present, else Bedrock."""
    import asyncio
    if llm_provider == "openai" and llm_api_key:
        return await asyncio.to_thread(_summarize_openai, transcript, llm_api_key)
    if llm_provider == "anthropic" and llm_api_key:
        return await asyncio.to_thread(_summarize_anthropic, transcript, llm_api_key)

    # Default: Bedrock
    client = _get_bedrock(key_id, secret, region)
    prompt = (
        "Summarize the following note in 200 words or fewer. "
        "Focus on the key topic and intent.\n\n"
        f"Note: {transcript}"
    )
    if use_nova:
        body = json.dumps({
            "messages": [{"role": "user", "content": [{"text": prompt}]}],
            "inferenceConfig": {"maxTokens": 300},
        })
        response = client.invoke_model(
            modelId=settings.NOVA_LITE_MODEL_ID,
            body=body,
            contentType="application/json",
            accept="application/json",
        )
        result = json.loads(response["body"].read())
        return result["output"]["message"]["content"][0]["text"]
    else:
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 300,
            "messages": [{"role": "user", "content": prompt}],
        })
        response = client.invoke_model(
            modelId=settings.CLAUDE_MODEL_ID,
            body=body,
            contentType="application/json",
            accept="application/json",
        )
        result = json.loads(response["body"].read())
        return result["content"][0]["text"]


_POLISH_PROMPT = (
    "You are an editor cleaning up a spoken voice recording that was auto-transcribed. "
    "Remove filler words (um, uh, like, you know, sort of), false starts, and direct repetitions. "
    "Preserve the speaker's exact vocabulary, tone, and all content — do NOT "
    "summarise, shorten, or change meaning. Output only the cleaned text, "
    "no preamble.\n\nTranscript: {transcript}"
)


def _polish_openai(transcript: str, api_key: str) -> str:
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": _POLISH_PROMPT.format(transcript=transcript)}],
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


def _polish_anthropic(transcript: str, api_key: str) -> str:
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": _POLISH_PROMPT.format(transcript=transcript)}],
            },
        )
        resp.raise_for_status()
        return resp.json()["content"][0]["text"].strip()


def _polish_bedrock(transcript: str, client) -> str:
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": _POLISH_PROMPT.format(transcript=transcript)}],
    })
    response = client.invoke_model(
        modelId=settings.CLAUDE_MODEL_ID,
        body=body,
        contentType="application/json",
        accept="application/json",
    )
    result = json.loads(response["body"].read())
    return result["content"][0]["text"].strip()


async def _polish(
    transcript: str,
    key_id: str | None = None,
    secret: str | None = None,
    region: str | None = None,
    llm_provider: str | None = None,
    llm_api_key: str | None = None,
    use_nova: bool = False,
) -> str:
    """Return a cleaned-up version of the transcript, preserving content and voice."""
    import asyncio
    if llm_provider == "openai" and llm_api_key:
        return await asyncio.to_thread(_polish_openai, transcript, llm_api_key)
    if llm_provider == "anthropic" and llm_api_key:
        return await asyncio.to_thread(_polish_anthropic, transcript, llm_api_key)
    if use_nova:
        bedrock = _get_bedrock(key_id, secret, region)
        prompt = _POLISH_PROMPT.format(transcript=transcript)
        body = json.dumps({
            "messages": [{"role": "user", "content": [{"text": prompt}]}],
            "inferenceConfig": {"maxTokens": 1024},
        })
        response = bedrock.invoke_model(
            modelId=settings.NOVA_LITE_MODEL_ID,
            body=body,
            contentType="application/json",
            accept="application/json",
        )
        result = json.loads(response["body"].read())
        return result["output"]["message"]["content"][0]["text"].strip()
    bedrock = _get_bedrock(key_id, secret, region)
    return await asyncio.to_thread(_polish_bedrock, transcript, bedrock)


async def embed_node(state: NoteRouteState) -> dict:
    """Generate summary text + both embedding vectors from the transcript."""
    transcript = state.get("transcript")
    if not transcript:
        return {"error": "No transcript available for embedding"}

    # Fetch BYOI + BYOLLM creds and global config concurrently
    import asyncio as _asyncio
    creds, global_cfg = await _asyncio.gather(
        _fetch_custom_creds(state["user_id"]),
        _fetch_global_config(),
    )
    use_nova = global_cfg.get("use_nova", False)
    has_bedrock = creds.get("has_bedrock") or creds.get("has_custom") and creds.get("bedrock_aws_access_key_id")
    key_id = creds.get("bedrock_aws_access_key_id") if has_bedrock else None
    secret = creds.get("bedrock_aws_secret_access_key") if has_bedrock else None
    region = creds.get("bedrock_aws_region") if has_bedrock else None
    llm_provider = creds.get("llm_provider")
    llm_api_key = creds.get("llm_api_key")

    # Voice notes (audio_s3_key set) get polished; typed notes skip polish
    is_voice = bool(state.get("audio_s3_key"))

    try:
        # Polish (voice only) and summarize in parallel.
        # Embeddings use the raw transcript for better semantic coverage.
        import asyncio
        if is_voice:
            polished, summary_text = await asyncio.gather(
                _polish(transcript, key_id, secret, region, llm_provider, llm_api_key, use_nova),
                _summarize(transcript, key_id, secret, region, llm_provider, llm_api_key, use_nova),
            )
        else:
            polished = transcript
            summary_text = await _summarize(transcript, key_id, secret, region, llm_provider, llm_api_key, use_nova)
        summary_vector = await _embed(summary_text, key_id, secret, region, use_nova)
        content_vector = await _embed(transcript, key_id, secret, region, use_nova)
        return {
            "transcript": polished,          # deliver uses polished text (or original for typed)
            "summary_text": summary_text,
            "summary_vector": summary_vector,
            "content_vector": content_vector,
            "custom_pinecone_api_key": creds.get("pinecone_api_key") if creds.get("has_custom") else None,
            "custom_index_name": creds.get("index_name") if creds.get("has_custom") else None,
            "custom_bedrock_key_id": key_id,
            "custom_bedrock_secret": secret,
            "custom_bedrock_region": region,
            "custom_llm_provider": llm_provider,
            "custom_llm_api_key": llm_api_key,
        }
    except Exception as e:
        logger.error("Embedding failed: %s", e)
        return {"error": str(e)}
