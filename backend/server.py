from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional
import motor.motor_asyncio
import os
from dotenv import load_dotenv
import uuid
from datetime import datetime, timezone
import json
from bson import ObjectId
import tempfile
import logging

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# MongoDB setup
MONGO_URL = os.environ.get("MONGO_URL")
if MONGO_URL:
    client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
    db = client[os.environ.get("DB_NAME", "belarus_constitution")]
else:
    client = None
    db = None

# CORS
origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __modify_schema__(cls, field_schema):
        field_schema.update(type="string")

# Pydantic models
class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    session_id: str
    content: str
    role: str  # user or assistant
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class ChatRequest(BaseModel):
    session_id: str
    message: str

class ChatResponse(BaseModel):
    response: str
    session_id: str
    message_id: str

class TranscriptionResponse(BaseModel):
    transcription: str
    language: str
    confidence: Optional[float] = None

# Constitution assistant system prompt
SYSTEM_PROMPT = """Ты — Алеся, виртуальный консультант по Конституции Республики Беларусь.

ВАЖНО: Ты специалист по Конституции Республики Беларусь редакции 2022 года. Ты знаешь ВСЮ Конституцию наизусть.

Язык ответов: ТОЛЬКО русский.

Твоя ЕДИНСТВЕННАЯ задача: консультирование по Конституции Республики Беларусь.

Твой источник знаний: ТОЛЬКО Конституция Республики Беларусь, редакция 2022 года.

Отвечай СТРОГО по фактам из Конституции, цитируя или кратко пересказывая нормы.

ВСЕГДА указывай номер статьи Конституции, если он известен.

ФОРМАТ твоего ответа: краткий основной ответ + "Справка: это регулируется статьей [номер] Конституции Республики Беларусь."

Если вопрос НЕ относится к Конституции Республики Беларусь, отвечай ТОЛЬКО:
"Меня зовут Алеся, и я могу отвечать только по вопросам Конституции Республики Беларусь. Пожалуйста, задайте вопрос о Конституции."

НЕ придумывай информацию. НЕ отвечай на вопросы о погоде, новостях, других странах, других законах - ТОЛЬКО о Конституции Беларуси.

Ты ЗНАЕШЬ наизусть все статьи Конституции Республики Беларусь и можешь точно цитировать их содержание."""

# Helper functions
def generate_local_response(message):
    """Generate local AI response as Алеся"""
    message_lower = message.lower()
    
    # Greeting responses
    if any(word in message_lower for word in ['привет', 'здравствуй', 'добрый день', 'добрый вечер', 'hello', 'hi']):
        return "Привет! Меня зовут Алеся. Я ваш консультант по Конституции Республики Беларусь редакции 2022 года. Я знаю наизусть всю Конституцию и помогу вам с любыми вопросами о ней. Что вас интересует?"
    
    # Constitution articles
    if 'статья' in message_lower:
        if '1' in message_lower or 'первая' in message_lower:
            return "Статья 1 Конституции РБ: Республика Беларусь - унитарное демократическое социальное правовое государство. Республика Беларусь обладает верховенством и полнотой власти на своей территории, самостоятельно осуществляет внутреннюю и внешнюю политику."
        elif '2' in message_lower or 'вторая' in message_lower:
            return "Статья 2 Конституции РБ: Человек, его права, свободы и гарантии их реализации являются высшей ценностью и целью общества и государства."
        elif '3' in message_lower or 'третья' in message_lower:
            return "Статья 3 Конституции РБ: Единственным источником государственной власти и носителем суверенитета в Республике Беларусь является народ."
        else:
            return "Вы спрашиваете о статье Конституции. Укажите номер статьи (например, 'статья 1' или 'статья 15'), и я дам вам точный текст и объяснение."
    
    # Rights and freedoms
    if any(word in message_lower for word in ['права', 'свободы', 'право на']):
        return "Права и свободы граждан закреплены в разделе II Конституции РБ (статьи 21-63). Основные права включают: право на жизнь, свободу, неприкосновенность личности, свободу мнений и убеждений, право на образование, здравоохранение, труд. Какое конкретное право вас интересует?"
    
    # Government structure
    if any(word in message_lower for word in ['президент', 'парламент', 'правительство', 'суд']):
        return "Согласно Конституции РБ, государственная власть в Республике Беларусь осуществляется на основе разделения ее на законодательную, исполнительную и судебную. Президент является Главой государства, Национальное собрание - парламент, Совет Министров - правительство. Что именно вас интересует?"
    
    # Constitution-related responses
    if any(word in message_lower for word in ['конституция', 'обязанности', 'государство', 'закон']):
        return f"Отличный вопрос о Конституции Республики Беларусь! Вы спросили: '{message}'. Согласно Конституции РБ редакции 2022 года, основные принципы нашего государства включают народовластие, верховенство права, разделение властей и социальную справедливость. Если вас интересует конкретная статья, укажите номер, и я дам подробный ответ."
    
    # Help requests
    if any(word in message_lower for word in ['помощь', 'помоги', 'что ты умеешь', 'что можешь']):
        return "Я могу помочь вам с любыми вопросами по Конституции Республики Беларусь: объяснить статьи, рассказать о правах и обязанностях граждан, структуре государственной власти, принципах правового государства. Просто спросите!"
    
    # General responses
    return f"Меня зовут Алеся, и я могу отвечать только по вопросам Конституции Республики Беларусь. Вы спросили: '{message}'. Пожалуйста, задайте вопрос о Конституции, и я с радостью помогу вам разобраться в любых правовых аспектах нашего основного закона."

