import os
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Dict, List

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_BUILD_DIR = BASE_DIR / "frontend" / "build"
FRONTEND_STATIC_DIR = FRONTEND_BUILD_DIR / "static"
FRONTEND_INDEX = FRONTEND_BUILD_DIR / "index.html"
DOCS_INDEX = BASE_DIR / "docs" / "index.html"


class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: str
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    message_id: str


class ChatHistoryResponse(BaseModel):
    session_id: str
    messages: List[ChatMessage]


class TranscriptionResponse(BaseModel):
    transcription: str


app = FastAPI()

if FRONTEND_STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_STATIC_DIR), name="frontend-static")
elif (BASE_DIR / "docs").exists():
    app.mount("/static", StaticFiles(directory=BASE_DIR / "docs"), name="docs-static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_chat_history: Dict[str, List[ChatMessage]] = {}


def _get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key is missing")
    return OpenAI(api_key=api_key)


def _append_message(session_id: str, role: str, content: str) -> ChatMessage:
    message = ChatMessage(role=role, content=content)
    history = _chat_history.setdefault(session_id, [])
    history.append(message)
    if len(history) > 100:
        del history[:-100]
    return message


@app.get("/")
async def serve_frontend() -> FileResponse:
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX)
    if DOCS_INDEX.exists():
        return FileResponse(DOCS_INDEX)
    raise HTTPException(status_code=404, detail="Frontend build not found")


@app.get("/api/health")
async def api_health() -> dict:
    return {"status": "ok"}


@app.get("/api/capabilities")
async def api_capabilities() -> dict:
    api_key_present = bool(os.getenv("OPENAI_API_KEY"))
    chat_model = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")
    return {
        "chat": api_key_present,
        "chat_available": api_key_present,
        "voice_mode": False,
        "voice_mode_available": False,
        "mongodb": False,
        "mongodb_available": False,
        "chat_model": chat_model,
    }


@app.get("/api/history/{session_id}", response_model=ChatHistoryResponse)
async def api_history(session_id: str) -> ChatHistoryResponse:
    messages = _chat_history.get(session_id, [])
    return ChatHistoryResponse(session_id=session_id, messages=messages)


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    if not request.message:
        raise HTTPException(status_code=400, detail="message is required")

    session_id = request.session_id or str(uuid.uuid4())
    _append_message(session_id, "user", request.message)

    client = _get_openai_client()
    model = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")

    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": request.message}],
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if not completion.choices:
        raise HTTPException(status_code=502, detail="Empty response from OpenAI")

    content = completion.choices[0].message.content or ""
    if not content.strip():
        raise HTTPException(status_code=502, detail="Empty response from OpenAI")

    assistant_message = _append_message(session_id, "assistant", content)

    return ChatResponse(
        response=content,
        session_id=session_id,
        message_id=assistant_message.id,
    )


@app.post("/api/transcribe", response_model=TranscriptionResponse)
async def transcribe(file: UploadFile = File(...)) -> TranscriptionResponse:
    if file.content_type not in {"audio/webm", "audio/mpeg", "audio/wav", "audio/ogg"}:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio file")

    client = _get_openai_client()
    model = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe")

    try:
        transcription = client.audio.transcriptions.create(
            model=model,
            file=(file.filename or "audio.webm", BytesIO(data)),
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    text = getattr(transcription, "text", None) or getattr(transcription, "transcript", "")
    if not text:
        raise HTTPException(status_code=502, detail="Empty transcription from OpenAI")

    return TranscriptionResponse(transcription=text)


@app.post("/api/voice/realtime/session")
async def voice_session() -> dict:
    raise HTTPException(status_code=503, detail="Voice Mode is not enabled on this deployment")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.server:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
