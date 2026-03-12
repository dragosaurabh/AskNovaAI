# 🎓 VisionTutor — AI-Powered Study Assistant

> **See it. Say it. Learn it.** Point your camera at any homework problem and talk to Nova, your personal AI tutor powered by Google Gemini.

[![Built with Gemini](https://img.shields.io/badge/Built%20with-Gemini%20Live%20API-blue?style=for-the-badge&logo=google)](https://ai.google.dev/gemini-api/docs/live)
[![Cloud Run](https://img.shields.io/badge/Deployed%20on-Cloud%20Run-4285F4?style=for-the-badge&logo=google-cloud)](https://cloud.google.com/run)

---

## 🌟 What is VisionTutor?

VisionTutor is a real-time AI study assistant that lets students:

1. **📷 Show their homework** — Open the camera and point it at any problem, textbook page, diagram, or equation
2. **🎤 Talk naturally** — Ask questions using your voice, just like talking to a real tutor
3. **🤖 Get instant help** — Nova sees your screen, understands the problem, and explains step-by-step via voice
4. **⚡ Interrupt anytime** — Say "wait, explain that again" and Nova stops immediately to address your question
5. **📝 Read along** — Real-time transcript shows the full conversation on screen

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React.js + Vite | Single-page app with camera/mic capture |
| **Backend** | Python + FastAPI | WebSocket server, Gemini session management |
| **AI Model** | Gemini 2.0 Flash Live | Real-time bidirectional audio + vision |
| **AI SDK** | Google GenAI SDK (`google-genai`) | Python SDK for Gemini Live API |
| **Deployment** | Google Cloud Run | Serverless container hosting |
| **Storage** | Google Cloud Storage | Session logs |
| **Audio** | Web Audio API | PCM 16-bit capture (16kHz) and playback (24kHz) |

## 📋 Prerequisites

- **Node.js** ≥ 18 (for frontend)
- **Python** ≥ 3.10 (for backend)
- **Google API Key** with Gemini API access
- **gcloud CLI** (for Cloud Run deployment)
- **Docker** (optional, for local container testing)

## 🔑 Getting a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click **"Create API Key"**
3. Copy the key — you'll need it for the `.env` file

## 🚀 Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/visiontutorapp.git
cd visiontutorapp
```

### 2. Set up the backend

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your GOOGLE_API_KEY
```

### 3. Set up the frontend

```bash
cd ../frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Default WebSocket URL points to localhost:8000 — no changes needed for local dev
```

### 4. Start the backend

```bash
cd ../backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Start the frontend (in a new terminal)

```bash
cd frontend
npm run dev
```

### 6. Open in browser

Navigate to **http://localhost:5173** in Chrome or Safari.

1. Click **"Talk to Nova"**
2. Grant camera and microphone permissions
3. Point your camera at a homework problem
4. Start talking!

## ☁️ Cloud Run Deployment

### 1. Authenticate with Google Cloud

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### 2. Set environment variables

```bash
export GCP_PROJECT_ID="your-project-id"
export GOOGLE_API_KEY="your-gemini-api-key"
export GCS_BUCKET_NAME="visiontutor-session-logs"  # optional
```

### 3. Deploy

```bash
cd deploy
chmod +x deploy.sh
./deploy.sh
```

The script will:
- Enable required GCP APIs (Cloud Run, Cloud Build, Artifact Registry, Cloud Storage)
- Create a Cloud Storage bucket for session logs
- Build and deploy the backend to Cloud Run
- Build and deploy the frontend to Cloud Run
- Update CORS settings with the frontend URL

### 4. Access your app

The deployment script prints the frontend URL at the end. Open it in Chrome!

## 🎥 Recording a GCP Deployment Proof Video

For hackathon judges, record a video showing:

1. **GCP Console** — Show Cloud Run services running
2. **Cloud Storage** — Show the session logs bucket
3. **Live Demo** — Open the deployed frontend URL, grant permissions, and have a tutoring session with Nova
4. **API Usage** — Show the Gemini API usage in Google AI Studio

Tips:
- Use Chrome's built-in screen recorder or OBS
- Show the browser URL bar to prove it's deployed (not localhost)
- Have a real homework problem ready for the demo

## 📁 Project Structure

```
visiontutorapp/
├── frontend/                    # React + Vite SPA
│   ├── src/
│   │   ├── components/          # UI components (8 total)
│   │   ├── hooks/               # Custom React hooks (WebSocket, Audio, Camera)
│   │   ├── utils/               # Helper functions
│   │   ├── App.jsx              # Main application orchestrator
│   │   └── index.css            # Design system
│   └── package.json
├── backend/                     # FastAPI + Gemini Live API
│   ├── app/
│   │   ├── main.py              # FastAPI app + WebSocket endpoint
│   │   ├── gemini_client.py     # Gemini Live session wrapper
│   │   ├── config.py            # Environment config
│   │   └── audio_utils.py       # PCM ↔ base64 helpers
│   ├── requirements.txt
│   └── Dockerfile
├── deploy/                      # Deployment configs
│   ├── deploy.sh                # Cloud Run deployment script
│   ├── docker-compose.yml       # Local container testing
│   ├── nginx.conf               # Frontend nginx config
│   └── Dockerfile.frontend      # Frontend container
├── architecture-diagram.md      # System architecture
└── README.md                    # This file
```

## 🔒 Security Notes

- **No hardcoded API keys** — All secrets are loaded from environment variables
- **CORS configured** — Backend only accepts requests from known frontend origins
- **Permissions handled** — Graceful error messages if camera/mic access is denied
- **Session isolation** — Each WebSocket connection gets its own Gemini session

## 📄 License

Built for the **Gemini Live Agent Challenge** hackathon. MIT License.
