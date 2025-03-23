import logging
import os
from fastapi import FastAPI, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from stt import transcribe_audio
from webhook import send_to_n8n

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
