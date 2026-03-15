"""
AskNovaAI — FastAPI Application
Main entry point with WebSocket endpoint for real-time AI tutoring.

Architecture:
  Browser ←WebSocket→ FastAPI ←Live API→ Gemini
  
  Messages (mixed binary + JSON over WebSocket):
    Client → Server:
      BINARY frame     → raw PCM 16-bit 16kHz audio
      JSON text frame  → { "type": "image",  "data": "<base64 JPEG>" }
      JSON text frame  → { "type": "config", "subject": "Math" }

    Server → Client:
      BINARY frame     → raw PCM 16-bit 24kHz audio response
      JSON text frame  → { "type": "input_transcript",  "text": "..." }
      JSON text frame  → { "type": "output_transcript", "text": "..." }
      JSON text frame  → { "type": "turn_complete" }
      JSON text frame  → { "type": "interrupted" }
      JSON text frame  → { "type": "error", "message": "..." }

  Latency optimisations:
    - Binary frames for audio (no base64 → 33% less data)
    - Audio messages always processed before images
    - uvloop event loop for faster async I/O
"""

import asyncio
import base64
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketState

from app.config import settings
from app.gemini_client import GeminiLiveSession

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
    logger.info("AskNovaAI backend starting up...")
    logger.info("Gemini model: %s", settings.GEMINI_MODEL)
    # Validate that API key is set
    if not settings.GOOGLE_API_KEY:
        logger.warning("⚠️  GOOGLE_API_KEY is not set! Gemini sessions will fail.")
    yield
    logger.info("AskNovaAI backend shutting down.")


# ── FastAPI App ──
app = FastAPI(
    title="AskNovaAI API",
    description="Real-time AI tutoring powered by Gemini Live API",
    version="2.0.0",
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
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "AskNovaAI Backend",
        "model": settings.GEMINI_MODEL,
        "api_key_set": bool(settings.GOOGLE_API_KEY),
    }


