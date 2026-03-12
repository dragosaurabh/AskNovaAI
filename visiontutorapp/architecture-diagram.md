# VisionTutor — Architecture Diagram

## System Architecture

```mermaid
flowchart TB
    subgraph Browser["🌐 Browser (Chrome/Safari)"]
        UI["React SPA<br/>Camera + Mic + Transcript"]
        WA["Web Audio API<br/>PCM 16-bit 16kHz"]
        GM["getUserMedia<br/>Video + Audio"]
    end

    subgraph CloudRun["☁️ Google Cloud Run"]
        subgraph FrontendService["Frontend Service"]
            NGINX["nginx<br/>Static SPA Serving"]
        end
        
        subgraph BackendService["Backend Service"]
            FAST["FastAPI<br/>WebSocket /ws/tutor"]
            GC["Gemini Client<br/>Session Manager"]
        end
    end

    subgraph GCP["🔷 Google Cloud Platform"]
        GEMINI["Gemini Live API<br/>gemini-2.0-flash-live-001"]
        GCS["Cloud Storage<br/>Session Logs"]
    end

    %% User interactions
    UI -->|"HTTPS"| NGINX
    NGINX -->|"Static files"| UI
    
    %% WebSocket data flow
    UI <-->|"WebSocket (wss://)"| FAST
    
    %% Audio flow
    GM -->|"Mic audio"| WA
    WA -->|"PCM base64 chunks"| UI
    
    %% Backend to Gemini
    FAST --> GC
    GC <-->|"Bidirectional Stream"| GEMINI
    GC -->|"Session logs"| GCS

    %% Styling
    classDef browser fill:#1e1b4b,stroke:#7c3aed,color:#f1f5f9
    classDef cloudrun fill:#0f172a,stroke:#3b82f6,color:#f1f5f9
    classDef gcp fill:#0c0a09,stroke:#06b6d4,color:#f1f5f9
    
    class UI,WA,GM browser
    class NGINX,FAST,GC cloudrun
    class GEMINI,GCS gcp
```

## Data Flow Details

| Path | Data | Format | Direction |
|------|------|--------|-----------|
| Browser → Backend | Mic audio | PCM 16-bit 16kHz, base64 JSON | Client → Server |
| Browser → Backend | Camera frames | JPEG base64 JSON (1 fps) | Client → Server |
| Backend → Gemini | Audio stream | PCM bytes via `send_realtime_input()` | Server → API |
| Backend → Gemini | Video frames | JPEG bytes via `send_realtime_input()` | Server → API |
| Gemini → Backend | Audio response | PCM 16-bit 24kHz via `receive()` | API → Server |
| Gemini → Backend | Transcriptions | Text (input + output) | API → Server |
| Backend → Browser | Audio response | PCM 24kHz base64 JSON | Server → Client |
| Backend → Browser | Transcriptions | JSON text messages | Server → Client |
| Backend → GCS | Session logs | JSON files | Server → Storage |

## GCP Services Used

1. **Google Cloud Run** — Hosts both frontend (nginx) and backend (FastAPI) as serverless containers
2. **Google Cloud Build** — Builds container images during deployment
3. **Google Artifact Registry** — Stores container images
4. **Google Cloud Storage** — Persists session logs for analytics
5. **Gemini Live API** — Powers the AI tutor (bidirectional audio + vision) via Google GenAI SDK
