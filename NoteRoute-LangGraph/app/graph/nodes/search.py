import asyncio
import logging

from pinecone import Pinecone

from app.config import settings
from app.graph.state import NoteRouteState

logger = logging.getLogger(__name__)

_NS_SUMMARY = "slot-summary"
_NS_CONTENT = "slot-content"

_shared_index = None


def _get_index(pinecone_api_key: str | None = None, index_name: str | None = None):
    global _shared_index
    if pinecone_api_key and index_name:
        pc = Pinecone(api_key=pinecone_api_key)
        return pc.Index(index_name)
    if _shared_index is None:
        pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        _shared_index = pc.Index(settings.PINECONE_INDEX_NAME)
    return _shared_index


_CONTENT_WEIGHT = 1.25  # boost for slots with real indexed content


def _query_namespace(
    namespace: str,
    vector: list[float],
    user_id: str,
    source_id: str,
    top_k: int,
    pinecone_api_key: str | None = None,
    index_name: str | None = None,
) -> list[dict]:
    idx = _get_index(pinecone_api_key, index_name)
    resp = idx.query(
        vector=vector,
        top_k=top_k,
        filter={"user_id": {"$eq": user_id}, "source_id": {"$eq": source_id}},
        namespace=namespace,
        include_values=False,
        include_metadata=True,
    )
    return resp.get("matches", [])


async def search_node(state: NoteRouteState) -> dict:
    """Pinecone dual-namespace search filtered by source. Merges scores and returns top candidates."""
    summary_vector = state.get("summary_vector")
    content_vector = state.get("content_vector")
    user_id = state["user_id"]
    source_id = state.get("source_id")

    if not summary_vector or not content_vector:
        return {"error": "Vectors not available for search"}

    if not source_id:
        return {"error": "No source_id in state — cannot filter slots"}

    # Use custom Pinecone index if set by embed_node
    custom_api_key = state.get("custom_pinecone_api_key")
    custom_index_name = state.get("custom_index_name")

    try:
        summary_matches, content_matches = await asyncio.gather(
            asyncio.to_thread(_query_namespace, _NS_SUMMARY, summary_vector, user_id, source_id, 20, custom_api_key, custom_index_name),
            asyncio.to_thread(_query_namespace, _NS_CONTENT, content_vector, user_id, source_id, 20, custom_api_key, custom_index_name),
        )
    except Exception as e:
        logger.error("Pinecone search failed: %s", e)
        return {"error": str(e)}

    # Merge scores — take max per slot across both namespaces.
    # Content vectors may be stored as chunks: '{slot_id}#0', '{slot_id}#1', …
    # Strip the suffix to recover the parent slot_id before merging.
    scores: dict[str, float] = {}
    names: dict[str, str] = {}
    for match in summary_matches:
        scores[match["id"]] = match["score"]
        names[match["id"]] = (match.get("metadata") or {}).get("slot_name", "")
    for match in content_matches:
        raw_id = match["id"]
        sid = raw_id.split("#")[0]  # strip chunk suffix if present
        meta = match.get("metadata") or {}
        raw_score = match["score"]
        # Slots with real indexed content get a boost — their vectors reflect
        # actual document content, which is more reliable than an inferred description.
        weighted_score = raw_score * _CONTENT_WEIGHT if meta.get("has_content") else raw_score
        scores[sid] = max(scores.get(sid, 0.0), weighted_score)
        if sid not in names:
            names[sid] = meta.get("slot_name", "")

    # Diversity-aware selection: walk sorted results and cap at 2 per name prefix
    # (e.g. "MERN > X" all share prefix "MERN") so clusters don't dominate.
    prefix_counts: dict[str, int] = {}
    diverse: list[tuple[str, float]] = []
    overflow: list[tuple[str, float]] = []
    for sid, score in sorted(scores.items(), key=lambda x: x[1], reverse=True):
        raw_name = names.get(sid, "")
        prefix = raw_name.split(">")[0].strip().lower() if ">" in raw_name else raw_name.lower()
        count = prefix_counts.get(prefix, 0)
        if count < 2:
            diverse.append((sid, score))
            prefix_counts[prefix] = count + 1
        else:
            overflow.append((sid, score))
        if len(diverse) == 10:
            break

    # If diversity filtering left us with fewer than 5, backfill from overflow
    if len(diverse) < 5:
        needed = 5 - len(diverse)
        diverse.extend(overflow[:needed])

    candidates = [
        {
            "slot_id": sid,
            "slot_name": "",   # enriched by rank_node via MongoDB lookup
            "score_combined": round(score, 4),
        }
        for sid, score in diverse
    ]

    return {"candidate_slots": candidates}
