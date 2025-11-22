#!/usr/bin/env python3
import os
import sys
import logging
import tempfile
from typing import List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import openai
from openai import OpenAI
import httpx
import uvicorn
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="Алеся - AI Assistant for Belarus Constitution")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Environment variables
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
PORT = int(os.getenv("PORT", 8000))

# Check if OpenAI integration is available
INTEGRATION_AVAILABLE = bool(OPENAI_API_KEY)
VOICE_MODE_AVAILABLE = bool(OPENAI_API_KEY)

# OpenAI client
def get_openai_client():
    if not OPENAI_API_KEY:
        return None
    return OpenAI(api_key=OPENAI_API_KEY)

# Pydantic models
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    session_id: str

class ChatResponse(BaseModel):
    response: str
    session_id: str

class VoiceSessionRequest(BaseModel):
    model: str = "gpt-4o-realtime-preview-2024-12-17"
    voice: str = "shimmer"

class VoiceSessionResponse(BaseModel):
    session_id: str
    client_secret: str

# Health check
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "openai_available": INTEGRATION_AVAILABLE}

# Capabilities endpoint
@app.get("/api/capabilities")
async def get_capabilities():
    return {
        "chat_available": INTEGRATION_AVAILABLE,
        "voice_mode_available": VOICE_MODE_AVAILABLE,
        "transcription_available": INTEGRATION_AVAILABLE
    }

# Chat endpoint
@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        if not INTEGRATION_AVAILABLE:
            raise HTTPException(status_code=503, detail="OpenAI integration not available")
        
        client = get_openai_client()
        
        # Create chat completion
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system", 
                    "content": "Ты Алеся - AI-ассистент по Конституции Республики Беларусь. Отвечай на вопросы согласно Конституции РБ редакции 2022 года. Всегда указывай номер статьи. Если вопрос не относится к Конституции — вежливо отказывай."
                },
                {"role": "user", "content": request.message}
            ],
            max_tokens=1000,
            temperature=0.7
        )
        
        return ChatResponse(
            response=response.choices[0].message.content,
            session_id=request.session_id
        )
    except Exception as e:
        logger.error(f"Error in chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Voice Mode endpoints
@app.post("/api/voice/realtime/session", response_model=VoiceSessionResponse)
async def create_voice_session(request: VoiceSessionRequest):
    """Create voice session with Алеся system prompt"""
    try:
        logger.info(f"🎤 [VOICE SESSION] Creating session with model: {request.model}, voice: {request.voice}")
        
        if not VOICE_MODE_AVAILABLE:
            logger.error("🎤 [VOICE SESSION] ❌ Voice Mode not available")
            raise HTTPException(status_code=503, detail="Voice Mode not available")
        
        client = get_openai_client()
        if not client:
            logger.error("🎤 [VOICE SESSION] ❌ OpenAI client not available")
            raise HTTPException(status_code=500, detail="OpenAI client not available")
        
        logger.info("🎤 [VOICE SESSION] Creating OpenAI Realtime session...")
        # Create session with custom instructions (voice is set in client, not session)
        session = client.beta.realtime.sessions.create(
            model=request.model,
            instructions="Ты Алеся - AI-ассистент по Конституции Республики Беларусь. Отвечай на вопросы согласно Конституции РБ редакции 2022 года. Говори дружелюбно и профессионально."
        )
        
        logger.info(f"🎤 [VOICE SESSION] ✅ Session created: {session.id}")
        return VoiceSessionResponse(
            session_id=session.id,
            client_secret=session.client_secret.value
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"🎤 [VOICE SESSION] ❌ Error creating voice session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe audio using OpenAI Whisper"""
    try:
        if not INTEGRATION_AVAILABLE:
            raise HTTPException(status_code=503, detail="OpenAI integration not available")
        
        client = get_openai_client()
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file.flush()
            
            # Transcribe using Whisper
            with open(temp_file.name, "rb") as audio_file:
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    response_format="text"
                )
            
            # Clean up temp file
            os.unlink(temp_file.name)
            
            return {"transcript": transcript}
    except Exception as e:
        logger.error(f"Error in transcription: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Mount static files - serve built frontend
app.mount("/static", StaticFiles(directory="frontend/build/static"), name="static")

# Serve React app
@app.get("/")
async def serve_frontend():
    """Serve the React frontend"""
    return FileResponse("frontend/build/index.html")

@app.get("/{path:path}")
async def serve_frontend_routes(path: str):
    """Serve React app for all routes (SPA routing)"""
    return FileResponse("frontend/build/index.html")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)