# ── WebSocket Tutor Endpoint ──
@app.websocket("/ws/tutor")
async def websocket_tutor(ws: WebSocket):
    """
    Main WebSocket endpoint for real-time tutoring sessions.
    
    Audio is sent as BINARY frames (raw PCM) for minimal latency.
    Control messages (config, transcript, turn signals) use JSON text frames.
    """
    await ws.accept()
    logger.info("WebSocket client connected.")

    gemini_session: GeminiLiveSession | None = None
    subject = "General"
    voice = "Charon"
    first_image_analyzed = False

    # ── Helper to send JSON safely ──
    async def send_json_safe(data: dict):
        """Send JSON to WebSocket, catching errors if closed."""
        try:
            if ws.client_state == WebSocketState.CONNECTED:
                await ws.send_json(data)
        except Exception:
            pass  # Client may have disconnected

    # ── Helper to send binary safely ──
    async def send_bytes_safe(data: bytes):
        """Send binary frame to WebSocket, catching errors if closed."""
        try:
            if ws.client_state == WebSocketState.CONNECTED:
                await ws.send_bytes(data)
        except Exception:
            pass

    # ── Gemini callback: audio response received ──
    async def on_audio(audio_data: bytes):
        """Forward audio response bytes to the client as binary frame."""
        await send_bytes_safe(audio_data)

    # ── Gemini callback: user speech transcription ──
    async def on_input_transcript(text: str):
        await send_json_safe({"type": "input_transcript", "text": text})

    # ── Gemini callback: Nova's speech transcription ──
    async def on_output_transcript(text: str):
        await send_json_safe({"type": "output_transcript", "text": text})

    # ── Gemini callback: turn complete ──
    async def on_turn_complete():
        await send_json_safe({"type": "turn_complete"})

    # ── Gemini callback: interrupted (barge-in) ──
    async def on_interrupted():
        await send_json_safe({"type": "interrupted"})

    async def create_and_connect_session():
        """Create a new Gemini session and connect it."""
        nonlocal gemini_session
        gemini_session = GeminiLiveSession(
            on_audio=on_audio,
            on_input_transcript=on_input_transcript,
            on_output_transcript=on_output_transcript,
            on_turn_complete=on_turn_complete,
            on_interrupted=on_interrupted,
            subject=subject,
            voice_name=voice,
        )
        await gemini_session.connect()
        await send_json_safe({"type": "connected"})
        logger.info("Gemini session connected for subject: %s", subject)

    try:
        # Wait for the first message to set up the session
        while True:
            try:
                message = await ws.receive()
            except WebSocketDisconnect:
                logger.info("WebSocket disconnected before session start.")
                return

            # ── Binary frame = raw PCM audio ──
            if "bytes" in message and message["bytes"]:
                # Audio came before config — connect with defaults then process
                await create_and_connect_session()
                await gemini_session.send_audio(message["bytes"])
                break

            # ── Text frame = JSON control message ──
            if "text" in message and message["text"]:
                try:
                    data = json.loads(message["text"])
                except json.JSONDecodeError:
                    await send_json_safe({"type": "error", "message": "Invalid JSON"})
                    continue

                msg_type = data.get("type", "")

                if msg_type == "config":
                    subject = data.get("subject", "General")
                    voice = data.get("voice", "Charon")
                    logger.info("Subject set to: %s, Voice set to: %s", subject, voice)
                    try:
                        await create_and_connect_session()
                        break
                    except Exception as e:
                        logger.error("Failed to connect Gemini: %s", e, exc_info=True)
                        await send_json_safe({
                            "type": "error",
                            "message": f"Failed to connect to AI tutor: {str(e)}",
                        })
                        return

                elif msg_type == "image" and data.get("data"):
                    # Image came before config — connect with defaults
                    await create_and_connect_session()
                    jpeg_bytes = base64.b64decode(data["data"])
                    await gemini_session.send_image(jpeg_bytes)
                    break

        # ── Main message loop ──
        while gemini_session and gemini_session.is_connected:
            try:
                message = await ws.receive()
            except (WebSocketDisconnect, RuntimeError):
                logger.info("WebSocket disconnected.")
                break

            # Handle disconnect message type from Starlette
            if message.get("type") == "websocket.disconnect":
                logger.info("WebSocket disconnect message received.")
                break

            # ── Binary frame = raw PCM audio (highest priority) ──
            if "bytes" in message and message["bytes"]:
                await gemini_session.send_audio(message["bytes"])
                continue

            # ── Text frame = JSON (image, config) ──
            if "text" in message and message["text"]:
                try:
                    data = json.loads(message["text"])
                except json.JSONDecodeError:
                    await send_json_safe({"type": "error", "message": "Invalid JSON"})
                    continue

                msg_type = data.get("type", "")

                if msg_type == "image" and data.get("data"):
                    jpeg_bytes = base64.b64decode(data["data"])
                    await gemini_session.send_image(jpeg_bytes)
                    
                    if not first_image_analyzed:
                        first_image_analyzed = True
                        
                        async def analyze_and_inject():
                            try:
                                logger.info("Analyzing initial frame with Pro model...")
                                from app.gemini_client import analyze_frame
                                analysis = await analyze_frame(data["data"], subject)
                                logger.info("Analysis context generated: %s", analysis)
                                await gemini_session.send_text(f"[System Context: The student's screen currently shows: {analysis}]")
                            except Exception as e:
                                logger.error("Pro analysis failed: %s", e)
                                
                        asyncio.create_task(analyze_and_inject())

                elif msg_type == "config":
                    new_subject = data.get("subject", subject)
                    new_voice = data.get("voice", voice)
                    if new_subject != subject or new_voice != voice:
                        subject = new_subject
                        voice = new_voice
                        logger.info("Subject/Voice config changed to: %s / %s", subject, voice)

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
        ws_ping_interval=20,
        ws_ping_timeout=20,
    )
