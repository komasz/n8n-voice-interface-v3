
"""
Replit entry point for N8N Voice Interface
"""
import os
import sys

# Make sure STT_MODEL is set
if "STT_MODEL" not in os.environ:
    os.environ["STT_MODEL"] = "gpt-4o-transcribe"

# Create necessary directories if they don't exist
temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tmp", "audio")
os.makedirs(temp_dir, exist_ok=True)

# Add the project paths to the Python path
project_path = os.path.dirname(os.path.abspath(__file__))
n8n_path = os.path.join(project_path, "n8n-voice-interface")
sys.path.insert(0, n8n_path)
backend_path = os.path.join(n8n_path, "backend")
sys.path.insert(0, backend_path)

# Change working directory to backend directory
os.chdir(backend_path)

# Import the application
from app import app
import uvicorn

if __name__ == "__main__":
    # Get port from environment (Replit sets this)
    port = int(os.environ.get("PORT", 8080))
    
    print("Starting N8N Voice Interface...")
    print(f"Using STT model: {os.environ.get('STT_MODEL')}")
    print(f"Port: {port}")
    
    # Run the application
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)
