import asyncio
import base64
import io
import json
import logging

import boto3
import httpx

from app.config import settings
from app.graph.state import NoteRouteState

logger = logging.getLogger(__name__)

_s3_client = None
_bedrock_client = None



def _get_s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
    return _s3_client


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
    """Fetch Nova feature flag from backend. Returns {"use_nova": False} on failure."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.backend_url}/api/v1/admin/internal/config")
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning("image_extract: could not fetch global config: %s", e)
    return {"use_nova": False}


def _media_type_to_nova_format(media_type: str) -> str:
    """Convert MIME type to Nova image format string."""
    return {
        "image/jpeg": "jpeg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }.get(media_type, "jpeg")


def _call_nova_vision(
    image_bytes: bytes,
    media_type: str,
    prompt: str,
) -> str:
    """Call Amazon Nova Pro via Bedrock with a raw image (multimodal Converse format)."""
    fmt = _media_type_to_nova_format(media_type)
    body = json.dumps({
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "image": {
                            "format": fmt,
                            "source": {"bytes": base64.b64encode(image_bytes).decode()},
                        }
                    },
                    {"text": prompt},
                ],
            }
        ],
        "inferenceConfig": {"maxTokens": 2048},
    })
    response = _get_bedrock().invoke_model(
        modelId=settings.NOVA_PRO_MODEL_ID,
        body=body,
        contentType="application/json",
        accept="application/json",
    )
    result = json.loads(response["body"].read())
    return result["output"]["message"]["content"][0]["text"].strip()


def _delete_image(s3_key: str) -> None:
    try:
        _get_s3().delete_object(Bucket=settings.AWS_TRANSCRIBE_BUCKET, Key=s3_key)
        logger.info("Deleted image file s3://%s/%s", settings.AWS_TRANSCRIBE_BUCKET, s3_key)
    except Exception as e:
        logger.warning("Could not delete image file %s: %s", s3_key, e)


def _media_type_from_key(s3_key: str) -> str:
    """Infer image media type from S3 key extension."""
    ext = s3_key.rsplit(".", 1)[-1].lower() if "." in s3_key else ""
    return {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "gif": "image/gif",
        "heic": "image/heic",
        "heif": "image/heif",
    }.get(ext, "image/jpeg")


def _normalize_image(image_bytes: bytes, media_type: str) -> tuple[bytes, str]:
    """Convert HEIC/HEIF images to JPEG. Returns (bytes, media_type)."""
    if media_type not in ("image/heic", "image/heif"):
        return image_bytes, media_type
    try:
        import pillow_heif
        from PIL import Image

        pillow_heif.register_heif_opener()
        img = Image.open(io.BytesIO(image_bytes))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=90)
        logger.info("image_extract: converted HEIC/HEIF → JPEG (%d bytes)", buf.tell())
        return buf.getvalue(), "image/jpeg"
    except Exception as e:
        logger.warning("image_extract: HEIC conversion failed (%s), sending raw bytes", e)
        return image_bytes, "image/jpeg"


_OCR_PROMPT = (
    "Extract all text from this image verbatim. "
    "Return only the extracted text with no commentary, labels, or formatting additions. "
    "Preserve line breaks and structure as they appear in the image."
)

_VISION_PROMPT = (
    "Describe the content and meaning of this image in detail. "
    "If there is any text, include it exactly. "
    "Explain diagrams, charts, tables, handwritten content, or visual elements clearly and thoroughly."
)


async def _call_anthropic_vision(
    image_b64: str,
    media_type: str,
    prompt: str,
    api_key: str,
) -> str:
    """Call Anthropic claude-sonnet-4-6 vision API with a base64-encoded image."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-6",
                "max_tokens": 2048,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": image_b64,
                                },
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["content"][0]["text"].strip()


def _call_bedrock_vision(
    image_b64: str,
    media_type: str,
    prompt: str,
    extraction_mode: str,
) -> str:
    """Call Anthropic Claude via AWS Bedrock with a base64-encoded image."""
    model_id = settings.BEDROCK_OCR_MODEL_ID if extraction_mode == "ocr" else settings.BEDROCK_VISION_MODEL_ID
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2048,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_b64,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    })
    response = _get_bedrock().invoke_model(
        modelId=model_id,
        body=body,
        contentType="application/json",
        accept="application/json",
    )
    result = json.loads(response["body"].read())
    return result["content"][0]["text"].strip()


async def _call_openai_vision(
    image_b64: str,
    media_type: str,
    prompt: str,
    api_key: str,
) -> str:
    """Call OpenAI GPT-4o vision API with a base64-encoded image."""
    data_url = f"data:{media_type};base64,{image_b64}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o",
                "max_tokens": 2048,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": data_url},
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


async def image_extract_node(state: NoteRouteState) -> dict:
    """Download image from S3, run vision extraction (OCR or description), set transcript.

    Routing:
      - extraction_mode="ocr"    → extract text verbatim
      - extraction_mode="vision" → describe/interpret the image

    LLM priority:
      1. custom_llm_provider="anthropic" → user's Anthropic key (direct API)
      2. custom_llm_provider="openai"    → GPT-4o Vision (direct API)
      3. use_nova=True (GlobalConfig)    → Amazon Nova Pro via Bedrock
      4. default                         → AWS Bedrock (Haiku for OCR, Sonnet for vision)
    """
    s3_key = state.get("image_s3_key", "")
    extraction_mode = state.get("extraction_mode") or "vision"
    prompt = _OCR_PROMPT if extraction_mode == "ocr" else _VISION_PROMPT

    try:
        # Download image bytes from S3
        s3 = _get_s3()
        obj = await asyncio.to_thread(
            s3.get_object,
            Bucket=settings.AWS_TRANSCRIBE_BUCKET,
            Key=s3_key,
        )
        image_bytes = await asyncio.to_thread(obj["Body"].read)
        media_type = _media_type_from_key(s3_key)
        image_bytes, media_type = await asyncio.to_thread(_normalize_image, image_bytes, media_type)
        image_b64 = base64.b64encode(image_bytes).decode()

        # Route to appropriate vision LLM
        custom_provider = state.get("custom_llm_provider")
        custom_key = state.get("custom_llm_api_key")

        if custom_provider == "openai" and custom_key:
            logger.info("image_extract: using OpenAI GPT-4o Vision (BYOLLM)")
            extracted = await _call_openai_vision(image_b64, media_type, prompt, custom_key)
        elif custom_provider == "anthropic" and custom_key:
            logger.info("image_extract: using Anthropic Vision (BYOLLM)")
            extracted = await _call_anthropic_vision(image_b64, media_type, prompt, custom_key)
        else:
            global_cfg = await _fetch_global_config()
            use_nova = global_cfg.get("use_nova", False)
            if use_nova:
                logger.info("image_extract: using Nova Pro via Bedrock (mode=%s)", extraction_mode)
                extracted = await asyncio.to_thread(_call_nova_vision, image_bytes, media_type, prompt)
            else:
                model_id = settings.BEDROCK_OCR_MODEL_ID if extraction_mode == "ocr" else settings.BEDROCK_VISION_MODEL_ID
                logger.info("image_extract: using Bedrock %s (mode=%s)", model_id, extraction_mode)
                extracted = await asyncio.to_thread(_call_bedrock_vision, image_b64, media_type, prompt, extraction_mode)

        logger.info("image_extract complete: %d chars extracted", len(extracted))
        return {"transcript": extracted, "transcript_confidence": 1.0}

    except Exception as e:
        logger.error("Image extraction failed: %s", e)
        return {"error": str(e)}
    finally:
        if s3_key:
            _delete_image(s3_key)
