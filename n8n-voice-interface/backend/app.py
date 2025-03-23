import logging
import os
import json
from fastapi import FastAPI, UploadFile, Form, HTTPException, BackgroundTasks, Request, Response
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from backend.stt import transcribe_audio
from backend.webhook import send_to_n8n
from backend.tts import text_to_speech

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="N8N Voice Interface",
    description="A voice interface for n8n workflows using OpenAI's GPT-4o Transcribe",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, set specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model for receiving text from n8n
class TextRequest(BaseModel):
    text: str

# API endpoint for transcription
@app.post("/api/transcribe")
async def transcribe_endpoint(
    audio: UploadFile,
    webhook_url: str = Form(...),
    background_tasks: BackgroundTasks = None
):
    """
    Process audio, transcribe it, and send it to the n8n webhook.
    """
    try:
        logger.info(f"Received audio file: {audio.filename}, size: {audio.size} bytes")
        
        # Transcribe the audio
        transcription_result = await transcribe_audio(audio)
        
        if not transcription_result or not transcription_result.get("text"):
            logger.error("Transcription failed or returned empty result")
            raise HTTPException(status_code=500, detail="Transcription failed")
        
        transcribed_text = transcription_result["text"]
        logger.info(f"Transcription successful: {transcribed_text[:50]}...")
        
        # Send to n8n webhook in the background
        if background_tasks:
            background_tasks.add_task(
                send_to_n8n, 
                webhook_url, 
                {"transcription": transcribed_text}
            )
        else:
            # If no background tasks available, send synchronously
            await send_to_n8n(webhook_url, {"transcription": transcribed_text})
        
        return {
            "success": True,
            "text": transcribed_text
        }
    
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# New endpoint to receive text from n8n and convert to speech
@app.post("/api/speak")
async def speak_endpoint(request: TextRequest):
    """
    Receive text from n8n and convert it to speech.
    """
    try:
        text = request.text
        logger.info(f"Received text for TTS: {text[:50]}...")
        
        # Convert text to speech
        audio_path = await text_to_speech(text)
        
        # Return the audio file
        return FileResponse(
            path=audio_path, 
            media_type="audio/mpeg", 
            filename="response.mp3",
            headers={"X-Text-Content": text}
        )
    
    except Exception as e:
        logger.error(f"Error processing speak request: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# Webhook endpoint that can handle both receiving text from n8n and sending transcriptions to n8n
@app.post("/api/webhook/{webhook_id}")
async def webhook_endpoint(
    webhook_id: str,
    request: Request,
    background_tasks: BackgroundTasks
):
    """
    Bidirectional webhook endpoint for n8n integration.
    Can receive text from n8n and return audio, or receive audio and send text to n8n.
    """
    content_type = request.headers.get("content-type", "")
    
    try:
        if "multipart/form-data" in content_type:
            # This is an audio upload from the frontend
            form_data = await request.form()
            audio = form_data.get("audio")
            webhook_url = form_data.get("webhook_url")
            
            if not audio or not webhook_url:
                raise HTTPException(status_code=400, detail="Missing audio or webhook_url")
            
            # Process as audio upload (similar to transcribe_endpoint)
            transcription_result = await transcribe_audio(audio)
            transcribed_text = transcription_result["text"]
            
            # Send to n8n webhook
            await send_to_n8n(webhook_url, {"transcription": transcribed_text})
            
            return {
                "success": True,
                "text": transcribed_text
            }
            
        else:
            # This is a text response from n8n
            body = await request.json()
            
            if "text" not in body:
                raise HTTPException(status_code=400, detail="Missing 'text' field in request body")
            
            # Convert text to speech
            audio_path = await text_to_speech(body["text"])
            
            # Return the audio file
            return FileResponse(
                path=audio_path, 
                media_type="audio/mpeg", 
                filename="response.mp3",
                headers={"X-Text-Content": body["text"]}
            )
    
    except Exception as e:
        logger.error(f"Error processing webhook request: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# Health check endpoint
@app.get("/api/health")
async def health_check():
    """
    Health check endpoint to verify the API is running.
    """
    return {"status": "ok"}

# Mount static files for the frontend
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

# Run the application
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
