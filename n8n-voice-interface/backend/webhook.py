import logging
import json
import httpx
from typing import Dict, Any, Optional, Union

# Configure logging
logger = logging.getLogger(__name__)

async def send_to_n8n(webhook_url: str, data: Dict[str, Any]) -> Union[Dict[str, Any], bool]:
    """
    Send data to n8n webhook and return the response if available.
    
    Args:
        webhook_url: The n8n webhook URL to send data to
        data: The data to send (will be converted to JSON)
    
    Returns:
        The n8n response as a dict if available, or True/False for success/failure
    """
    try:
        # Check if webhook URL is a placeholder or invalid
        if (webhook_url.startswith("http://YOUR-N8N-INSTANCE") or 
            webhook_url.startswith("https://twoja-instancja-n8n.com") or
            webhook_url.startswith("https://your-n8n-instance.com")):
            logger.warning(f"Using placeholder webhook URL: {webhook_url}")
            # Return a helpful error message
            return {
                "text": "Please configure your n8n webhook URL in the settings before using the voice interface. " +
                        "The current URL is a placeholder and won't work."
            }
            
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
        
        # Set timeout to avoid long waits
        timeout = httpx.Timeout(10.0)
        
        # Send the request
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                webhook_url, 
                json=payload,
                headers=headers
            )
            
            # Check response
            if response.status_code == 200:
                try:
                    # Try to parse the response as JSON
                    response_text = response.text
                    logger.info(f"Webhook successful. Response: {response_text}")
                    
                    try:
                        response_json = response.json()
                        
                        # Check if the response has a text field
                        if isinstance(response_json, dict) and "text" in response_json:
                            return response_json
                        else:
                            # Try to extract text from different formats
                            if isinstance(response_json, dict):
                                # Try common formats
                                for key in ["message", "response", "content", "result"]:
                                    if key in response_json and isinstance(response_json[key], str):
                                        return {"text": response_json[key]}
                            
                            # If response is just a string, wrap it
                            if isinstance(response_json, str):
                                return {"text": response_json}
                            
                            # If we can't find a text field, use the whole response as text
                            return {"text": response_text}
                    except json.JSONDecodeError:
                        # If it's not JSON, use the raw text
                        return {"text": response_text}
                except Exception as e:
                    logger.error(f"Error parsing webhook response: {str(e)}")
                    return True
            else:
                error_text = response.text
                logger.error(f"Webhook failed with status {response.status_code}: {error_text}")
                return False
    
    except httpx.ConnectError as e:
        logger.error(f"Connection error when sending webhook: {str(e)}")
        return {"text": f"Could not connect to the n8n webhook. Please check if your n8n instance is running and accessible."}
    except httpx.HTTPError as e:
        logger.error(f"HTTP error when sending webhook: {str(e)}")
        return {"text": f"Error connecting to webhook: {str(e)}"}
    except Exception as e:
        logger.error(f"Error sending webhook: {str(e)}", exc_info=True)
        return {"text": f"Error: {str(e)}"}