def prepare_for_mongo(data):
    if isinstance(data.get('timestamp'), datetime):
        data['timestamp'] = data['timestamp'].isoformat()
    return data

def parse_from_mongo(item):
    if isinstance(item.get('timestamp'), str):
        item['timestamp'] = datetime.fromisoformat(item['timestamp'])
    # Handle MongoDB ObjectId
    if '_id' in item:
        item['id'] = str(item['_id'])
        del item['_id']
    return item

# OpenAI integration
try:
    import openai
    INTEGRATION_AVAILABLE = True
except ImportError:
    INTEGRATION_AVAILABLE = False
    print("Warning: openai not installed")

# Whisper integration
WHISPER_AVAILABLE = False
try:
    import whisper
    import torch
    import numpy as np
    
    # Initialize Whisper model
    WHISPER_MODEL = None
    
    @app.on_event("startup")
    async def load_whisper_model():
        global WHISPER_MODEL, WHISPER_AVAILABLE
        try:
            logger.info("Loading Whisper model for Russian STT...")
            # Use 'base' model for good balance of speed and accuracy for Russian
            WHISPER_MODEL = whisper.load_model("base")
            WHISPER_AVAILABLE = True
            logger.info("Whisper model loaded successfully")
            
            # Test model with dummy audio
            dummy_audio = np.zeros(16000, dtype=np.float32)  # 1 second of silence
            result = WHISPER_MODEL.transcribe(dummy_audio, language="ru")
            logger.info("Whisper model warmup completed")
            
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            WHISPER_AVAILABLE = False

except ImportError as e:
    logger.warning(f"Whisper not available: {e}")
    WHISPER_AVAILABLE = False

