"""
VisionTutor — FastAPI Application
Main entry point with WebSocket endpoint for real-time AI tutoring.

Architecture:
  Browser ←WebSocket→ FastAPI ←Live API→ Gemini
  
  Messages (JSON over WebSocket):
    Client → Server:
      { "type": "audio",   "data": "<base64 PCM 16-bit 16kHz>" }
      { "type": "image",   "data": "<base64 JPEG>" }
      { "type": "config",  "subject": "Math" }

    Server → Client:
      { "type": "audio",            "data": "<base64 PCM 16-bit 24kHz>" }
      { "type": "input_transcript",  "text": "user said..." }
      { "type": "output_transcript", "text": "Nova said..." }
      { "type": "turn_complete" }
      { "type": "interrupted" }
      { "type": "error",            "message": "..." }
"""

import asyncio
import base64
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.gemini_client import GeminiLiveSession
from app.audio_utils import pcm_to_base64, base64_to_pcm

# ── Logging ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ── App Lifecycle ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    logger.info("VisionTutor backend starting up...")
    logger.info("Gemini model: %s", settings.GEMINI_MODEL)
    # Validate that API key is set
    if not settings.GOOGLE_API_KEY:
        logger.warning("⚠️  GOOGLE_API_KEY is not set! Gemini sessions will fail.")
    yield
    logger.info("VisionTutor backend shutting down.")


# ── FastAPI App ──
app = FastAPI(
    title="VisionTutor API",
    description="Real-time AI tutoring powered by Gemini Live API",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──
origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health Check ──
@app.get("/api/health")
async def health_check():
    """Health check endpoint for Cloud Run."""
    return {
        "status": "healthy",
        "service": "VisionTutor Backend",
        "model": settings.GEMINI_MODEL,
        "api_key_set": bool(settings.GOOGLE_API_KEY),
    }


# ── WebSocket Tutor Endpoint ──
@app.websocket("/ws/tutor")
async def websocket_tutor(ws: WebSocket):
    """
    Main WebSocket endpoint for real-time tutoring sessions.
    
    Each WebSocket connection creates a dedicated Gemini Live session.
    The client sends audio chunks and camera frames; the server
    streams back audio responses and transcriptions.
    """
    await ws.accept()
    logger.info("WebSocket client connected.")

    gemini_session: GeminiLiveSession | None = None
    subject = "General"

    # ── Helper to send JSON safely ──
    async def send_json_safe(data: dict):
        """Send JSON to WebSocket, catching errors if closed."""
        try:
            await ws.send_json(data)
        except Exception:
            pass  # Client may have disconnected

    # ── Gemini callback: audio response received ──
    async def on_audio(audio_data: bytes):
        """Forward audio response bytes to the client as base64."""
        await send_json_safe({
            "type": "audio",
            "data": pcm_to_base64(audio_data),
        })

    # ── Gemini callback: user speech transcription ──
    async def on_input_transcript(text: str):
        """Forward user speech transcription to the client."""
        await send_json_safe({
            "type": "input_transcript",
            "text": text,
        })

    # ── Gemini callback: Nova's speech transcription ──
    async def on_output_transcript(text: str):
        """Forward Nova's speech transcription to the client."""
        await send_json_safe({
            "type": "output_transcript",
            "text": text,
        })

    # ── Gemini callback: turn complete ──
    async def on_turn_complete():
        """Notify client that Nova finished speaking."""
        await send_json_safe({"type": "turn_complete"})

    # ── Gemini callback: interrupted (barge-in) ──
    async def on_interrupted():
        """Notify client that Nova was interrupted."""
        await send_json_safe({"type": "interrupted"})

    try:
        # Wait for the first message to set up the session
        # (could be a config message with subject, or audio right away)
        while True:
            try:
                raw = await ws.receive_text()
                message = json.loads(raw)
            except WebSocketDisconnect:
                logger.info("WebSocket disconnected before session start.")
                return
            except json.JSONDecodeError:
                await send_json_safe({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = message.get("type", "")

            # ── Config message: set subject before connecting ──
            if msg_type == "config":
                subject = message.get("subject", "General")
                logger.info("Subject set to: %s", subject)

                # Create and connect the Gemini session
                gemini_session = GeminiLiveSession(
                    on_audio=on_audio,
                    on_input_transcript=on_input_transcript,
                    on_output_transcript=on_output_transcript,
                    on_turn_complete=on_turn_complete,
                    on_interrupted=on_interrupted,
                    subject=subject,
                )

                try:
                    await gemini_session.connect()
                    await send_json_safe({"type": "connected"})
                    logger.info("Gemini session connected for subject: %s", subject)
                    break  # Move to the main message loop
                except Exception as e:
                    logger.error("Failed to connect Gemini session: %s", e, exc_info=True)
                    await send_json_safe({
                        "type": "error",
                        "message": f"Failed to connect to AI tutor: {str(e)}",
                    })
                    return

            # ── If audio comes before config, connect with defaults ──
            elif msg_type in ("audio", "image"):
                gemini_session = GeminiLiveSession(
                    on_audio=on_audio,
                    on_input_transcript=on_input_transcript,
                    on_output_transcript=on_output_transcript,
                    on_turn_complete=on_turn_complete,
                    on_interrupted=on_interrupted,
                    subject=subject,
                )

                try:
                    await gemini_session.connect()
                    await send_json_safe({"type": "connected"})
                except Exception as e:
                    logger.error("Failed to connect Gemini session: %s", e, exc_info=True)
                    await send_json_safe({
                        "type": "error",
                        "message": f"Failed to connect to AI tutor: {str(e)}",
                    })
                    return

                # Process this first audio/image message
                if msg_type == "audio" and message.get("data"):
                    pcm_bytes = base64_to_pcm(message["data"])
                    await gemini_session.send_audio(pcm_bytes)
                elif msg_type == "image" and message.get("data"):
                    jpeg_bytes = base64.b64decode(message["data"])
                    await gemini_session.send_image(jpeg_bytes)
                break

        # ── Main message loop ──
        while gemini_session and gemini_session.is_connected:
            try:
                raw = await ws.receive_text()
                message = json.loads(raw)
            except WebSocketDisconnect:
                logger.info("WebSocket disconnected.")
                break
            except json.JSONDecodeError:
                await send_json_safe({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = message.get("type", "")

            if msg_type == "audio" and message.get("data"):
                # Decode base64 audio and forward to Gemini
                pcm_bytes = base64_to_pcm(message["data"])
                await gemini_session.send_audio(pcm_bytes)

            elif msg_type == "image" and message.get("data"):
                # Decode base64 JPEG frame and forward to Gemini
                jpeg_bytes = base64.b64decode(message["data"])
                await gemini_session.send_image(jpeg_bytes)

            elif msg_type == "config":
                # Subject change mid-session (not supported by Live API,
                # but we log it for transcript purposes)
                new_subject = message.get("subject", subject)
                if new_subject != subject:
                    subject = new_subject
                    logger.info("Subject changed to: %s", subject)

    except Exception as e:
        logger.error("Unexpected error in WebSocket handler: %s", e, exc_info=True)
        await send_json_safe({
            "type": "error",
            "message": "Internal server error",
        })

    finally:
        # ── Clean up Gemini session ──
        if gemini_session:
            await gemini_session.disconnect()
        logger.info("WebSocket session ended.")


# ── Run with uvicorn (for local dev) ──
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
        log_level="info",
    )
