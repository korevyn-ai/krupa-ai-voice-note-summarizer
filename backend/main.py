
from __future__ import annotations

import os
import shutil
import mimetypes

from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    HTTPException,
    UploadFile,
    File,
    Form,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
from google import genai
from google.genai import types
import bcrypt

from database import engine
from api_calling import generate_ai_summary


# =========================================================
# ENVIRONMENT AND GEMINI
# =========================================================

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is missing")

gemini_client = genai.Client(api_key=GEMINI_API_KEY)

# Check that this model is available to your API key
# and supports audio input for your project.
TRANSCRIPTION_MODEL = "gemini-3.1-flash-lite"


# =========================================================
# REQUEST MODELS
# =========================================================

class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str


class TranscriptionRequest(BaseModel):
    note_id: int
    language: str = "English"


class SummarizationRequest(BaseModel):
    note_id: int
    transcript_text: str
    language: str = "English"
    detail_level: str = "medium"


# =========================================================
# LANGUAGE MAP
# =========================================================

LANGUAGE_MAP = {
    "English": "English",
    "Hindi": "Hindi",
    "Marathi": "Marathi",
    "Spanish": "Spanish",
    "French": "French",
    "German": "German",
    "Japanese": "Japanese",
    "Chinese": "Chinese",
    "Arabic": "Arabic",
    "Portuguese": "Portuguese",
    "Russian": "Russian",
    "Italian": "Italian",
}


# =========================================================
# FASTAPI APP
# =========================================================

app = FastAPI(
    title="AI Voice Note Summarizer",
    description="Backend API for AI Voice Note Summarizer",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# UPLOAD FOLDER
# =========================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

print("Python upload folder:", UPLOAD_FOLDER)


# =========================================================
# ROOT / HEALTH CHECK
# =========================================================

@app.get("/")
def root():
    return {
        "message": "AI Voice Note Summarizer API is running",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "database": "connected",
        }

    except Exception as e:
        print("Health/database check failed:", repr(e))
        raise HTTPException(
            status_code=503,
            detail="API is running, but database connection failed.",
        )


# =========================================================
# SIGNUP
# =========================================================

@app.post("/signup")
def signup(request: SignupRequest):
    name = request.name.strip()
    email = request.email.strip().lower()
    password = request.password

    if not name or not email or not password:
        raise HTTPException(
            status_code=400,
            detail="Name, email and password are required.",
        )

    if len(password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=400,
            detail="Password must not exceed 72 bytes.",
        )

    try:
        with engine.connect() as conn:
            existing_user = conn.execute(
                text("""
                    SELECT id
                    FROM users
                    WHERE email = :email
                """),
                {"email": email},
            ).fetchone()

        if existing_user:
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists.",
            )

        password_hash = bcrypt.hashpw(
            password.encode("utf-8"),
            bcrypt.gensalt(),
        ).decode("utf-8")

        with engine.begin() as conn:
            result = conn.execute(
                text("""
                    INSERT INTO users (name, email, password)
                    VALUES (:name, :email, :password)
                """),
                {
                    "name": name,
                    "email": email,
                    "password": password_hash,
                },
            )
            user_id = result.lastrowid

        return {
            "message": "Signup successful",
            "user_id": user_id,
            "name": name,
            "email": email,
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Signup error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Signup failed because of a server/database error.",
        )


# =========================================================
# LOGIN
# =========================================================

@app.post("/login")
def login(request: LoginRequest):
    try:
        email = request.email.strip().lower()

        with engine.connect() as conn:
            user = conn.execute(
                text("""
                    SELECT id, name, email, password
                    FROM users
                    WHERE email = :email
                """),
                {"email": email},
            ).fetchone()

        if not user:
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password",
            )

        stored_password = str(user.password or "")
        supplied_password = request.password

        if stored_password.startswith(("$2a$", "$2b$", "$2y$")):
            try:
                password_valid = bcrypt.checkpw(
                    supplied_password.encode("utf-8"),
                    stored_password.encode("utf-8"),
                )
            except (ValueError, TypeError):
                password_valid = False
        else:
            # Compatibility with older plain-text records.
            password_valid = supplied_password == stored_password

        if not password_valid:
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password",
            )

        return {
            "message": "Login successful",
            "user_id": user.id,
            "name": user.name,
            "email": user.email,
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
            },
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Login error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Login failed because of a server/database error.",
        )


