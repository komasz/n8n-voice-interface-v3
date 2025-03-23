import os
import logging
import uuid
import tempfile
import requests
from fastapi import UploadFile, HTTPException

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
STT_MODEL = os.getenv("STT_MODEL", "whisper-1")
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
        # Get information about the uploaded file
        content_type = audio_file.content_type
        original_filename = audio_file.filename
        file_extension = os.path.splitext(original_filename)[1].lower()
        
        logger.info(f"File from request: {original_filename}, content-type: {content_type}")
        
        # Determine the correct MIME type and extension based on available info
        # This is critical for OpenAI API compatibility
        mime_type = determine_mime_type(content_type, file_extension)
        logger.info(f"Determined MIME type: {mime_type}")
        
        # Create a filename with the proper extension
        proper_extension = get_extension_for_mime(mime_type)
        temp_filename = f"{uuid.uuid4()}{proper_extension}"
        
        # Save the uploaded file to a temporary location
        temp_dir = tempfile.gettempdir()
        temp_file_path = os.path.join(temp_dir, temp_filename)

        with open(temp_file_path, "wb") as temp_file:
            # Read the file in chunks to support large files
            content = await audio_file.read()
            temp_file.write(content)

        logger.info(f"Saved audio to temporary file: {temp_file_path}")
        logger.info(f"File size: {os.path.getsize(temp_file_path)} bytes")

        # Set up the request headers
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}"
        }

        # Prepare the file and form data
        with open(temp_file_path, "rb") as file:
            logger.info(f"Sending file to OpenAI: {os.path.basename(temp_file_path)} ({mime_type})")
            
            files = {
                "file": (os.path.basename(temp_file_path), file, mime_type),
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
            except:
                pass
                
            # Add debugging info to error message for frontend
            error_detail = f"{error_msg} (format: {mime_type}, model: {STT_MODEL})"
            raise HTTPException(status_code=500, detail=error_detail)

        # Parse the response
        result = response.json()
        logger.info(f"Transcription successful: {result.get('text', '')[:50]}...")

        return result

    except Exception as e:
        if isinstance(e, HTTPException):
            raise

        logger.error(f"Error during transcription: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")

def determine_mime_type(content_type, file_extension):
    """
    Determine the correct MIME type based on content type and file extension.
    OpenAI API prefers clear, consistent MIME types.
    """
    # Check file extension first
    if file_extension in ['.wav', '.wave']:
        return 'audio/wav'
    elif file_extension in ['.mp3', '.mpeg', '.mpga']:
        return 'audio/mpeg'
    elif file_extension in ['.m4a', '.mp4a']:
        return 'audio/mp4'
    elif file_extension in ['.webm']:
        return 'audio/webm'
    elif file_extension in ['.ogg', '.oga']:
        return 'audio/ogg'
    
    # If no clear extension, use content_type
    if content_type:
        if 'wav' in content_type:
            return 'audio/wav'
        elif 'mp3' in content_type or 'mpeg' in content_type:
            return 'audio/mpeg'
        elif 'mp4' in content_type or 'm4a' in content_type:
            return 'audio/mp4'
        elif 'webm' in content_type:
            return 'audio/webm'
        elif 'ogg' in content_type:
            return 'audio/ogg'
    
    # Default to WAV as it's well supported by OpenAI
    return 'audio/wav'

def get_extension_for_mime(mime_type):
    """
    Get the appropriate file extension for a MIME type
    """
    if 'wav' in mime_type:
        return '.wav'
    elif 'mp3' in mime_type or 'mpeg' in mime_type:
        return '.mp3'
    elif 'mp4' in mime_type or 'm4a' in mime_type:
        return '.mp4'
    elif 'webm' in mime_type:
        return '.webm'
    elif 'ogg' in mime_type:
        return '.ogg'
    else:
        return '.wav'  # Default to .wav
