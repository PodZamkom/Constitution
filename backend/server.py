from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, APIRouter, Request
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
    INTEGRATION_AVAILABLE = True
    VOICE_MODE_AVAILABLE = True
    logger.info("OpenAI integration available")
except ImportError as e:
    INTEGRATION_AVAILABLE = False
    VOICE_MODE_AVAILABLE = False
    logger.warning(f"OpenAI not available: {e}")

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
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OpenAI API key not configured")
        
        if not INTEGRATION_AVAILABLE:
            raise HTTPException(status_code=500, detail="OpenAI integration not available")
        
        client = OpenAI(api_key=api_key)
        
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": request.message}
            ],
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
if VOICE_MODE_AVAILABLE:
    # Initialize OpenAI Voice Mode
    VOICE_CHAT = None
    
    @app.on_event("startup")
    async def load_voice_mode():
        global VOICE_CHAT, VOICE_MODE_AVAILABLE
        try:
            api_key = os.environ.get("OPENAI_API_KEY")
            if api_key:
                logger.info("Initializing OpenAI Voice Mode for Алеся...")
                
                # Create custom router to handle Алеся system prompt
                voice_router = APIRouter()
                
                @voice_router.post("/realtime/session")
                async def create_aleya_session(request: Request):
                    """Create session with Алеся system prompt"""
                    try:
                        # Get request body if any
                        body = {}
                        try:
                            body = await request.json()
                        except:
                            pass
                        
                        # Create OpenAI client
                        client = OpenAI(api_key=api_key)
                        
                        # Create session with custom instructions
                        session = client.beta.realtime.sessions.create(
                            model="gpt-4o-realtime-preview-2024-12-17",
                            voice="shimmer",
                            instructions="Ты консультант по Конституции Республики Беларусь. Отвечай только по Конституции 2022 года, всегда указывай номер статьи. Если вопрос не относится к Конституции — вежливо отказывай."
                        )
                        
                        return {"session_id": session.id}
                    except Exception as e:
                        logger.error(f"Error creating voice session: {e}")
                        raise HTTPException(status_code=500, detail=str(e))
                
                # Include voice router
                app.include_router(voice_router, prefix="/api/voice")
                
                logger.info("OpenAI Voice Mode for Алеся initialized successfully")
            else:
                logger.warning("OpenAI API key not found, Voice Mode disabled")
                VOICE_MODE_AVAILABLE = False
        except Exception as e:
            logger.error(f"Failed to initialize Voice Mode: {e}")
            VOICE_MODE_AVAILABLE = False

# Streaming chat endpoint
@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """Streaming chat endpoint for real-time responses"""
    
    def generate_stream():
        try:
            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                yield f"data: {json.dumps({'error': 'OpenAI API key not configured'})}\n\n"
                return
            
            if not INTEGRATION_AVAILABLE:
                yield f"data: {json.dumps({'error': 'OpenAI integration not available'})}\n\n"
                return
            
            client = OpenAI(api_key=api_key)
            response = client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": request.message}
                ],
                max_tokens=1000,
                temperature=0.7
            )
            response_text = response.choices[0].message.content
            
            # Simulate streaming by sending words one by one
            words = response_text.split()
            current_response = ""
            for word in words:
                current_response += word + " "
                yield f"data: {json.dumps({'content': current_response, 'done': False})}\n\n"
                
            yield f"data: {json.dumps({'content': current_response.strip(), 'done': True})}\n\n"
        
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
