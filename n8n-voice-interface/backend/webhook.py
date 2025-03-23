import logging
import json
import aiohttp
from typing import Dict, Any

# Configure logging
logger = logging.getLogger(__name__)

async def send_to_n8n(webhook_url: str, data: Dict[str, Any]) -> bool:
    """
    Send data to n8n webhook.
    
    Args:
        webhook_url: The n8n webhook URL to send data to
        data: The data to send (will be converted to JSON)
    
    Returns:
        True if successful, False otherwise
    """
    try:
        logger.info(f"Sending data to n8n webhook: {webhook_url}")
        
        # Create a JSON payload
        payload = {
            "transcription": data.get("transcription", ""),
            "timestamp": data.get("timestamp", ""),
            "metadata": {
                "source": "n8n-voice-interface",
                "version": "1.0.0"
            }
        }
        
        # Set up headers
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        # Send the request
        async with aiohttp.ClientSession() as session:
            async with session.post(
                webhook_url, 
                data=json.dumps(payload),
                headers=headers
            ) as response:
                # Check response
                if response.status == 200:
                    response_body = await response.text()
                    logger.info(f"Webhook successful. Response: {response_body}")
                    return True
                else:
                    error_text = await response.text()
                    logger.error(f"Webhook failed with status {response.status}: {error_text}")
                    return False
    
    except Exception as e:
        logger.error(f"Error sending webhook: {str(e)}", exc_info=True)
        return False
