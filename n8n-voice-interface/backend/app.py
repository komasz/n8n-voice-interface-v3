import logging
import os
import tempfile
from fastapi import FastAPI, UploadFile, Form, HTTPException, BackgroundTasks, Request, Body
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from typing import Dict, Any, Optional

from backend.stt import transcribe_audio
from backend.webhook import send_to_n8n
from backend.tts import text_to_speech

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create temporary directory for audio files if it doesn't exist
AUDIO_DIR = os.path.join(tempfile.gettempdir(), "audio_files")
os.makedirs(AUDIO_DIR, exist_ok=True)

# Store the last n8n response to replay if needed
last_n8n_response = None

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
    global last_n8n_response
    
    try:
        logger.info(f"Received audio file: {audio.filename}, size: {audio.size} bytes")
        
        # Transcribe the audio
        transcription_result = await transcribe_audio(audio)
        
        if not transcription_result or not transcription_result.get("text"):
            logger.error("Transcription failed or returned empty result")
            raise HTTPException(status_code=500, detail="Transcription failed")
        
        transcribed_text = transcription_result["text"]
        logger.info(f"Transcription successful: {transcribed_text[:30]}...")
        
        # Send to n8n webhook
        n8n_response = await send_to_n8n(webhook_url, {"transcription": transcribed_text})
        
        # Check if n8n returned a response message
        response_message = None
        if isinstance(n8n_response, dict) and "message" in n8n_response:
            response_message = n8n_response["message"]
            logger.info(f"Stored n8n response: {response_message[:40]}...")
            last_n8n_response = response_message
            
            # Generate TTS for the n8n response
            try:
                tts_file = await text_to_speech(response_message)
                logger.info(f"Generated TTS for n8n response, saved to: {tts_file}")
            except Exception as e:
                logger.error(f"Error generating TTS for n8n response: {str(e)}")
        
        return {
            "success": True,
            "text": transcribed_text,
            "response": response_message
        }
    
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# API endpoint for text-to-speech
@app.post("/api/speak")
async def speak_endpoint(request: Request):
    """
    Convert text to speech and return the audio file URL.
    """
    try:
        # Get the request body as JSON
        data = await request.json()
        text = data.get("text")
        
        if not text:
            raise HTTPException(status_code=400, detail="Text is required")
        
        logger.info(f"Received text for TTS: {text[:50]}...")
        
        # Generate speech
        audio_file = await text_to_speech(text)
        
        # Get filename from path
        filename = os.path.basename(audio_file)
        
        return {
            "text": text,
            "audio_url": f"/api/audio/{filename}"
        }
    
    except Exception as e:
        logger.error(f"Error processing TTS request: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# Endpoint to serve audio files
@app.get("/api/audio/{filename}")
async def get_audio(filename: str):
    """
    Serve audio files from the temporary directory.
    """
    try:
        # Check if file exists in temp directory
        file_path = os.path.join(tempfile.gettempdir(), filename)
        
        if os.path.exists(file_path):
            return FileResponse(
                file_path, 
                media_type="audio/mpeg", 
                filename=filename
            )
        
        # If file not found in regular temp dir, check AUDIO_DIR
        file_path = os.path.join(AUDIO_DIR, filename)
        if os.path.exists(file_path):
            return FileResponse(
                file_path, 
                media_type="audio/mpeg", 
                filename=filename
            )
            
        # File not found
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    except Exception as e:
        logger.error(f"Error serving audio file: {str(e)}", exc_info=True)
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=f"Error serving audio file: {str(e)}")

# Endpoint to get the last n8n response
@app.get("/api/last-response")
async def get_last_response():
    """
    Return the last response from n8n.
    """
    global last_n8n_response
    
    if last_n8n_response:
        return {"message": last_n8n_response}
    else:
        return {"message": None}

# Health check endpoint
@app.get("/api/health")
async def health_check():
    """
    Health check endpoint to verify the API is running.
    """
    return {"status": "ok"}

# Mount static files for the frontend
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")

# Run the application
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
