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
        # Save the uploaded file to a temporary location
        temp_dir = tempfile.gettempdir()
        original_temp_file = os.path.join(temp_dir, f"original_{uuid.uuid4()}_{audio_file.filename}")
        final_temp_file = os.path.join(temp_dir, f"converted_{uuid.uuid4()}.mp3")

        with open(original_temp_file, "wb") as temp_file:
            # Read the file in chunks
            content = await audio_file.read()
            temp_file.write(content)

        logger.info(f"Saved audio to temporary file: {original_temp_file}")
        logger.info(f"File size: {os.path.getsize(original_temp_file)} bytes")

        # Próbuj przekonwertować audio do formatu MP3 za pomocą ffmpeg
        try:
            # Sprawdź czy ffmpeg jest dostępny, używając which
            which_result = subprocess.run(['which', 'ffmpeg'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            ffmpeg_available = which_result.returncode == 0

            if ffmpeg_available:
                logger.info(f"Converting audio file to MP3 format...")
                # Konwersja do MP3
                result = subprocess.run([
                    'ffmpeg', '-y', '-i', original_temp_file, 
                    '-ar', '44100',  # Ustaw częstotliwość próbkowania na 44.1kHz
                    '-ac', '1',      # Ustaw 1 kanał (mono)
                    '-b:a', '128k',  # Bitrate 128kbps
                    final_temp_file
                ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                
                if result.returncode != 0:
                    error_output = result.stderr.decode() if result.stderr else "Unknown error"
                    logger.error(f"Error converting audio: {error_output}")
                    # W przypadku błędu, użyj oryginalnego pliku
                    final_temp_file = original_temp_file
                else:
                    logger.info("Audio successfully converted to MP3")
            else:
                logger.warning("ffmpeg not available - using original file")
                final_temp_file = original_temp_file
        except Exception as e:
            logger.error(f"Error during conversion attempt: {str(e)}")
            # W przypadku błędu, użyj oryginalnego pliku
            final_temp_file = original_temp_file

        logger.info(f"Using file for API request: {final_temp_file}")

        # Check file size
        file_size = os.path.getsize(final_temp_file)
        logger.info(f"Final file size: {file_size} bytes")
        
        if file_size == 0:
            raise HTTPException(status_code=400, detail="Audio file is empty")
        
        if file_size > 25 * 1024 * 1024:  # 25MB limit
            raise HTTPException(status_code=400, detail="Audio file exceeds 25MB limit")

        # Set up the request headers
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}"
        }

        # Prepare the file and form data
        with open(final_temp_file, "rb") as file:
            # Set explicit MIME type to audio/mpeg as a safe default
            files = {
                "file": (os.path.basename(final_temp_file), file, "audio/mpeg"),
                "model": (None, STT_MODEL),
                "language": (None, "pl")  # Force Polish language recognition
            }
            
            # Make the API request
            logger.info(f"Sending request to OpenAI API using model: {STT_MODEL} with language: pl")
            logger.info(f"File name being sent: {os.path.basename(final_temp_file)}")
            
            response = requests.post(
                API_URL,
                headers=headers,
                files=files
            )

        # Clean up temporary files
        try:
            if os.path.exists(original_temp_file):
                os.remove(original_temp_file)
                logger.info(f"Removed original temporary file: {original_temp_file}")
            
            if os.path.exists(final_temp_file) and final_temp_file != original_temp_file:
                os.remove(final_temp_file)
                logger.info(f"Removed converted temporary file: {final_temp_file}")
        except Exception as e:
            logger.warning(f"Failed to remove temporary files: {str(e)}")

        # Check for errors
        if response.status_code != 200:
            logger.error(f"OpenAI API error: {response.status_code} - {response.text}")

            # Attempt to parse the error
            error_msg = "Transcription failed"
            try:
                error_data = response.json()
                if "error" in error_data and "message" in error_data["error"]:
                    error_msg = error_data["error"]["message"]
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
