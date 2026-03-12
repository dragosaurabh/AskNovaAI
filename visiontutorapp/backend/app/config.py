"""
VisionTutor — Configuration
Loads environment variables for API keys and GCP settings.
"""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Google API key for Gemini Live API
    GOOGLE_API_KEY: str = ""

    # GCP project ID for Cloud Run deployment
    GCP_PROJECT_ID: str = ""

    # Google Cloud Storage bucket for session logs
    GCS_BUCKET_NAME: str = "visiontutor-session-logs"

    # Gemini model identifier
    GEMINI_MODEL: str = "gemini-2.0-flash-live-001"

    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # CORS allowed origins (comma-separated)
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
