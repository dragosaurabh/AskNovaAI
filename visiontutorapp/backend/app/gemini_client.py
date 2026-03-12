"""
VisionTutor — Gemini Live API Client
Manages bidirectional audio/vision sessions with Gemini 2.0 Flash Live.
Uses the Google GenAI SDK (google-genai) for all API interactions.

Architecture:
  - Each WebSocket client gets its own Gemini Live session
  - Audio: PCM 16-bit 16kHz in → PCM 16-bit 24kHz out
  - Video: JPEG frames sent alongside audio for multimodal understanding
  - Supports barge-in (interruption) via the Live API's built-in VAD
"""

import asyncio
import logging
from typing import Optional, Callable, Awaitable

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Nova's system instruction — the AI tutor persona
# ──────────────────────────────────────────────
NOVA_SYSTEM_INSTRUCTION = """You are Nova, a warm and patient AI tutor. The student will show \
you their homework or study material using their camera. You can SEE what they are showing you. \
Explain concepts clearly, step-by-step, at their level. Encourage them when they get things right. \
When interrupted, stop immediately and address their new question. Keep explanations concise — \
no more than 3 sentences before pausing for the student to respond."""


class GeminiLiveSession:
    """
    Wraps a single Gemini Live API session for one student.
    Handles sending audio/video and receiving audio/transcription responses.
    """

    def __init__(
        self,
        on_audio: Callable[[bytes], Awaitable[None]],
        on_input_transcript: Callable[[str], Awaitable[None]],
        on_output_transcript: Callable[[str], Awaitable[None]],
        on_turn_complete: Callable[[], Awaitable[None]],
        on_interrupted: Callable[[], Awaitable[None]],
        subject: str = "General",
    ):
        self._on_audio = on_audio
        self._on_input_transcript = on_input_transcript
        self._on_output_transcript = on_output_transcript
        self._on_turn_complete = on_turn_complete
        self._on_interrupted = on_interrupted
        self._subject = subject

        self._client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        self._session = None
        self._session_cm = None  # Async context manager for the live connection
        self._receive_task: Optional[asyncio.Task] = None
        self._running = False

    async def connect(self):
        """Establish a live session with Gemini."""
        system_instruction = (
            f"{NOVA_SYSTEM_INSTRUCTION}\n\n"
            f"The student is currently studying: {self._subject}. "
            f"Tailor your explanations to this subject area."
        )

        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            system_instruction=types.Content(
                parts=[types.Part(text=system_instruction)]
            ),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
        )

        logger.info("Connecting to Gemini Live API (model: %s)...", settings.GEMINI_MODEL)

        # client.aio.live.connect() returns an async context manager.
        # We call __aenter__() manually so we can manage the session
        # lifecycle ourselves (disconnect when WebSocket closes).
        self._session_cm = self._client.aio.live.connect(
            model=settings.GEMINI_MODEL,
            config=config,
        )
        self._session = await self._session_cm.__aenter__()
        self._running = True

        # Start the background receiver loop
        self._receive_task = asyncio.create_task(self._receive_loop())
        logger.info("Gemini Live session connected successfully.")

    async def send_audio(self, pcm_data: bytes):
        """
        Send a chunk of PCM audio to Gemini.
        Expected format: PCM 16-bit, 16kHz, mono, little-endian.
        """
        if not self._session or not self._running:
            return

        await self._session.send_realtime_input(
            audio=types.Blob(
                data=pcm_data,
                mime_type="audio/pcm;rate=16000",
            )
        )

    async def send_image(self, jpeg_data: bytes):
        """
        Send a camera frame to Gemini for visual understanding.
        Expected format: JPEG encoded image bytes.
        """
        if not self._session or not self._running:
            return

        await self._session.send_realtime_input(
            video=types.Blob(
                data=jpeg_data,
                mime_type="image/jpeg",
            )
        )

    async def _receive_loop(self):
        """
        Background task that continuously receives responses from Gemini.
        Dispatches audio data, transcriptions, and control signals
        to the registered callbacks.
        """
        try:
            async for response in self._session.receive():
                if not self._running:
                    break

                content = response.server_content
                if not content:
                    continue

                # ── Audio response chunks ──
                if content.model_turn and content.model_turn.parts:
                    for part in content.model_turn.parts:
                        if part.inline_data and part.inline_data.data:
                            await self._on_audio(part.inline_data.data)

                # ── User speech transcription ──
                input_tx = getattr(content, 'input_transcription', None)
                if input_tx and getattr(input_tx, 'text', None):
                    await self._on_input_transcript(input_tx.text)

                # ── Nova's speech transcription ──
                output_tx = getattr(content, 'output_transcription', None)
                if output_tx and getattr(output_tx, 'text', None):
                    await self._on_output_transcript(output_tx.text)

                # ── Turn complete (Nova finished speaking) ──
                if getattr(content, 'turn_complete', False):
                    await self._on_turn_complete()

                # ── Barge-in / interruption ──
                if getattr(content, 'interrupted', False):
                    await self._on_interrupted()

        except asyncio.CancelledError:
            logger.info("Receive loop cancelled.")
        except Exception as e:
            logger.error("Error in Gemini receive loop: %s", e, exc_info=True)
        finally:
            self._running = False

    async def disconnect(self):
        """Cleanly close the Gemini Live session."""
        self._running = False

        if self._receive_task and not self._receive_task.done():
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass

        if self._session_cm:
            try:
                await self._session_cm.__aexit__(None, None, None)
            except Exception as e:
                logger.warning("Error closing Gemini session: %s", e)
            self._session = None
            self._session_cm = None

        logger.info("Gemini Live session disconnected.")

    @property
    def is_connected(self) -> bool:
        """Check if the session is currently active."""
        return self._running and self._session is not None
