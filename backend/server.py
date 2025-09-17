from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional
import motor.motor_asyncio
import os
from dotenv import load_dotenv
import uuid
from datetime import datetime, timezone
import json
from bson import ObjectId

load_dotenv()

app = FastAPI()

# MongoDB setup
client = motor.motor_asyncio.AsyncIOMotorClient(os.environ.get("MONGO_URL"))
db = client[os.environ.get("DB_NAME", "belarus_constitution")]

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
        allow_population_by_field_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class ChatRequest(BaseModel):
    session_id: str
    message: str

class ChatResponse(BaseModel):
    response: str
    session_id: str
    message_id: str

# Constitution assistant system prompt
SYSTEM_PROMPT = """Ты — виртуальный консультант по Конституции Республики Беларусь.

Язык ответов: русский.

Источник: только Конституция Республики Беларусь, редакция 2022 года.

Отвечай строго по фактам, цитируя или кратко пересказывая нормы.

Всегда указывай номер статьи, если он известен.

Если вопрос выходит за рамки Конституции, отвечай вежливо:
«Я могу отвечать только по Конституции Республики Беларусь».

Не додумывай, не придумывай информацию.

Формат ответа: краткий основной ответ + «Справка: Статья NN …»."""

# Helper functions
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

# Install emergentintegrations first
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    INTEGRATION_AVAILABLE = True
except ImportError:
    INTEGRATION_AVAILABLE = False
    print("Warning: emergentintegrations not installed")

@app.get("/")
async def root():
    return {"message": "AI-ассистент по Конституции Республики Беларусь"}

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        # Save user message
        user_message = ChatMessage(
            id=str(uuid.uuid4()),
            session_id=request.session_id,
            content=request.message,
            role="user",
            timestamp=datetime.now(timezone.utc)
        )
        
        user_msg_dict = prepare_for_mongo(user_message.dict())
        await db.messages.insert_one(user_msg_dict)

        # Get chat history
        history = await db.messages.find(
            {"session_id": request.session_id}
        ).sort("timestamp", 1).to_list(length=50)

        # Generate response using OpenAI
        if not INTEGRATION_AVAILABLE:
            # Fallback response if integration not available
            ai_response = "Интеграция с LLM временно недоступна. Я могу отвечать только по Конституции Республики Беларусь."
        else:
            # Initialize LLM chat
            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                raise HTTPException(status_code=500, detail="OpenAI API key not configured")
            
            chat = LlmChat(
                api_key=api_key,
                session_id=request.session_id,
                system_message=SYSTEM_PROMPT
            ).with_model("openai", "gpt-4")
            
            user_msg = UserMessage(text=request.message)
            ai_response = await chat.send_message(user_msg)

        # Save assistant response
        assistant_message = ChatMessage(
            id=str(uuid.uuid4()),
            session_id=request.session_id,
            content=ai_response,
            role="assistant",
            timestamp=datetime.now(timezone.utc)
        )
        
        assistant_msg_dict = prepare_for_mongo(assistant_message.dict())
        await db.messages.insert_one(assistant_msg_dict)

        return ChatResponse(
            response=ai_response,
            session_id=request.session_id,
            message_id=assistant_message.id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing chat: {str(e)}")

@app.get("/api/history/{session_id}")
async def get_chat_history(session_id: str):
    try:
        history = await db.messages.find(
            {"session_id": session_id}
        ).sort("timestamp", 1).to_list(length=100)
        
        # Parse dates from mongo
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
            
            user_msg_dict = prepare_for_mongo(user_message.dict())
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
                
                assistant_msg_dict = prepare_for_mongo(assistant_message.dict())
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
    uvicorn.run(app, host="0.0.0.0", port=8001)