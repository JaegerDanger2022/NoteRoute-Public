from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.base import BaseCheckpointSaver

from app.graph.state import NoteRouteState
from app.graph.nodes.transcribe import transcribe_node
from app.graph.nodes.image_extract import image_extract_node
from app.graph.nodes.embed import embed_node
from app.graph.nodes.search import search_node
from app.graph.nodes.rank import rank_node
from app.graph.nodes.confirm import confirm_node
from app.graph.nodes.deliver import deliver_node


def _route_input(state: NoteRouteState) -> str:
    """Route to the correct first node based on input type."""
    if state.get("image_s3_key"):
        return "image"
    if state.get("audio_s3_key"):
        return "audio"
    return "text"  # transcript already set — skip to embed


def _should_continue(state: NoteRouteState) -> str:
    """Route to END on any error, otherwise continue."""
    return "end" if state.get("error") else "continue"


def build_graph(checkpointer: BaseCheckpointSaver):
    builder = StateGraph(NoteRouteState)

    builder.add_node("transcribe", transcribe_node)
    builder.add_node("image_extract", image_extract_node)
    builder.add_node("embed", embed_node)
    builder.add_node("search", search_node)
    builder.add_node("rank", rank_node)
    builder.add_node("confirm", confirm_node)
    builder.add_node("deliver", deliver_node)

    # Entry routing: audio → transcribe, image → image_extract, text → embed
    builder.add_conditional_edges(START, _route_input, {
        "audio": "transcribe",
        "image": "image_extract",
        "text": "embed",
    })

    # Conditional edges: stop on error, else continue
    builder.add_conditional_edges(
        "transcribe", _should_continue,
        {"continue": "embed", "end": END},
    )
    builder.add_conditional_edges(
        "image_extract", _should_continue,
        {"continue": "embed", "end": END},
    )
    builder.add_conditional_edges(
        "embed", _should_continue,
        {"continue": "search", "end": END},
    )
    builder.add_conditional_edges(
        "search", _should_continue,
        {"continue": "rank", "end": END},
    )
    builder.add_edge("rank", "confirm")
    builder.add_edge("confirm", "deliver")
    builder.add_edge("deliver", END)

    return builder.compile(checkpointer=checkpointer)


# Placeholder — replaced at startup by main.py lifespan
graph = None
