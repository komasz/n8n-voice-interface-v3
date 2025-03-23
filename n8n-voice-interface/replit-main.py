"""
Replit entry point for N8N Voice Interface
"""
import os
import sys
import subprocess

# Spróbuj zainstalować wymagane biblioteki jeśli ich brakuje
try:
    import magic
except ImportError:
    print("Instalowanie python-magic...")
    subprocess.run([sys.executable, "-m", "pip", "install", "python-magic"], check=True)
    try:
        import magic
        print("Zainstalowano python-magic pomyślnie.")
    except ImportError:
        print("UWAGA: Nie udało się zainstalować python-magic. Niektóre funkcje mogą nie działać.")

# Sprawdź czy jest ffmpeg
ffmpeg_installed = False
try:
    result = subprocess.run(['which', 'ffmpeg'], capture_output=True)
    ffmpeg_installed = result.returncode == 0
except:
    ffmpeg_installed = False

if not ffmpeg_installed:
    print("ffmpeg nie jest zainstalowany. Spróbujemy go zainstalować...")
    try:
        # Uruchom skrypt instalacyjny bash
        subprocess.run(['bash', 'install-ffmpeg.sh'], check=True)
        print("Instalacja ffmpeg zakończona.")
    except Exception as e:
        print(f"Nie udało się zainstalować ffmpeg: {e}")
        print("UWAGA: Konwersja audio może nie działać poprawnie.")

# Add the current directory to the path so we can import from backend
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Upewnij się, że katalog dla plików audio istnieje
os.makedirs("frontend/audio", exist_ok=True)

# Set default STT model to gpt-4o-transcribe if not already set
if "STT_MODEL" not in os.environ:
    os.environ["STT_MODEL"] = "gpt-4o-transcribe"

# Import and run the app
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
