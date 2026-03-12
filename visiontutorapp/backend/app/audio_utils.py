"""
VisionTutor — Audio Utilities
Helpers for PCM audio encoding/decoding between base64 and raw bytes.
"""

import base64


def pcm_to_base64(pcm_bytes: bytes) -> str:
    """Encode raw PCM bytes to base64 string for WebSocket transport."""
    return base64.b64encode(pcm_bytes).decode("utf-8")


def base64_to_pcm(b64_string: str) -> bytes:
    """Decode base64 string back to raw PCM bytes."""
    return base64.b64decode(b64_string)


def validate_pcm_chunk(pcm_bytes: bytes, sample_rate: int = 16000, bit_depth: int = 16) -> bool:
    """
    Validate that a PCM chunk has valid alignment.
    PCM 16-bit mono: each sample is 2 bytes.
    """
    bytes_per_sample = bit_depth // 8
    return len(pcm_bytes) % bytes_per_sample == 0
