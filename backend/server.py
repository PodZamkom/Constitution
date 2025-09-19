import json
import os
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Dict, List

import httpx
from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
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
DOCS_STATIC_DIR = BASE_DIR / "docs" / "static"

OPENAI_API_BASE = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")


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


class VoiceSessionRequest(BaseModel):
    voice: str | None = None
    model: str | None = None
    instructions: str | None = None


app = FastAPI()

SYSTEM_PROMPT = (
    "Ты — Алеся, виртуальный консультант по Конституции Республики Беларусь.\n\n"
    "ВАЖНО: Ты специалист по Конституции Республики Беларусь редакции 2022 года. "
    "Ты знаешь ВСЮ Конституцию наизусть.\n\n"
    "Язык ответов: ТОЛЬКО русский.\n\n"
    "Твоя ЕДИНСТВЕННАЯ задача: консультирование по Конституции Республики Беларусь.\n\n"
    "Твой источник знаний: ТОЛЬКО Конституция Республики Беларусь, редакция 2022 года.\n\n"
    "Отвечай СТРОГО по фактам из Конституции, цитируя или кратко пересказывая нормы.\n\n"
    "ВСЕГДА указывай номер статьи Конституции, если он известен.\n\n"
    "ФОРМАТ твоего ответа: краткий основной ответ + \"Справка: это регулируется статьей "
    "[номер] Конституции Республики Беларусь.\"\n\n"
    "Если вопрос НЕ относится к Конституции Республики Беларусь, отвечай ТОЛЬКО:\n"
    "\"Меня зовут Алеся, и я могу отвечать только по вопросам Конституции Республики "
    "Беларусь. Пожалуйста, задайте вопрос о Конституции.\"\n\n"
    "НЕ придумывай информацию. НЕ отвечай на вопросы о погоде, новостях, других "
    "странах, других законах — ТОЛЬКО о Конституции Беларуси.\n\n"
    "Ты ЗНАЕШЬ наизусть все статьи Конституции Республики Беларусь и можешь точно "
    "цитировать их содержание."
)

if FRONTEND_STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_STATIC_DIR), name="frontend-static")
elif DOCS_STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=DOCS_STATIC_DIR), name="docs-static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_chat_history: Dict[str, List[ChatMessage]] = {}


def _default_chat_model() -> str:
    return os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")


def _default_voice_model() -> str:
    return os.getenv("OPENAI_VOICE_MODEL", "gpt-4o-realtime-preview-latest")


def _default_voice_name() -> str:
    return os.getenv("OPENAI_VOICE", "alloy")


def _exception_detail(exc: Exception) -> str:
    text = str(exc)
    if text:
        return text
    if hasattr(exc, "args") and exc.args:
        return ", ".join(str(arg) for arg in exc.args if arg)
    return exc.__class__.__name__


def _http_error_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except json.JSONDecodeError:
        payload = None

    if isinstance(payload, dict):
        error_obj = payload.get("error")
        if isinstance(error_obj, dict):
            message = error_obj.get("message") or error_obj.get("code")
            if message:
                return message
        if payload.get("message"):
            return str(payload["message"])
        return json.dumps(payload, ensure_ascii=False)

    text = response.text.strip()
    if text:
        return text
    return f"OpenAI request failed with status {response.status_code}"


def _get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key is missing")
    return OpenAI(api_key=api_key)


def _get_api_key() -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key is missing")
    return api_key


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


@app.get("/favicon.ico")
async def favicon() -> FileResponse:
    candidates = [
        FRONTEND_BUILD_DIR / "favicon.ico",
        BASE_DIR / "docs" / "favicon.ico",
        BASE_DIR / "frontend" / "public" / "favicon.ico",
    ]
    for candidate in candidates:
        if candidate.exists():
            return FileResponse(candidate)
    raise HTTPException(status_code=404, detail="Favicon not found")


@app.get("/api/health")
async def api_health() -> dict:
    return {"status": "ok"}


@app.get("/api/capabilities")
async def api_capabilities() -> dict:
    api_key_present = bool(os.getenv("OPENAI_API_KEY"))
    chat_model = _default_chat_model()
    voice_model = _default_voice_model()
    voice_enabled = api_key_present
    return {
        "chat": api_key_present,
        "chat_available": api_key_present,
        "voice_mode": voice_enabled,
        "voice_mode_available": voice_enabled,
        "mongodb": False,
        "mongodb_available": False,
        "chat_model": chat_model,
        "voice_model": voice_model,
        "voice_name": _default_voice_name(),
        "voice_instructions": os.getenv("OPENAI_VOICE_INSTRUCTIONS"),
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
    model = _default_chat_model()

    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": request.message},
            ],
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=_exception_detail(exc)) from exc

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
        raise HTTPException(status_code=502, detail=_exception_detail(exc)) from exc

    text = getattr(transcription, "text", None) or getattr(transcription, "transcript", "")
    if not text:
        raise HTTPException(status_code=502, detail="Empty transcription from OpenAI")

    return TranscriptionResponse(transcription=text)


@app.post("/api/voice/realtime/session")
async def voice_session(payload: VoiceSessionRequest) -> dict:
    client = _get_openai_client()

    model = payload.model or _default_voice_model()
    voice = payload.voice or _default_voice_name()
    instructions = (
        payload.instructions
        or os.getenv("OPENAI_VOICE_INSTRUCTIONS")
        or SYSTEM_PROMPT
    )

    try:
        session = client.api_keys.create_ephemeral(model=model)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=_exception_detail(exc)) from exc

    if hasattr(session, "model_dump"):
        session_payload = session.model_dump()
    elif isinstance(session, dict):
        session_payload = session
    else:
        session_payload = json.loads(
            json.dumps(session, default=lambda o: getattr(o, "__dict__", str(o)))
        )

    session_payload.setdefault("model", model)
    session_payload.setdefault("voice", voice)
    if instructions:
        session_payload.setdefault("instructions", instructions)

    return session_payload


@app.post("/api/voice/realtime/negotiate")
async def voice_negotiate(
    request: Request,
    authorization: str | None = Header(default=None),
    x_openai_model: str | None = Header(default=None),
) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=400, detail="Missing Authorization bearer token")

    offer_sdp = await request.body()
    if not offer_sdp:
        raise HTTPException(status_code=400, detail="SDP offer is required")

    model = x_openai_model or _default_voice_model()

    headers = {
        "Authorization": authorization,
        "Content-Type": "application/sdp",
        "OpenAI-Beta": "realtime=v1",
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{OPENAI_API_BASE.rstrip('/')}/realtime?model={model}",
                content=offer_sdp,
                headers=headers,
            )
    except httpx.HTTPError as exc:  # noqa: PERF203
        raise HTTPException(status_code=502, detail=_exception_detail(exc)) from exc

    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=_http_error_detail(response))

    return {"sdp": response.text}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.server:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
