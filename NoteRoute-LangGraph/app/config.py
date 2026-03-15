from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    APP_ENV: str = "development"

    # MongoDB
    MONGODB_URL: str = ""
    MONGODB_DB_NAME: str = "noteroute"

    # PostgreSQL (LangGraph checkpointer) — Railway injects this as DATABASE_URL
    DATABASE_URL: str

    # AWS
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    AWS_REGION: str = "us-east-1"
    AWS_TRANSCRIBE_BUCKET: str

    # Bedrock models — standard (Nova OFF)
    BEDROCK_EMBED_MODEL_ID: str = "amazon.titan-embed-text-v2:0"
    BEDROCK_VISION_MODEL_ID: str = "us.anthropic.claude-3-5-sonnet-20241022-v2:0"
    BEDROCK_OCR_MODEL_ID: str = "us.anthropic.claude-3-haiku-20240307-v1:0"
    CLAUDE_MODEL_ID: str = "us.anthropic.claude-3-5-sonnet-20241022-v2:0"

    # Bedrock models — Nova (Nova ON)
    NOVA_EMBED_MODEL_ID: str = "amazon.nova-2-multimodal-embeddings-v1:0"
    NOVA_LITE_MODEL_ID: str = "amazon.nova-lite-v1:0"
    NOVA_PRO_MODEL_ID: str = "amazon.nova-pro-v1:0"

    # Pinecone
    PINECONE_API_KEY: str
    PINECONE_INDEX_NAME: str = "noteroute-shared"

    # Groq (fast Whisper transcription — preferred over AWS Transcribe)
    GROQ_API_KEY: str = ""

    # Backend internal URL (for delivery callbacks) — must NOT have a trailing slash
    BACKEND_INTERNAL_URL: str = "http://noteroute-backend.railway.internal:8000"

    @property
    def backend_url(self) -> str:
        """Return BACKEND_INTERNAL_URL with any trailing slash stripped."""
        return self.BACKEND_INTERNAL_URL.rstrip("/")


settings = Settings()
