
"""
Launcher script for N8N Voice Interface on Replit
"""
import os
import sys
import shutil
import subprocess

# Get the root directory
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
N8N_DIR = os.path.join(ROOT_DIR, "n8n-voice-interface")
REPLIT_MAIN_SRC = os.path.join(ROOT_DIR, "replit-main.py")
REPLIT_MAIN_DST = os.path.join(N8N_DIR, "replit-main.py")

print("Starting N8N Voice Interface launcher...")

# Set environment variables
if "STT_MODEL" not in os.environ:
    os.environ["STT_MODEL"] = "gpt-4o-transcribe"

# Create necessary directories
temp_dir = os.path.join(ROOT_DIR, "tmp", "audio")
os.makedirs(temp_dir, exist_ok=True)

# Check if backend exists in root or in n8n-voice-interface
if os.path.exists(os.path.join(ROOT_DIR, "backend")):
    # Backend is in root
    backend_path = ROOT_DIR
elif os.path.exists(os.path.join(N8N_DIR, "backend")):
    # Backend is in n8n-voice-interface
    backend_path = N8N_DIR
else:
    print("Error: Could not find backend directory")
    sys.exit(1)

# Add the path to Python path
sys.path.append(backend_path)

# Change to the n8n-voice-interface directory
os.chdir(N8N_DIR)

# Try to run the application
try:
    # Import the application
    print(f"Importing app from {backend_path}/backend/app.py")
    from backend.app import app
    import uvicorn
    
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
except ImportError as e:
    print(f"Error importing app: {e}")
    
    # As a fallback, try to copy replit-main.py to n8n-voice-interface and run it from there
    if os.path.exists(REPLIT_MAIN_SRC) and os.path.exists(N8N_DIR):
        print(f"Copying replit-main.py to {REPLIT_MAIN_DST}...")
        shutil.copy(REPLIT_MAIN_SRC, REPLIT_MAIN_DST)
        
        print("Running replit-main.py from n8n-voice-interface directory...")
        os.chdir(N8N_DIR)
        subprocess.call([sys.executable, "replit-main.py"])
    else:
        print("Error: Could not find backend directory or copy replit-main.py")
        sys.exit(1)
