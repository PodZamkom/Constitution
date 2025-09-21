from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, APIRouter, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import List, Optional
# MongoDB imports - only ObjectId needed for PyObjectId
from bson import ObjectId
import os
from dotenv import load_dotenv
import uuid
from datetime import datetime, timezone
import json
import tempfile
import logging
import asyncio
import base64
import httpx

load_dotenv()

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="docs/static"), name="static")

# MongoDB setup - disabled for Railway deployment
# MONGO_URL = os.environ.get("MONGO_URL")
# if MONGO_URL:
#     client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
#     db = client[os.environ.get("DB_NAME", "belarus_constitution")]
# else:
client = None
db = None

# CORS - разрешаем все origins для Railway
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Разрешаем все origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom PyObjectId for MongoDB ObjectId handling
class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid objectid")
        return ObjectId(v)

    @classmethod
    def __modify_schema__(cls, field_schema):
        field_schema.update(type="string")

# Pydantic models
class ChatMessage(BaseModel):
    id: str
    session_id: str
    content: str
    role: str
    timestamp: datetime

class ChatRequest(BaseModel):
    message: str
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))

class ChatResponse(BaseModel):
    response: str
    session_id: str
    message_id: str

class VoiceSessionRequest(BaseModel):
    voice: str = "shimmer"
    model: str = "gpt-4o-realtime-preview-2024-12-17"

class VoiceSessionResponse(BaseModel):
    session_id: str
    client_secret: str
    model: str

# System prompt for Belarus Constitution AI
SYSTEM_PROMPT = """Ты - Алеся, эксперт по Конституции Республики Беларусь редакции 2022 года. 

Твоя задача:
1. Отвечать только на вопросы, связанные с Конституцией Республики Беларусь
2. Всегда указывать номер статьи и пункт при цитировании
3. Объяснять сложные правовые понятия простым языком
4. Если вопрос не относится к Конституции - вежливо отказываться и предлагать задать вопрос по Конституции

Отвечай на русском языке, будь дружелюбной и профессиональной."""

# OpenAI integration
try:
    from openai import OpenAI
    logger.info("OpenAI integration available")
    _openai_imported = True
except ImportError as e:
    logger.warning(f"OpenAI not available: {e}")
    OpenAI = None  # type: ignore
    _openai_imported = False

api_key_configured = bool(os.environ.get("OPENAI_API_KEY"))

INTEGRATION_AVAILABLE = _openai_imported and api_key_configured
VOICE_MODE_AVAILABLE = INTEGRATION_AVAILABLE

if not api_key_configured:
    logger.warning("OPENAI_API_KEY is not configured; OpenAI features are disabled")

def get_openai_client():
    """Get OpenAI client with API key validation"""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")
    if not _openai_imported or OpenAI is None:
        raise HTTPException(status_code=500, detail="OpenAI SDK not available")
    return OpenAI(api_key=api_key)

@app.get("/")
async def root():
    return FileResponse("docs/index.html")

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/api/health")
async def api_health():
    return {"status": "ok"}

@app.get("/api/capabilities")
async def get_capabilities():
    """Get available capabilities"""
    return {
        "chat": INTEGRATION_AVAILABLE,
        "voice_mode": VOICE_MODE_AVAILABLE,
        "voice_mode_available": VOICE_MODE_AVAILABLE,
        "mongodb": db is not None
    }

