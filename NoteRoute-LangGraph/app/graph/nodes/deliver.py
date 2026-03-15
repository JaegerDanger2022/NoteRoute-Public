import logging
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.graph.state import NoteRouteState

logger = logging.getLogger(__name__)


async def deliver_node(state: NoteRouteState) -> dict:
    """POST the transcript to the FastAPI backend delivery endpoint."""
    slot_id = state.get("confirmed_slot_id")
    save_as_slot = state.get("save_as_slot", False)
    transcript = state.get("transcript", "")
    summary = state.get("summary_text", "")
    user_id = state["user_id"]
    run_id = state.get("run_id", "")

    if not save_as_slot and not slot_id:
        return {"delivery_status": "failed", "delivery_error": "No confirmed slot"}

    payload = {
        "run_id": run_id,
        "slot_id": slot_id,
        "content": transcript,
        "summary": summary,
        "user_id": user_id,
        "save_as_slot": save_as_slot,
        "target_tab_id": state.get("target_tab_id"),
        "doc_title": state.get("doc_title"),
        "trello_format": state.get("trello_format", "note"),
        "trello_checklist_title": state.get("trello_checklist_title"),
        "trello_checklist_id": state.get("trello_checklist_id"),
        "notion_parent_page_id": state.get("notion_parent_page_id"),
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.backend_url}/api/v1/deliver",
                json=payload,
            )
            logger.info("deliver POST status=%d body=%s", response.status_code, response.text[:500])
            response.raise_for_status()
            data = response.json()
        return {
            "delivery_status": "delivered",
            "delivered_at": datetime.now(timezone.utc),
            # Forward fields the frontend needs to show the delivered slot
            "slot_id": data.get("slot_id"),
            "slot_name": data.get("slot_name"),
            "saved_as_new_slot": data.get("saved_as_new_slot", False),
        }
    except Exception as e:
        logger.error("Delivery failed: %s", e)
        return {"delivery_status": "failed", "delivery_error": str(e)}
