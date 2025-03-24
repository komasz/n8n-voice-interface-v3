"""
Replit entry point for N8N Voice Interface
"""
import os
import sys
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Make sure STT_MODEL is set
if "STT_MODEL" not in os.environ:
    os.environ["STT_MODEL"] = "gpt-4o-transcribe"

# Create necessary directories if they don't exist
temp_dir = os.path.join("/tmp", "audio")
os.makedirs(temp_dir, exist_ok=True)

# Add the project paths to the Python path
project_path = os.path.dirname(os.path.abspath(__file__))
sys.path.append(project_path)

# Print debugging information
print("Current directory:", os.getcwd())
print("Files in current directory:", os.listdir("."))

# Check if n8n-voice-interface directory exists
if os.path.exists("n8n-voice-interface"):
    print("Found n8n-voice-interface directory")
    print("Contents:", os.listdir("n8n-voice-interface"))

    # Change to n8n-voice-interface directory
    os.chdir("n8n-voice-interface")

    # Now import the app
    try:
        print("Importing from backend.app")
        from backend.app import app
    except ImportError as e:
        print(f"Import error: {e}")
        print("Trying alternative import path...")
        sys.path.append(os.path.join(os.getcwd(), "backend"))
        from app import app
else:
    # Try direct import if no subdirectory
    print("No n8n-voice-interface directory found, trying direct import")
    try:
        from backend.app import app
    except ImportError:
        print("Falling back to last resort import")
        # Last resort
        sys.path.append(os.path.join(os.getcwd(), "backend"))
        from app import app

if __name__ == "__main__":
    # Get port from environment (Replit sets this)
    port = int(os.environ.get("PORT", 8080))

    print("Starting N8N Voice Interface...")
    print(f"Using STT model: {os.environ.get('STT_MODEL')}")
    print(f"Port: {port}")

    # Run the application
    import uvicorn
    uvicorn.run(
        "backend.app:app", 
        host="0.0.0.0", 
        port=port,
        reload=False
    )