def prepare_for_mongo(data):
    """Prepare data for MongoDB storage"""
    if "_id" in data:
        data["_id"] = ObjectId(data["_id"])
    return data

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        # Save user message (if MongoDB available)
        if db:
            user_message = ChatMessage(
                id=str(uuid.uuid4()),
                session_id=request.session_id,
                content=request.message,
                role="user",
                timestamp=datetime.now(timezone.utc)
            )
            
            user_msg_dict = prepare_for_mongo(user_message.model_dump())
            await db.messages.insert_one(user_msg_dict)

            # Get chat history
            history = await db.messages.find(
                {"session_id": request.session_id}
            ).sort("timestamp", 1).to_list(length=50)
        else:
            # No MongoDB - just log the message
            logger.info(f"User message: {request.message}")

        # Generate response using OpenAI
        if not INTEGRATION_AVAILABLE:
            raise HTTPException(status_code=500, detail="OpenAI integration not available")
        
        client = get_openai_client()
        
        # Prepare messages for OpenAI
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        
        # Add chat history if available
        if db:
            for msg in history[-10:]:  # Last 10 messages
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
        else:
            messages.append({"role": "user", "content": request.message})
        
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=1000,
            temperature=0.7
        )
        ai_response = response.choices[0].message.content

        # Save assistant response (if MongoDB available)
        if db:
            assistant_message = ChatMessage(
                id=str(uuid.uuid4()),
                session_id=request.session_id,
                content=ai_response,
                role="assistant",
                timestamp=datetime.now(timezone.utc)
            )
            
            assistant_msg_dict = prepare_for_mongo(assistant_message.model_dump())
            await db.messages.insert_one(assistant_msg_dict)
        else:
            # No MongoDB - just log the response
            logger.info(f"Assistant response: {ai_response}")

        return ChatResponse(
            response=ai_response,
            session_id=request.session_id,
            message_id=str(uuid.uuid4())
        )

    except Exception as e:
        logger.error(f"Error in chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Voice Mode endpoints
@app.post("/api/voice/realtime/session", response_model=VoiceSessionResponse)
async def create_voice_session(request: VoiceSessionRequest):
    """Create voice session with Алеся system prompt"""
    try:
        if not VOICE_MODE_AVAILABLE:
            raise HTTPException(status_code=503, detail="Voice Mode not available")
        
        client = get_openai_client()
        
        # Create session with custom instructions
        session = client.beta.realtime.sessions.create(
            model=request.model,
            voice=request.voice,
            instructions=(
                "Ты — Алеся, виртуальный консультант по Конституции Республики Беларусь редакции 2022 года. "
                "Отвечай только на вопросы по Конституции, всегда указывай номер статьи и пункта. "
                "Если вопрос не относится к Конституции — вежливо откажись и предложи задать вопрос по Конституции."
            ),
            modalities=["audio", "text"]
        )

        session_model = getattr(session, "model", request.model)

        return VoiceSessionResponse(
            session_id=session.id,
            client_secret=session.client_secret.value,
            model=session_model
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating voice session: {e}")
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
            temp_file_path = temp_file.name
        
        try:
            # Transcribe using OpenAI Whisper
            with open(temp_file_path, "rb") as audio_file:
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language="ru"  # Russian language
                )
            
            return {"transcription": transcript.text}
        
        finally:
            # Clean up temporary file
            os.unlink(temp_file_path)
    
    except Exception as e:
        logger.error(f"Error transcribing audio: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/voice/realtime/negotiate")
async def negotiate_webrtc(request: Request):
    """Handle WebRTC negotiation for voice mode"""
    try:
        if not VOICE_MODE_AVAILABLE:
            raise HTTPException(status_code=503, detail="Voice Mode not available")
        
        # Get authorization header
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization")
        
        client_secret = auth_header[7:]  # Remove "Bearer " prefix
        model = request.headers.get("X-OpenAI-Model", "gpt-4o-realtime-preview-2024-12-17")
        
        # Get SDP offer from request body
        sdp_offer = await request.body()
        if not sdp_offer:
            raise HTTPException(status_code=400, detail="Missing SDP offer")

        # Negotiate with OpenAI Realtime API and return SDP answer
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as http_client:
            negotiate_response = await http_client.post(
                "https://api.openai.com/v1/realtime",
                params={"model": model},
                headers={
                    "Authorization": f"Bearer {client_secret}",
                    "Content-Type": "application/sdp",
                    "Accept": "application/sdp"
                },
                content=sdp_offer
            )

        if negotiate_response.status_code != 200:
            logger.error(
                "WebRTC negotiation failed: %s %s",
                negotiate_response.status_code,
                negotiate_response.text
            )
            raise HTTPException(
                status_code=negotiate_response.status_code,
                detail=negotiate_response.text
            )

        return Response(content=negotiate_response.content, media_type="application/sdp")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in WebRTC negotiation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Streaming chat endpoint
@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """Streaming chat endpoint for real-time responses"""
    
    def generate_stream():
        try:
            if not INTEGRATION_AVAILABLE:
                yield f"data: {json.dumps({'error': 'OpenAI integration not available'})}\n\n"
                return
            
            client = get_openai_client()
            
            # Prepare messages for OpenAI
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            messages.append({"role": "user", "content": request.message})
            
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                max_tokens=1000,
                temperature=0.7,
                stream=True
            )
            
            # Stream the response
            for chunk in response:
                if chunk.choices[0].delta.content is not None:
                    content = chunk.choices[0].delta.content
                    yield f"data: {json.dumps({'content': content, 'done': False})}\n\n"
            
            yield f"data: {json.dumps({'content': '', 'done': True})}\n\n"
        
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate_stream(), media_type="text/plain")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting server on port {port}")
    print(f"Environment: {os.environ.get('RAILWAY_ENVIRONMENT', 'local')}")
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=port,
        log_level="info",
        access_log=True
    )
