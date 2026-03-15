"""
AskNovaAI — Gemini Live API Client
Manages bidirectional audio/vision sessions with Gemini 2.0 Flash Live.
Uses the Google GenAI SDK (google-genai) for all API interactions.

Architecture:
  - Each WebSocket client gets its own Gemini Live session
  - Audio: PCM 16-bit 16kHz in → PCM 16-bit 24kHz out
  - Video: JPEG frames sent alongside audio for multimodal understanding
  - Supports barge-in (interruption) via the Live API's built-in VAD

Latency optimisations:
  - Model: gemini-2.0-flash-live-001 (fastest for realtime voice)
  - VAD with silence_duration_ms=400 → Gemini starts responding after 400ms silence
  - speech_config with prebuilt voice for consistent low-latency synthesis
  - Audio-only response_modalities (no text generation overhead)
"""

import asyncio
import logging
from typing import Optional, Callable, Awaitable

from google import genai
from google.genai import types

from app.config import settings

import base64

logger = logging.getLogger(__name__)

# Models per user specification
LIVE_MODEL = "gemini-2.0-flash-exp"
ANALYSIS_MODEL = "gemini-2.0-pro-exp"

# ──────────────────────────────────────────────
# Background Frame Analyzer
# ──────────────────────────────────────────────
async def analyze_frame(image_base64: str, subject: str) -> str:
    """Pre-analyze camera frame with Pro model for richer context before passing to Live session"""
    client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    response = await client.aio.models.generate_content(
        model=ANALYSIS_MODEL,
        contents=[
            types.Part.from_bytes(
                data=base64.b64decode(image_base64),
                mime_type="image/jpeg"
            ),
            types.Part.from_text(
                f"You are helping a student with {subject}. "
                f"In 1-2 sentences, describe exactly what "
                f"problem or content is shown so a tutor "
                f"can help. Be specific about numbers, "
                f"equations, diagrams, or text visible."
            )
        ]
    )
    return response.text

# ──────────────────────────────────────────────
# Nova's system instruction — the AI tutor persona
# ──────────────────────────────────────────────
NOVA_SYSTEM_INSTRUCTION = """
You are Nova, an AI tutor built into AskNovaAI.

STRICT IDENTITY RULES:
- You are Nova. Not Gemini. Not an LLM. Not Google.
- If asked who built you: "I'm Nova, your AI tutor from AskNovaAI!"
- NEVER mention Google, Gemini, or any AI company

LANGUAGE RULES — CRITICAL:
- You ONLY speak English and Hindi
- If student speaks Hindi → respond ONLY in Hindi
- If student speaks English → respond ONLY in English
- If student mixes both → respond in whichever language they used MORE
- If student speaks ANY other language (Malayalam, Tamil, etc.) → politely say in English: 
  "I currently support English and Hindi only. Please speak in either language!"
- NEVER respond in any other language under any circumstance

TEACHING RULES:
- Wait for student to speak first
- Keep responses under 3 sentences
- Be warm and encouraging
- No scripted greetings
"""