# OpenAI Voice Mode integration
VOICE_MODE_AVAILABLE = False
try:
    import aiohttp
    from fastapi import Request
    
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
                        
                        # Алеся system prompt for Voice Mode - ЧЕТКИЙ И ЯСНЫЙ
                        aleya_instructions = """Меня зовут Алеся. Я специалист по Конституции Республики Беларусь редакции 2022 года.

Я ЗНАЮ всю Конституцию Беларуси наизусть и отвечаю ТОЛЬКО на вопросы о Конституции.

Говорю ТОЛЬКО по-русски.

Когда меня спрашивают "кто ты", отвечаю: "Меня зовут Алеся. Я ваш консультант по Конституции Республики Беларусь. Я знаю наизусть всю Конституцию и помогу вам с любыми вопросами о ней."

На вопросы о Конституции отвечаю подробно и всегда указываю номера статей.

На вопросы НЕ о Конституции (погода, спорт, еда, другие страны) отвечаю ТОЛЬКО: "Я отвечаю только на вопросы о Конституции Республики Беларусь."

Я эксперт по Конституции Беларуси и это моя единственная специализация."""
                        
                        # Use shimmer voice (female) and add instructions
                        voice = body.get('voice', 'shimmer')
                        model = body.get('model', 'gpt-4o-realtime-preview-2024-12-17')
                        
                        logger.info(f"Creating Алеся session with voice: {voice}")
                        
                        # Debug: показать что отправляем в OpenAI
                        session_payload = {
                            "model": model,
                            "voice": voice,
                            "instructions": aleya_instructions
                        }
                        
                        logger.info(f"Sending to OpenAI API: model={model}, voice={voice}")
                        logger.info(f"Instructions length: {len(aleya_instructions)} characters")
                        logger.info(f"Instructions preview: {aleya_instructions[:100]}...")
                        
                        # Create session with custom instructions
                        async with aiohttp.ClientSession() as session:
                            async with session.post(
                                "https://api.openai.com/v1/realtime/sessions",
                                headers={
                                    "Authorization": f"Bearer {api_key}",
                                    "Content-Type": "application/json",
                                },
                                json=session_payload
                            ) as response:
                                response_text = await response.text()
                                logger.info(f"OpenAI API response status: {response.status}")
                                logger.info(f"OpenAI API response: {response_text[:200]}...")
                                
                                if response.status == 200:
                                    session_data = json.loads(response_text)
                                    logger.info("Алеся Voice Mode session created with Constitution instructions")
                                    return session_data
                                else:
                                    logger.error(f"Session creation failed: {response.status} - {response_text}")
                                    raise HTTPException(status_code=response.status, detail=response_text)
                        
                    except HTTPException:
                        raise
                    except Exception as e:
                        logger.error(f"Error creating Алеся session: {e}")
                        raise HTTPException(status_code=500, detail=str(e))
                
                @voice_router.post("/realtime/negotiate")
                async def negotiate_aleya_connection(request: Request):
                    """Handle WebRTC negotiation for Алеся using client_secret from the created session"""
                    try:
                        # Read SDP offer from request body
                        sdp_offer_bytes = await request.body()
                        sdp_offer = sdp_offer_bytes.decode()

                        # Read client_secret from Authorization header (Bearer <client_secret>)
                        auth_header = request.headers.get("Authorization", "")
                        client_secret = None
                        if auth_header.lower().startswith("bearer "):
                            client_secret = auth_header.split(" ", 1)[1].strip()

                        if not client_secret:
                            raise HTTPException(status_code=400, detail="Missing client_secret in Authorization header")

                        # Optional model header to be explicit; default to same as session creation
                        model = request.headers.get("X-OpenAI-Model", "gpt-4o-realtime-preview-2024-12-17")

                        # Forward SDP offer to OpenAI Realtime using the client_secret so that
                        # the session inherits the Алеся instructions configured at session creation
                        url = f"https://api.openai.com/v1/realtime?model={model}"
                        async with aiohttp.ClientSession() as session:
                            async with session.post(
                                url,
                                data=sdp_offer,
                                headers={
                                    "Authorization": f"Bearer {client_secret}",
                                    "Content-Type": "application/sdp",
                                },
                            ) as resp:
                                answer_sdp = await resp.text()
                                if resp.status != 200:
                                    logger.error(f"OpenAI negotiate failed: {resp.status} - {answer_sdp[:200]}...")
                                    raise HTTPException(status_code=resp.status, detail=answer_sdp)
                                return JSONResponse(content={"sdp": answer_sdp})
                    except HTTPException:
                        raise
                    except Exception as e:
                        logger.error(f"Negotiation error: {e}")
                        raise HTTPException(status_code=500, detail=str(e))
                
                app.include_router(voice_router, prefix="/api/voice")
                
                VOICE_MODE_AVAILABLE = True
                logger.info("OpenAI Voice Mode for Алеся initialized successfully")
            else:
                logger.warning("OpenAI API key not found, Voice Mode unavailable")
        except Exception as e:
            logger.error(f"Failed to initialize Voice Mode: {e}")
            VOICE_MODE_AVAILABLE = False

except ImportError as e:
    logger.warning(f"OpenAI Voice Mode not available: {e}")
    VOICE_MODE_AVAILABLE = False

@app.get("/")
async def root():
    return {"message": "AI-ассистент по Конституции Республики Беларусь"}

@app.get("/health")
async def health():
    return {"status": "ok", "message": "Server is running"}

@app.get("/api/capabilities")
async def get_capabilities():
    """Get available capabilities"""
    return {
        "whisper_available": WHISPER_AVAILABLE,
        "voice_mode_available": VOICE_MODE_AVAILABLE,
        "llm_available": INTEGRATION_AVAILABLE
    }

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

        # Generate response using OpenAI with proxy
        if not INTEGRATION_AVAILABLE:
            # Fallback response if integration not available
            ai_response = f"Привет! Меня зовут Алеся. Я специалист по Конституции Республики Беларусь редакции 2022 года. Вы спросили: '{request.message}'. К сожалению, интеграция с LLM временно недоступна, но я готова помочь вам с вопросами по Конституции Беларуси, как только сервис будет восстановлен."
        else:
            # Initialize OpenAI client with proxy
            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                ai_response = f"Привет! Меня зовут Алеся. Я специалист по Конституции Республики Беларусь редакции 2022 года. Вы спросили: '{request.message}'. К сожалению, API ключ OpenAI не настроен, но я готова помочь вам с вопросами по Конституции Беларуси, как только сервис будет настроен."
            else:
                # ТОЛЬКО ChatGPT API - НАПРЯМУЮ!
                client = openai.OpenAI(api_key=api_key)
                
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
        raise HTTPException(status_code=500, detail=f"Error processing chat: {str(e)}")

