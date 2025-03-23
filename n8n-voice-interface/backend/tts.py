import os
import logging
import uuid
import tempfile
import requests
import json
from fastapi import HTTPException

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
TTS_MODEL = os.getenv("TTS_MODEL", "gpt-4o-mini-tts")
TTS_VOICE = os.getenv("TTS_VOICE", "alloy")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
API_URL = "https://api.openai.com/v1/audio/speech"

async def text_to_speech(text: str) -> str:
    """
    Convert text to speech using OpenAI's TTS API.
    
    Args:
        text: The text to convert to speech
    
    Returns:
        Path to the audio file
    """
    if not OPENAI_API_KEY:
        logger.error("OpenAI API key not found in environment")
        raise HTTPException(
            status_code=500, 
            detail="OPENAI_API_KEY environment variable not set"
        )
    
    logger.info(f"Using TTS model: {TTS_MODEL} with voice: {TTS_VOICE}")
    
    try:
        # Create a temporary file for the audio
        temp_dir = tempfile.gettempdir()
        output_path = os.path.join(temp_dir, f"{uuid.uuid4()}.mp3")
        
        # Set up the request headers
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # Prepare the request payload
        payload = {
            "model": TTS_MODEL,
            "voice": TTS_VOICE,
            "input": text,
            "response_format": "mp3"
        }
        
        # Make the API request
        logger.info(f"Sending TTS request to OpenAI API")
        response = requests.post(
            API_URL,
            headers=headers,
            json=payload,
            stream=True  # Stream the response to handle large audio files
        )
        
        # Check for errors
        if response.status_code != 200:
            logger.error(f"OpenAI API error: {response.status_code} - {response.text}")
            
            # Attempt to parse the error
            error_msg = "Text to speech conversion failed"
            try:
                error_data = response.json()
                if "error" in error_data and "message" in error_data["error"]:
                    error_msg = error_data["error"]["message"]
            except:
                pass
            
            raise HTTPException(status_code=500, detail=error_msg)
        
        # Save the audio to the temporary file
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=1024):
                if chunk:
                    f.write(chunk)
        
        logger.info(f"TTS successful, saved to: {output_path}")
        
        return output_path
    
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        
        logger.error(f"Error during text-to-speech conversion: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Text-to-speech error: {str(e)}")
