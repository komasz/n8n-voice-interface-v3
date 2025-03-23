"""
Replit entry point for N8N Voice Interface
"""
import os
import sys

# Upewnij się, że STT_MODEL jest ustawiony
if "STT_MODEL" not in os.environ:
    os.environ["STT_MODEL"] = "gpt-4o-transcribe"

# Utwórz niezbędne katalogi, jeśli nie istnieją
temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tmp", "audio")
os.makedirs(temp_dir, exist_ok=True)

# Dodaj ścieżkę do projektu
project_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "n8n-voice-interface")
sys.path.append(project_path)

# Importuj aplikację
from backend.app import app
import uvicorn

if __name__ == "__main__":
    # Pobierz port z środowiska (Replit ustawia to)
    port = int(os.environ.get("PORT", 8080))
    
    print("Starting N8N Voice Interface...")
    print(f"Using STT model: {os.environ.get('STT_MODEL')}")
    print(f"Port: {port}")
    
    # Uruchom aplikację
    uvicorn.run(
        "backend.app:app", 
        host="0.0.0.0", 
        port=port,
        reload=False
    )