# =========================================================
# SAVE AUDIO HELPER
# =========================================================

def save_audio_file(file: UploadFile, prefix: str, user_id: int):
    original_name = os.path.basename(file.filename or "audio.webm")

    safe_name = "".join(
        ch for ch in original_name
        if ch.isalnum() or ch in "._-"
    )

    if not safe_name:
        safe_name = "audio.webm"

    filename = f"{prefix}_{user_id}_{safe_name}"
    file_path = os.path.join(UPLOAD_FOLDER, filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return file_path


# =========================================================
# RECORD VOICE NOTE
# =========================================================

@app.post("/voice-notes/record")
async def record_voice_note(
    user_id: int = Form(...),
    file: UploadFile = File(...),
):
    file_path = None

    try:
        with engine.connect() as conn:
            user = conn.execute(
                text("""
                    SELECT id, email
                    FROM users
                    WHERE id = :user_id
                """),
                {"user_id": user_id},
            ).fetchone()

        if not user:
            raise HTTPException(
                status_code=404,
                detail="User not found",
            )

        file_path = save_audio_file(file, "recorded", user_id)

        with engine.begin() as conn:
            result = conn.execute(
                text("""
                    INSERT INTO voice_notes
                        (email, upload_voice, recorded_voice)
                    VALUES
                        (:email, NULL, :recorded_voice)
                """),
                {
                    "email": user.email,
                    "recorded_voice": file_path,
                },
            )
            note_id = result.lastrowid

        return {
            "message": "Voice recording saved successfully",
            "note_id": note_id,
            "upload_voice": None,
            "recorded_voice": file_path,
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Recording error:", repr(e))

        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass

        raise HTTPException(
            status_code=500,
            detail="Could not save recording. Check the database and server logs.",
        )

    finally:
        await file.close()


# =========================================================
# UPLOAD VOICE NOTE
# =========================================================

@app.post("/voice-notes/upload")
async def upload_voice_note(
    user_id: int = Form(...),
    file: UploadFile = File(...),
):
    file_path = None

    try:
        with engine.connect() as conn:
            user = conn.execute(
                text("""
                    SELECT id, email
                    FROM users
                    WHERE id = :user_id
                """),
                {"user_id": user_id},
            ).fetchone()

        if not user:
            raise HTTPException(
                status_code=404,
                detail="User not found",
            )

        file_path = save_audio_file(file, "upload", user_id)

        with engine.begin() as conn:
            result = conn.execute(
                text("""
                    INSERT INTO voice_notes
                        (email, upload_voice, recorded_voice)
                    VALUES
                        (:email, :upload_voice, NULL)
                """),
                {
                    "email": user.email,
                    "upload_voice": file_path,
                },
            )
            note_id = result.lastrowid

        return {
            "message": "Voice note uploaded successfully",
            "note_id": note_id,
            "upload_voice": file_path,
            "recorded_voice": None,
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Upload error:", repr(e))

        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass

        raise HTTPException(
            status_code=500,
            detail="Could not upload audio. Check the database and server logs.",
        )

    finally:
        await file.close()


# =========================================================
# TRANSCRIPTION - GEMINI (NO LOCAL WHISPER MODEL)
# =========================================================

@app.post("/transcription")
def transcription(request: TranscriptionRequest):
    try:
        print(
            "Transcription request:",
            request.note_id,
            request.language,
        )

        with engine.connect() as conn:
            note = conn.execute(
                text("""
                    SELECT id, upload_voice, recorded_voice
                    FROM voice_notes
                    WHERE id = :note_id
                """),
                {"note_id": request.note_id},
            ).fetchone()

        if not note:
            raise HTTPException(
                status_code=404,
                detail="Voice note not found",
            )

        stored_path = note.upload_voice or note.recorded_voice

        if not stored_path:
            raise HTTPException(
                status_code=404,
                detail="Audio file path is missing",
            )

        filename = os.path.basename(str(stored_path))
        file_path = os.path.join(UPLOAD_FOLDER, filename)

        if not os.path.isfile(file_path):
            raise HTTPException(
                status_code=404,
                detail=(
                    "Audio file not found on this server. "
                    "Please upload or record it again."
                ),
            )

        file_size = os.path.getsize(file_path)

        if file_size == 0:
            raise HTTPException(
                status_code=400,
                detail="Audio file is empty",
            )

        # Inline audio requests must stay within the API's
        # request-size limits. Use a conservative 18 MB limit.
        if file_size > 18 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Audio is too large. Please use a file under 18 MB.",
            )

        extension = os.path.splitext(file_path)[1].lower()

        supported_mime_types = {
            ".webm": "audio/webm",
            ".wav": "audio/wav",
            ".mp3": "audio/mpeg",
            ".m4a": "audio/mp4",
            ".mp4": "audio/mp4",
            ".ogg": "audio/ogg",
            ".oga": "audio/ogg",
            ".flac": "audio/flac",
            ".aac": "audio/aac",
        }

        mime_type = supported_mime_types.get(extension)

        if not mime_type:
            mime_type, _ = mimetypes.guess_type(file_path)

        if not mime_type or not mime_type.startswith("audio/"):
            raise HTTPException(
                status_code=415,
                detail=(
                    "Unsupported audio format. "
                    "Please use WebM, WAV, MP3, M4A or OGG."
                ),
            )

        with open(file_path, "rb") as audio_file:
            audio_bytes = audio_file.read()

        language = LANGUAGE_MAP.get(request.language)

        if not language:
            raise HTTPException(
                status_code=400,
                detail="Unsupported language selection.",
            )

        prompt = (
            f"Transcribe this audio in {language}. "
            "Return only the spoken words in the original language. "
            "Do not summarize, translate, or add explanations. "
            "If the audio is unclear, transcribe only what can be heard."
        )

        print("Sending audio to Gemini for transcription...")

        response = gemini_client.models.generate_content(
            model=TRANSCRIPTION_MODEL,
            contents=[
                prompt,
                types.Part.from_bytes(
                    data=audio_bytes,
                    mime_type=mime_type,
                ),
            ],
        )

        transcript = (response.text or "").strip()

        if not transcript:
            raise HTTPException(
                status_code=422,
                detail="Gemini returned an empty transcript.",
            )

        with engine.begin() as conn:
            conn.execute(
                text("""
                    UPDATE voice_notes
                    SET transcript = :transcript,
                        language = :language
                    WHERE id = :note_id
                """),
                {
                    "transcript": transcript,
                    "language": request.language,
                    "note_id": request.note_id,
                },
            )

        print("Gemini transcription completed successfully.")

        return {
            "message": "Transcription successful",
            "note_id": request.note_id,
            "transcript": transcript,
            "language": request.language,
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Gemini transcription error:", repr(e))

        raise HTTPException(
            status_code=502,
            detail=(
                "Transcription failed. Check the Gemini API key, "
                "model audio support, API quota and server logs."
            ),
        )


# =========================================================
# AI SUMMARIZATION - GEMINI
# =========================================================

@app.post("/summarization")
def summarization(request: SummarizationRequest):
    try:
        transcript = request.transcript_text.strip()

        if not transcript:
            raise HTTPException(
                status_code=400,
                detail="Transcript is empty",
            )

        with engine.connect() as conn:
            note = conn.execute(
                text("""
                    SELECT id
                    FROM voice_notes
                    WHERE id = :note_id
                """),
                {"note_id": request.note_id},
            ).fetchone()

        if not note:
            raise HTTPException(
                status_code=404,
                detail="Voice note not found",
            )

        result = generate_ai_summary(
            transcript=transcript,
            language=request.language,
            detail_level=request.detail_level,
        )

        if not isinstance(result, dict):
            raise HTTPException(
                status_code=500,
                detail="AI summarizer returned an invalid response",
            )

        if not result.get("success", False):
            print(
                "AI summary error:",
                result.get("error", "Unknown error"),
            )
            raise HTTPException(
                status_code=502,
                detail=(
                    "AI summary generation failed. "
                    "Check the API key and service logs."
                ),
            )

        summary = result.get("summary", "")

        if not isinstance(summary, str) or not summary.strip():
            raise HTTPException(
                status_code=502,
                detail="AI returned an empty summary",
            )

        key_points = result.get("keyPoints", [])
        action_items = result.get("actionItems", [])
        topics = result.get("topics", [])
        ai_model = result.get("model", "Gemini")

        with engine.begin() as conn:
            conn.execute(
                text("""
                    UPDATE voice_notes
                    SET transcript = :transcript,
                        summary = :summary,
                        language = :language
                    WHERE id = :note_id
                """),
                {
                    "transcript": transcript,
                    "summary": summary,
                    "language": request.language,
                    "note_id": request.note_id,
                },
            )

        return {
            "message": "AI summary generated successfully",
            "note_id": request.note_id,
            "summary": summary,
            "keyPoints": key_points,
            "actionItems": action_items,
            "topics": topics,
            "language": request.language,
            "ai_model": ai_model,
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Summarization error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="AI summarization failed. Check the server logs.",
        )


# =========================================================
# GET USER VOICE NOTES / HISTORY
# =========================================================

@app.get("/voice-notes/user/{user_id}")
def get_user_voice_notes(user_id: int):
    try:
        with engine.connect() as conn:
            user = conn.execute(
                text("""
                    SELECT id, email
                    FROM users
                    WHERE id = :user_id
                """),
                {"user_id": user_id},
            ).fetchone()

            if not user:
                raise HTTPException(
                    status_code=404,
                    detail="User not found",
                )

            notes = conn.execute(
                text("""
                    SELECT
                        id,
                        email,
                        upload_voice,
                        recorded_voice,
                        transcript,
                        summary,
                        language,
                        created_at
                    FROM voice_notes
                    WHERE email = :email
                    ORDER BY created_at DESC
                """),
                {"email": user.email},
            ).fetchall()

        history = []

        for note in notes:
            history.append({
                "id": note.id,
                "email": note.email,
                "upload_voice": note.upload_voice,
                "recorded_voice": note.recorded_voice,
                "transcript": note.transcript,
                "summary": note.summary,
                "language": note.language,
                "created_at": note.created_at,
            })

        return {
            "user_id": user_id,
            "notes": history,
        }

    except HTTPException:
        raise

    except Exception as e:
        print("History error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Could not load voice note history.",
        )


# =========================================================
# DELETE VOICE NOTE
# =========================================================

@app.delete("/voice-notes/{note_id}")
def delete_voice_note(note_id: int):
    try:
        with engine.connect() as conn:
            note = conn.execute(
                text("""
                    SELECT id, upload_voice, recorded_voice
                    FROM voice_notes
                    WHERE id = :note_id
                """),
                {"note_id": note_id},
            ).fetchone()

        if not note:
            raise HTTPException(
                status_code=404,
                detail="Voice note not found",
            )

        file_paths = [note.upload_voice, note.recorded_voice]

        with engine.begin() as conn:
            conn.execute(
                text("""
                    DELETE FROM voice_notes
                    WHERE id = :note_id
                """),
                {"note_id": note_id},
            )

        for stored_path in file_paths:
            if not stored_path:
                continue

            filename = os.path.basename(str(stored_path))
            local_path = os.path.abspath(
                os.path.join(UPLOAD_FOLDER, filename)
            )

            if (
                os.path.dirname(local_path)
                == os.path.abspath(UPLOAD_FOLDER)
                and os.path.isfile(local_path)
            ):
                try:
                    os.remove(local_path)
                except OSError as e:
                    print("Could not delete audio file:", repr(e))

        return {
            "message": "Voice note deleted successfully",
            "note_id": note_id,
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Delete error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Could not delete voice note.",
        )
