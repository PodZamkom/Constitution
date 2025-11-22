#!/usr/bin/env python3
import os
import sys
import logging
import tempfile
import asyncio
import json
from typing import List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import openai
from openai import OpenAI
import httpx
import uvicorn
from dotenv import load_dotenv
import websockets

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
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
PORT = int(os.getenv("PORT", 8000))

# Check if integrations are available
INTEGRATION_AVAILABLE = bool(OPENAI_API_KEY)
VOICE_MODE_AVAILABLE = bool(GOOGLE_API_KEY)

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

# Health check
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "openai_available": INTEGRATION_AVAILABLE, "google_voice_available": VOICE_MODE_AVAILABLE}

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

# Google Gemini Live WebSocket Proxy
@app.websocket("/ws/google-live")
async def google_live_proxy(websocket: WebSocket):
    await websocket.accept()
    
    if not GOOGLE_API_KEY:
        logger.error("❌ GOOGLE_API_KEY not found")
        await websocket.close(code=1008, reason="API Key missing")
        return

    logger.info("🎤 [GOOGLE LIVE] Client connected")
    
    # Construct Google Gemini Live WebSocket URL
    # Using Gemini 2.0 Flash Experimental
    google_url = f"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key={GOOGLE_API_KEY}"
    
    try:
        async with websockets.connect(google_url) as google_ws:
            logger.info("🎤 [GOOGLE LIVE] Connected to Google API")
            
            async def forward_to_google():
                try:
                    while True:
                        data = await websocket.receive_text()
                        # logger.info(f"🎤 [CLIENT -> GOOGLE] Sending data")
                        await google_ws.send(data)
                except WebSocketDisconnect:
                    logger.info("🎤 [GOOGLE LIVE] Client disconnected")
                except Exception as e:
                    logger.error(f"🎤 [GOOGLE LIVE] Error forwarding to Google: {e}")

            async def forward_to_client():
                try:
                    async for message in google_ws:
                        # logger.info(f"🎤 [GOOGLE -> CLIENT] Receiving data")
                        await websocket.send_text(message)
                except Exception as e:
                    logger.error(f"🎤 [GOOGLE LIVE] Error forwarding to client: {e}")

            # Run both tasks concurrently
            await asyncio.gather(forward_to_google(), forward_to_client())
            
    except Exception as e:
        logger.error(f"🎤 [GOOGLE LIVE] Connection error: {e}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except:
            pass

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