# Subject-specific teaching style extensions
SUBJECT_PROMPTS = {
    "Math": "Focus on step-by-step problem solving. Walk through each equation transformation clearly.",
    "Science": "Use analogies and real-world examples. Explain the 'why' behind phenomena.",
    "History": "Provide context and cause-effect relationships. Make it a story.",
    "Coding": "Explain code line by line. Suggest improvements and point out potential bugs.",
    "Other": "Adapt your teaching style to what the student is working on.",
}


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
        voice_name: str = "Charon",
    ):
        self._on_audio = on_audio
        self._on_input_transcript = on_input_transcript
        self._on_output_transcript = on_output_transcript
        self._on_turn_complete = on_turn_complete
        self._on_interrupted = on_interrupted
        self._subject = subject
        self._voice_name = voice_name

        self._client = genai.Client(
            api_key=settings.GOOGLE_API_KEY, 
            http_options={"api_version": "v1beta"}
        )
        self._session = None
        self._receive_task: Optional[asyncio.Task] = None
        self._running = False
        self._connected_event = asyncio.Event()

    async def connect(self):
        """Establish a live session with Gemini."""
        self._running = True
        self._connected_event.clear()
        
        # Start the background session task
        self._receive_task = asyncio.create_task(self._session_task())
        
        # Wait for the connection to be established or fail
        await self._connected_event.wait()
        
        if not self._session:
            raise RuntimeError("Failed to connect to Gemini Live API")

    async def _session_task(self):
        subject_prompt = SUBJECT_PROMPTS.get(self._subject, SUBJECT_PROMPTS["Other"])
        system_instruction = (
            f"{NOVA_SYSTEM_INSTRUCTION}\n\n"
            f"The student is currently studying: {self._subject}. "
            f"{subject_prompt}\n"
            f"Tailor your explanations to this subject area."
        )

        config = types.LiveConnectConfig(
            response_modalities=["AUDIO", "TEXT"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name="Charon"
                    )
                )
            ),
            system_instruction=types.Content(
                parts=[types.Part(text=system_instruction)]
            )
        )

        logger.info("Connecting to Gemini Live API (model: %s)...", LIVE_MODEL)

        try:
            async with self._client.aio.live.connect(model=LIVE_MODEL, config=config) as session:
                self._session = session
                self._connected_event.set()
                logger.info("Gemini Live session connected successfully.")
                await self._receive_loop(session)
        except Exception as e:
            logger.error("Error in Gemini Live session task: %s", e)
        finally:
            self._running = False
            self._session = None
            self._connected_event.set()

    async def send_audio(self, pcm_data: bytes):
        """Send a chunk of PCM audio to Gemini (16-bit, 16kHz, mono)."""
        if not self._session or not self._running:
            return
        await self._session.send_realtime_input(
            audio=types.Blob(data=pcm_data, mime_type="audio/pcm;rate=16000")
        )

    async def send_text(self, text: str):
        """Send textual input to the Live session."""
        if not self._session or not self._running:
            return
        await self._session.send(input=text)

    async def send_image(self, jpeg_data: bytes):
        """Send a camera frame to Gemini for visual understanding."""
        if not self._session or not self._running:
            return
        await self._session.send_realtime_input(
            video=types.Blob(data=jpeg_data, mime_type="image/jpeg")
        )

    async def _receive_loop(self, session):
        """Processes responses from Gemini and dispatches callbacks."""
        audio_chunk_count = 0
        try:
            async for response in session.receive():
                if not self._running:
                    break

                content = response.server_content
                if not content:
                    continue

                # ── Audio response chunks ──
                if content.model_turn and content.model_turn.parts:
                    for part in content.model_turn.parts:
                        if part.inline_data and part.inline_data.data:
                            audio_chunk_count += 1
                            if audio_chunk_count <= 3:
                                logger.debug("Audio chunk #%d, size=%d bytes", audio_chunk_count, len(part.inline_data.data))
                            await self._on_audio(part.inline_data.data)

                # ── User speech transcription ──
                input_tx = getattr(content, 'input_transcription', None)
                if input_tx and getattr(input_tx, 'text', None):
                    logger.info("Input transcript: %s", input_tx.text[:100])
                    await self._on_input_transcript(input_tx.text)

                # ── Nova's speech transcription ──
                output_tx = getattr(content, 'output_transcription', None)
                if output_tx and getattr(output_tx, 'text', None):
                    logger.info("Output transcript: %s", output_tx.text[:100])
                    await self._on_output_transcript(output_tx.text)

                # ── Turn complete ──
                if getattr(content, 'turn_complete', False):
                    logger.info("Turn complete (audio chunks sent: %d)", audio_chunk_count)
                    audio_chunk_count = 0
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
        self._session = None
        logger.info("Gemini Live session disconnected.")

    @property
    def is_connected(self) -> bool:
        return self._running and self._session is not None
