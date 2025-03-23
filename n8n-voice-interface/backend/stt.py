import os
import logging
import uuid
import tempfile
import requests
import io
from fastapi import UploadFile, HTTPException

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
STT_MODEL = os.getenv("STT_MODEL", "whisper-1")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
API_URL = "https://api.openai.com/v1/audio/transcriptions"

# Try to import pydub - will be used for audio conversion if available
try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
    logger.info("Pydub is available for audio conversion")
except ImportError:
    PYDUB_AVAILABLE = False
    logger.warning("Pydub is not available, audio conversion will be limited")

# Get file info for debugging
def get_file_info(file_path):
    """
    Get basic file information for debugging.
    """
    info = {
        "filename": os.path.basename(file_path),
        "size": os.path.getsize(file_path),
    }
    
    # Try to detect file type from extension
    file_extension = os.path.splitext(file_path)[1].lower()
    if file_extension in ['.mp3', '.mpeg', '.mpga']:
        info["likely_type"] = "audio/mpeg"
    elif file_extension in ['.wav', '.wave']:
        info["likely_type"] = "audio/wav"
    elif file_extension in ['.webm']:
        info["likely_type"] = "audio/webm"
    elif file_extension in ['.ogg', '.oga']:
        info["likely_type"] = "audio/ogg"
    else:
        info["likely_type"] = "unknown"
    
    return info

# Simple function to normalize audio format using pydub
def normalize_audio_format(input_file, output_file=None, target_format="mp3"):
    """
    Convert audio to a standard format using pydub.
    
    Args:
        input_file: Path to input audio file
        output_file: Path for output file, if None, generates one
        target_format: Target format (mp3, wav)
        
    Returns:
        Path to the output file
    """
    if not PYDUB_AVAILABLE:
        logger.warning("Pydub not available, skipping normalization")
        return input_file
        
    if output_file is None:
        temp_dir = tempfile.gettempdir()
        output_file = os.path.join(temp_dir, f"{uuid.uuid4()}.{target_format}")
    
    try:
        # Try to guess the format from the file extension
        input_ext = os.path.splitext(input_file)[1][1:].lower()
        if not input_ext or input_ext == "":
            input_ext = "mp3"  # Default guess
        
        logger.info(f"Trying to load audio file as {input_ext} format")
        
        # Load the audio file
        audio = AudioSegment.from_file(input_file, format=input_ext)
        
        # Export to target format - use high quality MP3
        if target_format == "mp3":
            audio.export(
                output_file, 
                format="mp3",
                bitrate="128k",
                parameters=["-ac", "1"]  # Force mono channel
            )
        else:
            audio.export(output_file, format=target_format)
            
        logger.info(f"Audio converted from {input_ext} to {target_format}")
        return output_file
    except Exception as e:
        logger.error(f"Error converting audio: {str(e)}")
        return input_file

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
        # Get information about the uploaded file
        content_type = audio_file.content_type
        filename = audio_file.filename
        file_extension = os.path.splitext(filename)[1].lower()
        
        logger.info(f"File from request: {filename}, content-type: {content_type}")
        
        # Save the uploaded file to a temporary location
        temp_dir = tempfile.gettempdir()
        original_file_path = os.path.join(temp_dir, f"{uuid.uuid4()}_{filename}")

        with open(original_file_path, "wb") as temp_file:
            # Read the file in chunks
            content = await audio_file.read()
            temp_file.write(content)

        logger.info(f"Saved audio to temporary file: {original_file_path}")
        file_info = get_file_info(original_file_path)
        logger.info(f"File info: {file_info}")
        
        # Try to normalize audio format if possible
        if PYDUB_AVAILABLE:
            mp3_output_path = os.path.join(temp_dir, f"{uuid.uuid4()}.mp3")
            processed_file_path = normalize_audio_format(
                original_file_path, 
                mp3_output_path, 
                "mp3"
            )
            
            if processed_file_path == mp3_output_path:
                file_info = get_file_info(processed_file_path)
                logger.info(f"Using normalized MP3 file: {processed_file_path}")
                logger.info(f"Normalized file info: {file_info}")
                mime_type = "audio/mpeg"
            else:
                logger.warning("Audio normalization failed, using original file")
                processed_file_path = original_file_path
                # Try to determine appropriate MIME type
                if file_extension in ['.mp3', '.mpeg', '.mpga']:
                    mime_type = "audio/mpeg"
                elif file_extension in ['.wav', '.wave']:
                    mime_type = "audio/wav"
                elif file_extension in ['.webm']:
                    mime_type = "audio/webm"
                elif file_extension in ['.ogg', '.oga']:
                    mime_type = "audio/ogg"
                else:
                    mime_type = content_type or "audio/mpeg"
        else:
            # Without pydub, just use the original file
            processed_file_path = original_file_path
            # Try to determine appropriate MIME type
            if file_extension in ['.mp3', '.mpeg', '.mpga']:
                mime_type = "audio/mpeg"
            elif file_extension in ['.wav', '.wave']:
                mime_type = "audio/wav"
            elif file_extension in ['.webm']:
                mime_type = "audio/webm"
            elif file_extension in ['.ogg', '.oga']:
                mime_type = "audio/ogg"
            else:
                mime_type = content_type or "audio/mpeg"
        
        logger.info(f"Using MIME type: {mime_type}")

        # Set up the request headers
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}"
        }

        # Prepare the file and form data
        with open(processed_file_path, "rb") as file:
            # Log the file name and mime type for debugging
            logger.info(f"File name being sent: {os.path.basename(processed_file_path)} with MIME type: {mime_type}")
            
            files = {
                "file": (os.path.basename(processed_file_path), file, mime_type),
                "model": (None, STT_MODEL),
                "language": (None, "pl")  # Force Polish language recognition
            }
            
            # Make the API request
            logger.info(f"Sending request to OpenAI API using model: {STT_MODEL} with language: pl")
            response = requests.post(
                API_URL,
                headers=headers,
                files=files
            )

        # Clean up temporary files
        try:
            if os.path.exists(original_file_path):
                os.remove(original_file_path)
                logger.info(f"Removed temporary file: {original_file_path}")
            
            if processed_file_path != original_file_path and os.path.exists(processed_file_path):
                os.remove(processed_file_path)
                logger.info(f"Removed normalized file: {processed_file_path}")
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
