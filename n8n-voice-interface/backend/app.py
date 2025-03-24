import logging
import os
import json
import base64
from typing import Optional
from fastapi import FastAPI, UploadFile, Form, HTTPException, BackgroundTasks, Request, Response
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
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

# Store the last n8n response for retrieval
last_n8n_response = None
last_tts_file_path = None

# Model for receiving text from n8n
class TextRequest(BaseModel):
    text: str

# Response model for combined text and audio
class AudioTextResponse(BaseModel):
    text: str
    audio_url: str

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
        logger.info(f"Transcription successful: {transcribed_text[:50]}...")
        
        # Send to n8n webhook and get response
        n8n_response = await send_to_n8n(webhook_url, {"transcription": transcribed_text})
        
        # Store the n8n response globally
        if isinstance(n8n_response, dict) and "text" in n8n_response:
            last_n8n_response = n8n_response
            logger.info(f"Stored n8n response: {n8n_response['text'][:50]}...")
            
            # Generate TTS for the response right away to have it ready
            if background_tasks:
                background_tasks.add_task(
                    generate_tts_for_response,
                    n8n_response["text"]
                )
            else:
                await generate_tts_for_response(n8n_response["text"])
                
            # Return both the transcription and the n8n response
            return {
                "success": True,
                "text": transcribed_text,
                "n8nResponse": n8n_response
            }
        
        return {
            "success": True,
            "text": transcribed_text
        }
    
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# Function to generate TTS for n8n response
async def generate_tts_for_response(text: str):
    """
    Generate TTS for the n8n response and store the file path.
    """
    global last_tts_file_path
    
    try:
        file_path = await text_to_speech(text)
        last_tts_file_path = file_path
        logger.info(f"Generated TTS for n8n response, saved to: {file_path}")
    except Exception as e:
        logger.error(f"Error generating TTS for n8n response: {str(e)}")

# Endpoint to get the last n8n response
@app.post("/api/get-n8n-response")
async def get_n8n_response(request: dict):
    """
    Get the last n8n response, including webhook_url for verification.
    """
    if not last_n8n_response:
        raise HTTPException(status_code=404, detail="No n8n response available")
    
    return last_n8n_response

# Modified endpoint to get the last TTS file with text in the response body, not header
@app.get("/api/last-response-tts")
async def get_last_response_tts():
    """
    Get the TTS audio file for the last n8n response.
    """
    global last_tts_file_path, last_n8n_response
    
    if not last_tts_file_path or not os.path.exists(last_tts_file_path):
        if last_n8n_response and "text" in last_n8n_response:
            # Try to generate the TTS file if it doesn't exist
            try:
                last_tts_file_path = await text_to_speech(last_n8n_response["text"])
            except Exception as e:
                logger.error(f"Error generating TTS file: {str(e)}")
                raise HTTPException(status_code=500, detail="Could not generate TTS file")
        else:
            raise HTTPException(status_code=404, detail="No TTS file available")
    
    # Get the text content
    text_content = last_n8n_response["text"] if last_n8n_response and "text" in last_n8n_response else ""
    
    # Create a unique audio URL using the file path
    audio_url = f"/api/audio/{os.path.basename(last_tts_file_path)}"
    
    # Return JSON with text and audio URL
    return {
        "text": text_content,
        "audio_url": audio_url
    }

# Endpoint to serve audio files by filename
@app.get("/api/audio/{filename}")
async def get_audio_file(filename: str):
    """
    Serve an audio file by its filename.
    """
    global last_tts_file_path
    
    if not last_tts_file_path or not os.path.exists(last_tts_file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    # Simple validation to prevent path traversal
    if os.path.basename(last_tts_file_path) != filename:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Stream the file content directly
    def iterfile():
        with open(last_tts_file_path, mode="rb") as file_like:
            yield from file_like
    
    return StreamingResponse(iterfile(), media_type="audio/mpeg")

# New endpoint to receive text from n8n and convert to speech
@app.post("/api/speak")
async def speak_endpoint(request: TextRequest):
    """
    Receive text and convert it to speech.
    """
    global last_n8n_response, last_tts_file_path
    
    try:
        text = request.text
        logger.info(f"Received text for TTS: {text[:50]}...")
        
        # Store this as the last n8n response for convenience
        last_n8n_response = {"text": text}
        
        # Convert text to speech
        audio_path = await text_to_speech(text)
        
        # Store the TTS file path
        last_tts_file_path = audio_path
        
        # Create a unique audio URL using the file path
        audio_url = f"/api/audio/{os.path.basename(audio_path)}"
        
        # Return JSON with text and audio URL instead of FileResponse
        return {
            "text": text,
            "audio_url": audio_url
        }
    
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
    global last_n8n_response, last_tts_file_path
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
            n8n_response = await send_to_n8n(webhook_url, {"transcription": transcribed_text})
            
            # Store the response globally
            if isinstance(n8n_response, dict) and "text" in n8n_response:
                last_n8n_response = n8n_response
            
            return {
                "success": True,
                "text": transcribed_text,
                "n8nResponse": n8n_response if isinstance(n8n_response, dict) else None
            }
            
        else:
            # This is a text response from n8n
            body = await request.json()
            
            if "text" not in body:
                raise HTTPException(status_code=400, detail="Missing 'text' field in request body")
            
            # Store as last n8n response
            last_n8n_response = {"text": body["text"]}
            
            # Convert text to speech
            audio_path = await text_to_speech(body["text"])
            
            # Store the TTS file path
            last_tts_file_path = audio_path
            
            # Create a unique audio URL using the file path
            audio_url = f"/api/audio/{os.path.basename(audio_path)}"
            
            # Return JSON with text and audio URL
            return {
                "text": body["text"],
                "audio_url": audio_url
            }
    
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