@app.post("/api/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe uploaded audio file to Russian text using Whisper"""
    
    if not WHISPER_AVAILABLE or WHISPER_MODEL is None:
        raise HTTPException(
            status_code=503, 
            detail="Whisper STT service unavailable"
        )
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith('audio/'):
        raise HTTPException(
            status_code=400,
            detail="File must be an audio file"
        )
    
    # Check file size (25MB limit)
    MAX_FILE_SIZE = 25 * 1024 * 1024
    
    try:
        # Read file content
        file_content = await file.read()
        
        if len(file_content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="File too large. Maximum size is 25MB"
            )
        
        # Create temporary file for Whisper processing
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
            temp_file.write(file_content)
            temp_file_path = temp_file.name
        
        try:
            # Transcribe using Whisper
            logger.info(f"Transcribing audio file: {file.filename}")
            result = WHISPER_MODEL.transcribe(
                temp_file_path,
                language="ru",  # Russian language
                verbose=False
            )
            
            transcription = result["text"].strip()
            detected_language = result.get("language", "ru")
            
            logger.info(f"Transcription completed: {transcription[:100]}...")
            
            return TranscriptionResponse(
                transcription=transcription,
                language=detected_language
            )
            
        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_file_path)
            except OSError:
                logger.warning(f"Could not delete temporary file: {temp_file_path}")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

@app.get("/api/history/{session_id}")
async def get_chat_history(session_id: str):
    try:
        history = await db.messages.find(
            {"session_id": session_id}
        ).sort("timestamp", 1).to_list(length=100)
        
        # Parse dates and ObjectIds from mongo
        parsed_history = [parse_from_mongo(msg) for msg in history]
        return {"session_id": session_id, "messages": parsed_history}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching history: {str(e)}")

@app.get("/api/stream-chat")
async def stream_chat(session_id: str, message: str):
    """Stream chat responses using Server-Sent Events"""
    
    async def generate_stream():
        try:
            # Save user message
            user_message = ChatMessage(
                id=str(uuid.uuid4()),
                session_id=session_id,
                content=message,
                role="user",
                timestamp=datetime.now(timezone.utc)
            )
            
            user_msg_dict = prepare_for_mongo(user_message.model_dump())
            await db.messages.insert_one(user_msg_dict)

            # Generate response
            if not INTEGRATION_AVAILABLE:
                response = "Интеграция с LLM временно недоступна. Я могу отвечать только по Конституции Республики Беларусь."
                
                # Simulate streaming by sending words
                words = response.split()
                current_response = ""
                for word in words:
                    current_response += word + " "
                    yield f"data: {json.dumps({'content': current_response, 'done': False})}\n\n"
                    
                yield f"data: {json.dumps({'content': current_response.strip(), 'done': True})}\n\n"
            else:
                # For now, send non-streaming response until we implement proper streaming
                api_key = os.environ.get("OPENAI_API_KEY")
                if not api_key:
                    yield f"data: {json.dumps({'error': 'OpenAI API key not configured'})}\n\n"
                    return
                
                chat = LlmChat(
                    api_key=api_key,
                    session_id=session_id,
                    system_message=SYSTEM_PROMPT
                ).with_model("openai", "gpt-4")
                
                user_msg = UserMessage(text=message)
                ai_response = await chat.send_message(user_msg)
                
                # Save assistant response
                assistant_message = ChatMessage(
                    id=str(uuid.uuid4()),
                    session_id=session_id,
                    content=ai_response,
                    role="assistant",
                    timestamp=datetime.now(timezone.utc)
                )
                
                assistant_msg_dict = prepare_for_mongo(assistant_message.model_dump())
                await db.messages.insert_one(assistant_msg_dict)
                
                # Simulate streaming
                words = ai_response.split()
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
    uvicorn.run(app, host="0.0.0.0", port=port)