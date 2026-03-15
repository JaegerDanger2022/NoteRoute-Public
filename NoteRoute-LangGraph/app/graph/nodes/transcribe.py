import asyncio
import logging
import time
import uuid

import boto3
import httpx

from app.config import settings
from app.graph.state import NoteRouteState

logger = logging.getLogger(__name__)

_transcribe_client = None
_s3_client = None


def _get_transcribe_client():
    global _transcribe_client
    if _transcribe_client is None:
        _transcribe_client = boto3.client(
            "transcribe",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
    return _transcribe_client


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


def _delete_audio(s3_key: str) -> None:
    try:
        _get_s3().delete_object(Bucket=settings.AWS_TRANSCRIBE_BUCKET, Key=s3_key)
        logger.info("Deleted audio file s3://%s/%s", settings.AWS_TRANSCRIBE_BUCKET, s3_key)
    except Exception as e:
        logger.warning("Could not delete audio file %s: %s", s3_key, e)


async def _transcribe_groq(s3_key: str) -> str:
    """Download audio from S3 and transcribe via Groq Whisper. Returns transcript text.

    Groq's whisper-large-v3-turbo typically returns in 2-5s for short recordings,
    vs AWS Transcribe's 30-90s batch startup overhead.
    """
    # Download audio bytes from S3 into memory
    s3 = _get_s3()
    obj = await asyncio.to_thread(
        s3.get_object,
        Bucket=settings.AWS_TRANSCRIBE_BUCKET,
        Key=s3_key,
    )
    audio_bytes = await asyncio.to_thread(obj["Body"].read)

    filename = s3_key.split("/")[-1]
    # Ensure filename has a recognised extension for Groq's content-type sniffing
    if not any(filename.endswith(ext) for ext in (".webm", ".mp4", ".mp3", ".wav", ".ogg", ".m4a")):
        filename = filename + ".webm"

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            files={"file": (filename, audio_bytes, "audio/webm")},
            data={"model": "whisper-large-v3-turbo", "response_format": "text"},
        )
        response.raise_for_status()
        return response.text.strip()


async def _transcribe_aws(s3_key: str) -> tuple[str, float]:
    """Fallback: AWS Transcribe batch job. Returns (transcript, confidence)."""
    job_name = f"noteroute-{uuid.uuid4().hex[:12]}"
    s3_uri = f"s3://{settings.AWS_TRANSCRIBE_BUCKET}/{s3_key}"
    client = _get_transcribe_client()

    client.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={"MediaFileUri": s3_uri},
        MediaFormat="webm",
        LanguageCode="en-US",
    )

    for _ in range(120):
        await asyncio.sleep(5)
        response = await asyncio.to_thread(
            client.get_transcription_job, TranscriptionJobName=job_name
        )
        status = response["TranscriptionJob"]["TranscriptionJobStatus"]
        if status == "COMPLETED":
            transcript_uri = response["TranscriptionJob"]["Transcript"]["TranscriptFileUri"]
            async with httpx.AsyncClient() as http:
                result = await http.get(transcript_uri)
                data = result.json()
            transcript_text = data["results"]["transcripts"][0]["transcript"]
            confidence = float(
                data["results"]["items"][0]["alternatives"][0].get("confidence", "1.0")
            ) if data["results"].get("items") else 1.0
            return transcript_text, confidence
        elif status == "FAILED":
            reason = response["TranscriptionJob"].get("FailureReason", "Unknown")
            raise RuntimeError(f"AWS Transcription failed: {reason}")

    raise RuntimeError("AWS Transcription timed out")


async def transcribe_node(state: NoteRouteState) -> dict:
    """Transcribe audio using Groq Whisper (fast) with AWS Transcribe as fallback.

    If transcript is already set in state (text input mode), skip transcription entirely.
    Audio file is always deleted from S3 after this node, regardless of outcome.
    """
    if state.get("transcript"):
        return {"transcript": state["transcript"], "transcript_confidence": 1.0}

    s3_key = state["audio_s3_key"]

    try:
        if settings.GROQ_API_KEY:
            try:
                logger.info("Transcribing via Groq Whisper: %s", s3_key)
                t0 = time.perf_counter()
                transcript = await _transcribe_groq(s3_key)
                elapsed = round(time.perf_counter() - t0, 2)
                logger.info("Groq transcription complete in %.2fs", elapsed)
                return {"transcript": transcript, "transcript_confidence": 1.0}
            except Exception as e:
                logger.warning("Groq transcription failed (%s), falling back to AWS Transcribe", e)

        # AWS Transcribe fallback
        logger.info("Transcribing via AWS Transcribe: %s", s3_key)
        t0 = time.perf_counter()
        transcript, confidence = await _transcribe_aws(s3_key)
        elapsed = round(time.perf_counter() - t0, 2)
        logger.info("AWS transcription complete in %.2fs", elapsed)
        return {"transcript": transcript, "transcript_confidence": confidence}

    except Exception as e:
        logger.error("Transcription failed: %s", e)
        return {"error": str(e)}
    finally:
        _delete_audio(s3_key)
