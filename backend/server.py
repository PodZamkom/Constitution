from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import List, Optional
from bson import ObjectId
import os
from dotenv import load_dotenv
import uuid
from datetime import datetime, timezone
import json
import logging
import asyncio
import websockets
import google.generativeai as genai
import ssl
from python_socks.async_.asyncio import Proxy

load_dotenv()

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Enable debugging for libraries
logging.getLogger("websockets").setLevel(logging.INFO)
logging.getLogger("python_socks").setLevel(logging.DEBUG)
logging.getLogger("uvicorn").setLevel(logging.INFO)

app = FastAPI()

# Mount static files
app.mount("/static", StaticFiles(directory="docs/static"), name="static")

# MongoDB setup - disabled
client = None
db = None

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom PyObjectId
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

# System prompt
SYSTEM_PROMPT = """Ты - Алеся, эксперт по Конституции Республики Беларусь редакции 2022 года. 

Твоя задача:
1. Отвечать только на вопросы, связанные с Конституцией Республики Беларусь
2. Всегда указывать номер статьи и пункт при цитировании
3. Объяснять сложные правовые понятия простым языком
4. Если вопрос не относится к Конституции - вежливо отказываться и предлагать задать вопрос по Конституции

Отвечай на русском языке, будь дружелюбной и профессиональной."""

# Gemini Configuration
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or "AIzaSyCUH47l8W6ndBJKhU_7dEpfYsUexMc2lcM"
if not GEMINI_API_KEY or len(GEMINI_API_KEY) < 10:
    GEMINI_API_KEY = "AIzaSyCUH47l8W6ndBJKhU_7dEpfYsUexMc2lcM"
logger.info(f"Gemini API Key configured: {GEMINI_API_KEY[:10]}...{GEMINI_API_KEY[-10:] if len(GEMINI_API_KEY) > 20 else '***'}")

# Check for Proxy
HTTP_PROXY = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or os.environ.get("HTTP_PROXY") or os.environ.get("http_proxy")

# Configure Gemini API FIRST (before proxy env vars)
genai.configure(api_key=GEMINI_API_KEY)

# Then set proxy environment variables if needed
if HTTP_PROXY:
    logger.info(f"Using Proxy for Gemini: {HTTP_PROXY}")
    # Set proxy environment variables - google-generativeai uses requests/httpx which respect these
    os.environ['HTTP_PROXY'] = HTTP_PROXY
    os.environ['HTTPS_PROXY'] = HTTP_PROXY
    os.environ['http_proxy'] = HTTP_PROXY
    os.environ['https_proxy'] = HTTP_PROXY
    # Reconfigure after setting proxy to ensure it's still set
    genai.configure(api_key=GEMINI_API_KEY)

# Model configuration - Using Gemini 2.0 Flash Experimental (latest, "Gemini 3")
TEXT_MODEL_NAME = "gemini-2.0-flash-exp"
VOICE_MODEL_NAME = "gemini-2.0-flash-exp" 

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
        "chat": True,
        "voice_mode": True,
        "mongodb": False
    }

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    logger.info(f"User message: {request.message}")

    model = genai.GenerativeModel(
        model_name=TEXT_MODEL_NAME,
        system_instruction=SYSTEM_PROMPT
    )

    ai_response = None

    try:
        chat_session = model.start_chat(history=[])
        response = chat_session.send_message(request.message)
        ai_response = response.text
        logger.info(f"Assistant response: {ai_response}")
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Gemini API error: {error_msg}")
        # Фоллбек без ошибки, чтобы фронт не падал при 403/429
        ai_response = (
            "В данный момент основной сервис Google Gemini временно недоступен. "
            "Кратко по Конституции РБ: раздел II (ст. 21–63) — права и свободы, "
            "ст. 6 — разделение властей, ст. 17 — два гос. языка, ст. 79–89 — Президент. "
            "Попробуйте задать вопрос ещё раз немного позже."
        )

    return ChatResponse(
        response=ai_response,
        session_id=request.session_id,
        message_id=str(uuid.uuid4())
    )

