import os
import logging
import uuid
import tempfile
import httpx
import json
from typing import Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
TTS_MODEL = os.getenv("TTS_MODEL", "gpt-4o-mini-tts")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
API_URL = "https://api.openai.com/v1/audio/speech"

async def text_to_speech(text: str) -> str:
    """
    Convert text to speech using OpenAI's API.
    """
    if not OPENAI_API_KEY:
        logger.error("OpenAI API key not found in environment")
        raise Exception("OPENAI_API_KEY environment variable not set")

    try:
        # Create a unique filename for the output
        temp_dir = tempfile.gettempdir()
        output_file = os.path.join(temp_dir, f"{uuid.uuid4()}.mp3")

        # Set up headers
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        }

        # Prepare the request payload
        payload = {
            "model": TTS_MODEL,
            "voice": "ash",
            "input": text
        }

        logger.info(f"Making TTS request with model {TTS_MODEL} and voice ash")

        # Make the API request
        timeout_settings = httpx.Timeout(30.0, read=30.0)
        async with httpx.AsyncClient(timeout=timeout_settings) as client:
            response = await client.post(API_URL, headers=headers, json=payload)
            if response.status_code != 200:
                error_text = response.text
                logger.error(f"OpenAI API error: {response.status_code} - {error_text}")
                raise Exception(f"TTS failed: {error_text}")

            # Save the audio response to a file
            with open(output_file, 'wb') as f:
                f.write(response.content)

        logger.info(f"TTS successful: Output saved to {output_file}")
        return output_file

    except Exception as e:
        logger.error(f"Error during text-to-speech conversion: {str(e)}", exc_info=True)
        raise Exception(f"TTS error: {str(e)}")