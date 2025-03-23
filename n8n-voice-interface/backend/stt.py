import os
import logging
import uuid
import tempfile
import requests
import subprocess
from fastapi import UploadFile, HTTPException

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
STT_MODEL = os.getenv("STT_MODEL", "gpt-4o-transcribe")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
API_URL = "https://api.openai.com/v1/audio/transcriptions"

# Helper to check file details (without python-magic)
def get_file_info(file_path):
    """Get basic file information without python-magic."""
    try:
        # Sprawdź początkowe bajty pliku
        with open(file_path, 'rb') as f:
            header = f.read(16)  # Czytamy pierwsze 16 bajtów
        
        # Próbujemy zidentyfikować typ na podstawie nagłówka
        file_type = "unknown"
        if header.startswith(b'RIFF'):
            file_type = "audio/wav"
        elif header.startswith(b'\xFF\xFB') or header.startswith(b'ID3'):
            file_type = "audio/mpeg"
        elif header.startswith(b'OggS'):
            file_type = "audio/ogg"
        elif header.startswith(b'1A45DFA3'):
            file_type = "audio/webm"
            
        # Pobierz rozmiar pliku
        file_size = os.path.getsize(file_path)
        
        return {
            "filename": os.path.basename(file_path),
            "size": file_size,
            "guessed_type": file_type
        }
    except Exception as e:
        logger.error(f"Error getting file info: {str(e)}")
        return {
            "filename": os.path.basename(file_path),
            "size": os.path.getsize(file_path),
            "guessed_type": "unknown"
        }

async def transcribe_audio(audio_file: UploadFile) -> dict:
    """
    Transcribe audio using OpenAI's API.
    
    Args:
        audio_file: The uploaded audio file
    
    Returns:
        A dictionary containing the transcription text
    """
    if not OPENAI_API_KEY:
        logger.error("OpenAI API key not found in environment")
        raise HTTPException(
            status_code=500, 
            detail="OPENAI_API_KEY environment variable not set"
        )
    logger.info("OpenAI API key found in environment")

    try:
        # Get file details from request
        filename = audio_file.filename
        content_type = audio_file.content_type or "unknown"
        logger.info(f"File from request: {filename}, content-type: {content_type}")

        # Save the uploaded file to a temporary location
        temp_dir = tempfile.gettempdir()
        temp_file_path = os.path.join(temp_dir, f"{uuid.uuid4()}_{filename}")

        with open(temp_file_path, "wb") as temp_file:
            # Read the file in chunks
            content = await audio_file.read()
            temp_file.write(content)

        logger.info(f"Saved audio to temporary file: {temp_file_path}")
        
        # Get file info
        file_info = get_file_info(temp_file_path)
        logger.info(f"File info: {file_info}")

        # Check if the file is valid
        if file_info["size"] == 0:
            raise HTTPException(status_code=400, detail="Audio file is empty")
        
        if file_info["size"] > 25 * 1024 * 1024:  # 25MB limit
            raise HTTPException(status_code=400, detail="Audio file exceeds 25MB limit")

        # Determine MIME type to use
        mime_type = content_type
        if content_type == "unknown" or not content_type:
            # Use extension to guess MIME type
            extension = os.path.splitext(filename)[1].lower()
            if extension == '.wav':
                mime_type = "audio/wav"
            elif extension in ['.mp3', '.mpeg', '.mpga']:
                mime_type = "audio/mpeg"
            elif extension == '.webm':
                mime_type = "audio/webm"
            elif extension == '.ogg':
                mime_type = "audio/ogg"
            else:
                # Fallback to a common type
                mime_type = "audio/mpeg"
        
        logger.info(f"Using MIME type: {mime_type}")

        # Set up the request headers
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}"
        }

        # Prepare the file and form data
        with open(temp_file_path, "rb") as file:
            # Use the determined MIME type
            files = {
                "file": (filename, file, mime_type),
                "model": (None, STT_MODEL),
                "language": (None, "pl")  # Force Polish language recognition
            }
            
            # Make the API request
            logger.info(f"Sending request to OpenAI API using model: {STT_MODEL} with language: pl")
            logger.info(f"File name being sent: {filename} with MIME type: {mime_type}")
            
            response = requests.post(
                API_URL,
                headers=headers,
                files=files
            )

        # Clean up temporary file
        try:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
                logger.info(f"Removed temporary file: {temp_file_path}")
        except Exception as e:
            logger.warning(f"Failed to remove temporary file: {str(e)}")

        # Check for errors
        if response.status_code != 200:
            logger.error(f"OpenAI API error: {response.status_code} - {response.text}")

            # Attempt to parse the error
            error_msg = "Transcription failed"
            try:
                error_data = response.json()
                if "error" in error_data and "message" in error_data["error"]:
                    error_msg = error_data["error"]["message"]
                    
                # Provide more helpful message for common errors
                if "unsupported" in error_msg.lower():
                    error_msg += ". Please try recording with a different browser or using WAV format."
            except:
                pass

            raise HTTPException(status_code=500, detail=error_msg)

        # Parse the response
        result = response.json()
        logger.info(f"Transcription successful: {result.get('text', '')[:50]}...")

        return result

    except Exception as e:
        if isinstance(e, HTTPException):
            raise

        logger.error(f"Error during transcription: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")
