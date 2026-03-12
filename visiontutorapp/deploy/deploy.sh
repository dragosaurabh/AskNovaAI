#!/usr/bin/env bash
# ─── VisionTutor — Cloud Run Deployment Script ───
# Deploys both frontend and backend to Google Cloud Run.
#
# PREREQUISITE: Install gcloud CLI and authenticate:
#   gcloud auth login
#   gcloud config set project YOUR_PROJECT_ID
#
# USAGE:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# ───────────────────────────────────────────────────────
# GCP SERVICES USED (Hackathon Requirement):
#   1. Google Cloud Run        — Hosting both frontend and backend
#   2. Google Cloud Build      — Building container images
#   3. Google Artifact Registry — Storing container images
#   4. Google Cloud Storage    — Storing session logs
#   5. Gemini Live API         — AI tutoring (via Google GenAI SDK)
# ───────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ──
PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID environment variable}"
REGION="us-central1"
BACKEND_SERVICE="visiontutor-backend"
FRONTEND_SERVICE="visiontutor-frontend"
GCS_BUCKET="${GCS_BUCKET_NAME:-visiontutor-session-logs}"
GOOGLE_API_KEY="${GOOGLE_API_KEY:?Set GOOGLE_API_KEY environment variable}"

echo "╔══════════════════════════════════════════════╗"
echo "║   VisionTutor — Cloud Run Deployment         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Project:  $PROJECT_ID"
echo "Region:   $REGION"
echo ""

# ── Step 1: Enable required GCP APIs ──
echo "➤ Enabling GCP APIs..."
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    storage.googleapis.com \
    --project="$PROJECT_ID"

# ── Step 2: Create Cloud Storage bucket for session logs ──
# GCP Service: Google Cloud Storage
echo "➤ Creating GCS bucket: gs://$GCS_BUCKET ..."
gsutil mb -p "$PROJECT_ID" -l "$REGION" "gs://$GCS_BUCKET" 2>/dev/null || \
    echo "  Bucket already exists, skipping."

# ── Step 3: Deploy Backend to Cloud Run ──
# GCP Service: Google Cloud Run + Cloud Build
echo "➤ Building and deploying backend..."
cd "$(dirname "$0")/../backend"
gcloud run deploy "$BACKEND_SERVICE" \
    --source . \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --allow-unauthenticated \
    --set-env-vars "GOOGLE_API_KEY=$GOOGLE_API_KEY,GCP_PROJECT_ID=$PROJECT_ID,GCS_BUCKET_NAME=$GCS_BUCKET" \
    --memory 1Gi \
    --cpu 2 \
    --timeout 3600 \
    --session-affinity \
    --min-instances 0 \
    --max-instances 10

# Get the backend URL
BACKEND_URL=$(gcloud run services describe "$BACKEND_SERVICE" \
    --region "$REGION" --project "$PROJECT_ID" \
    --format "value(status.url)")
echo "  Backend deployed at: $BACKEND_URL"

# ── Step 4: Build and Deploy Frontend to Cloud Run ──
# GCP Service: Google Cloud Run + Cloud Build
echo "➤ Building frontend..."
cd "$(dirname "$0")/../frontend"

# Set the backend URL for the frontend build
echo "VITE_WS_URL=${BACKEND_URL}/ws/tutor" > .env.production

gcloud run deploy "$FRONTEND_SERVICE" \
    --source . \
    --region "$REGION" \
    --project "$PROJECT_ID" \
    --allow-unauthenticated \
    --memory 256Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 5

FRONTEND_URL=$(gcloud run services describe "$FRONTEND_SERVICE" \
    --region "$REGION" --project "$PROJECT_ID" \
    --format "value(status.url)")

# ── Step 5: Update backend CORS with frontend URL ──
echo "➤ Updating backend CORS origins..."
gcloud run services update "$BACKEND_SERVICE" \
    --region "$REGION" --project "$PROJECT_ID" \
    --update-env-vars "CORS_ORIGINS=$FRONTEND_URL,http://localhost:5173"

# ── Done ──
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅ Deployment Complete!                    ║"
echo "╠══════════════════════════════════════════════╣"
echo "║   Frontend: $FRONTEND_URL"
echo "║   Backend:  $BACKEND_URL"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Open $FRONTEND_URL in Chrome to start tutoring!"