# WebSocket for Real-time Voice (Gemini Live)
@app.websocket("/ws/gemini-live")
async def gemini_websocket(websocket: WebSocket):
    await websocket.accept()
    logger.info("Frontend WebSocket connected")
    
    # Gemini Live WebSocket URL
    host = "generativelanguage.googleapis.com"
    port = 443
    uri = f"wss://{host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key={GEMINI_API_KEY}"
    
    ssl_context = ssl.create_default_context()
    sock = None  # Initialize sock variable
    
    try:
        # Note: websockets library doesn't natively support HTTP proxies
        # We need to use python-socks to create a tunnel, then use that socket
        if HTTP_PROXY:
            try:
                logger.info(f"Configuring WebSocket proxy: {HTTP_PROXY}")
                proxy = Proxy.from_url(HTTP_PROXY)
                # Connect through proxy to destination
                sock = await proxy.connect(host, port)
                logger.info("Proxy connection established")
                
                # websockets library can handle SSL if we provide the context
                # and pass the pre-connected socket
                connect_args = {
                    'sock': sock,
                    'ssl': ssl_context,
                    'server_hostname': host
                }
                logger.info("Using raw socket with SSL context for websockets")
                
            except Exception as e:
                logger.error(f"Failed to connect via proxy: {e}")
                import traceback
                logger.error(traceback.format_exc())
                await websocket.close(code=1008, reason=f"Proxy Connection Failed: {str(e)}")
                return
        else:
            connect_args = {}

        # Connect to Gemini Live API
        async with websockets.connect(uri, **connect_args) as gemini_ws:
            logger.info(f"Connected to Gemini Live API: {uri}")
            
            # Initial Setup Message
            setup_msg = {
                "setup": {
                    "model": f"models/{VOICE_MODEL_NAME}",
                    "generation_config": {
                        "response_modalities": ["AUDIO"],
                        "speech_config": {
                            "voice_config": {
                                "prebuilt_voice_config": {
                                    "voice_name": "Kore" 
                                }
                            }
                        }
                    },
                    "system_instruction": {
                        "parts": [{"text": SYSTEM_PROMPT}]
                    }
                }
            }
            await gemini_ws.send(json.dumps(setup_msg))
            
            # Handle initial response (setup complete)
            init_resp = await gemini_ws.recv()
            logger.info(f"Gemini Setup Response: {init_resp}")
            
            # Notify frontend that we are ready
            await websocket.send_text(json.dumps({"status": "connected", "message": "Backend connected to Gemini"}))

            # Task to forward data from Frontend to Gemini
            async def frontend_to_gemini():
                logger.info("Starting frontend_to_gemini loop")
                try:
                    while True:
                        try:
                            # Try to receive as JSON first
                            data = await websocket.receive_json()
                            logger.info(f"Received JSON from frontend: {str(data)[:200]}")
                        except RuntimeError as e:
                            if "disconnect" in str(e).lower():
                                logger.info("Frontend disconnected (RuntimeError)")
                                break
                            raise e
                        except WebSocketDisconnect:
                             logger.info("Frontend disconnected (WebSocketDisconnect)")
                             break
                        except Exception as json_err:
                            # If JSON fails, try text
                            try:
                                text_data = await websocket.receive_text()
                                logger.info(f"Received text from frontend: {text_data[:200]}")
                                data = json.loads(text_data)
                            except RuntimeError as e:
                                if "disconnect" in str(e).lower():
                                    logger.info("Frontend disconnected (RuntimeError during text recv)")
                                    break
                                raise e
                            except WebSocketDisconnect:
                                logger.info("Frontend disconnected (WebSocketDisconnect during text recv)")
                                break
                            except Exception as text_err:
                                logger.error(f"Failed to parse message: JSON error: {json_err}, Text error: {text_err}")
                                continue
                        
                        # Send to Gemini
                        gemini_msg = json.dumps(data)
                        await gemini_ws.send(gemini_msg)
                        logger.info(f"Sent to Gemini: {len(gemini_msg)} bytes, preview: {gemini_msg[:100]}...")
                except Exception as e:
                    logger.error(f"Frontend -> Gemini error: {e}")
                    import traceback
                    logger.error(traceback.format_exc())
                    # Don't re-raise if it's just a disconnect, just exit the loop
                    if "disconnect" not in str(e).lower():
                         raise
                finally:
                    logger.info("Exiting frontend_to_gemini loop")

            # Task to forward data from Gemini to Frontend
            async def gemini_to_frontend():
                try:
                    async for msg in gemini_ws:
                        # Check message type
                        if isinstance(msg, bytes):
                            msg_type = "bytes"
                            msg_size = len(msg)
                            msg_preview = msg[:100] if len(msg) > 100 else msg
                        else:
                            msg_type = "str"
                            msg_size = len(msg)
                            msg_preview = msg[:200] if len(msg) > 200 else msg
                        
                        logger.info(f"Received from Gemini: type={msg_type}, size={msg_size} bytes, preview: {str(msg_preview)[:200]}")
                        
                        # Send to frontend - handle both text and bytes
                        if isinstance(msg, bytes):
                            await websocket.send_bytes(msg)
                        else:
                            await websocket.send_text(msg)
                        logger.info(f"Sent to frontend: {msg_size} bytes")
                except Exception as e:
                    logger.error(f"Gemini -> Frontend error: {e}")
                    import traceback
                    logger.error(traceback.format_exc())
                    raise

            # Run both tasks
            await asyncio.gather(frontend_to_gemini(), gemini_to_frontend())

    except websockets.exceptions.InvalidStatusCode as e:
        logger.error(f"Gemini WebSocket Connection Failed: {e.status_code}")
        await websocket.close(code=1008, reason=f"Gemini Error: {e.status_code}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if "User location is not supported" in str(e):
            logger.error("CRITICAL: Server location blocked by Google.")
            await websocket.close(code=1008, reason="Server Location Blocked")
    finally:
        try:
            # Close proxy socket if it was created
            if sock is not None:
                try:
                    sock.close()
                    logger.info("Proxy socket closed")
                except Exception as e:
                    logger.warning(f"Error closing proxy socket: {e}")
            # Close frontend WebSocket
            try:
                await websocket.close()
                logger.info("Frontend WebSocket closed")
            except Exception as e:
                logger.warning(f"Error closing frontend WebSocket: {e}")
        except Exception as e:
            logger.error(f"Error in finally block: {e}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=port,
        log_level="info",
        access_log=True
    )
