from datetime import datetime
from typing import Literal, Optional, TypedDict


class NoteRouteState(TypedDict):
    # Input
    run_id: str
    user_id: str
    audio_s3_key: str
    audio_duration_sec: float
    source_id: Optional[str]           # active source selected by user

    # Image input (alternative to audio)
    image_s3_key: Optional[str]        # set when input is an image
    extraction_mode: Optional[str]     # "ocr" | "vision"

    # BYOI — custom Pinecone + Bedrock creds (resolved once at embed time)
    custom_pinecone_api_key: Optional[str]
    custom_index_name: Optional[str]
    custom_bedrock_key_id: Optional[str]
    custom_bedrock_secret: Optional[str]
    custom_bedrock_region: Optional[str]

    # BYOLLM — custom LLM creds (resolved once at embed time)
    custom_llm_provider: Optional[str]   # "openai" | "anthropic" | None
    custom_llm_api_key: Optional[str]

    # Transcription
    transcript: Optional[str]
    transcript_confidence: Optional[float]

    # Embedding
    summary_text: Optional[str]
    summary_vector: Optional[list[float]]
    content_vector: Optional[list[float]]

    # Search results
    candidate_slots: Optional[list[dict]]   # [{slot_id, slot_name, score_combined}]
    ranked_slots: Optional[list[dict]]       # ordered list from Claude ranking

    # Human-in-the-loop confirmation
    confirmed_slot_id: Optional[str]
    save_as_slot: Optional[bool]
    target_tab_id: Optional[str]           # Google Docs tab to append to (None = main body)
    doc_title: Optional[str]               # User-provided title for save-as-new-slot
    trello_format: Optional[str]           # "note" | "checklist"
    trello_checklist_title: Optional[str]  # user-provided title for new checklist
    trello_checklist_id: Optional[str]     # existing checklist ID to append items to
    notion_parent_page_id: Optional[str]   # Notion parent page for save-as-new-slot
    confirmation_status: Optional[Literal["pending", "confirmed", "rejected", "timeout"]]

    # Delivery
    delivery_status: Optional[Literal["pending", "delivered", "failed"]]
    delivery_error: Optional[str]
    delivered_at: Optional[datetime]

    # Graph control
    error: Optional[str]
    retry_count: int
