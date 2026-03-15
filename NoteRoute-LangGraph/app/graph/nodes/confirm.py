from langgraph.types import interrupt

from app.graph.state import NoteRouteState


async def confirm_node(state: NoteRouteState) -> dict:
    """Pause the graph and wait for the user to confirm a slot selection.

    The frontend receives ranked_slots via SSE, the user taps a slot,
    and the backend resumes this graph by calling graph.invoke() with
    the confirmed slot_id as the resume value.
    """
    # interrupt() suspends the graph here and surfaces the payload to the caller.
    # Execution resumes when graph.invoke() is called with a resume Command.
    # resume value is a dict: {confirmed_slot_id, save_as_slot, target_tab_id}
    resume: dict = interrupt({
        "ranked_slots": state.get("ranked_slots", []),
        "transcript": state.get("transcript"),
        "summary": state.get("summary_text"),
    })

    return {
        "confirmed_slot_id": resume.get("confirmed_slot_id"),
        "save_as_slot": resume.get("save_as_slot", False),
        "target_tab_id": resume.get("target_tab_id"),
        "doc_title": resume.get("doc_title"),
        "trello_format": resume.get("trello_format", "note"),
        "trello_checklist_title": resume.get("trello_checklist_title"),
        "trello_checklist_id": resume.get("trello_checklist_id"),
        "notion_parent_page_id": resume.get("notion_parent_page_id"),
        "confirmation_status": "confirmed",
    }
