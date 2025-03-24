"""
Replit entry point for N8N Voice Interface
"""
import os
import sys
import subprocess

# Instaluj wymagane pakiety
print("Installing required packages...")
subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])

# Make sure STT_MODEL is set
if "STT_MODEL" not in os.environ:
    os.environ["STT_MODEL"] = "gpt-4o-transcribe"

# Create necessary directories if they don't exist
temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tmp", "audio")
os.makedirs(temp_dir, exist_ok=True)

# Add the project paths to the Python path
project_path = os.path.dirname(os.path.abspath(__file__))
sys.path.append(project_path)

# Import the application
from backend.app import app
import uvicorn

if __name__ == "__main__":
    # Get port from environment (Replit sets this)
    port = int(os.environ.get("PORT", 8080))
    
    print("Starting N8N Voice Interface...")
    print(f"Using STT model: {os.environ.get('STT_MODEL')}")
    print(f"Port: {port}")
    
    # Run the application
    uvicorn.run(
        "backend.app:app", 
        host="0.0.0.0", 
        port=port,
        reload=False
    )
