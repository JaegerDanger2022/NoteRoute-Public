import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.api.endpoints import router as pipeline_router
from app.config import settings
import app.graph.graph as graph_module

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting NoteRoute LangGraph service...")
    async with AsyncPostgresSaver.from_conn_string(settings.DATABASE_URL) as checkpointer:
        try:
            await checkpointer.setup()
        except Exception as e:
            # setup() can race on multi-worker startup — safe to ignore duplicate key errors
            logger.warning("Checkpointer setup skipped (likely already initialized): %s", e)
        graph_module.graph = graph_module.build_graph(checkpointer)
        logger.info("PostgreSQL checkpointer ready")
        yield
    logger.info("LangGraph service shutdown complete")


app = FastAPI(
    title="NoteRoute LangGraph",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
)

app.include_router(pipeline_router)


@app.get("/health", tags=["health"])
async def health() -> dict:
    return {
        "status": "ok",
        "service": "noteroute-langgraph",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
