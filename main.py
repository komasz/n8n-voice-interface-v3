"""
Main entry point for N8N Voice Interface on Replit
"""
import os
import sys
import site
import logging
import importlib
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("n8n-voice")

# Try to load environment variables from .env file (without requiring python-dotenv)
def load_env_file():
    """Load environment variables from .env file without requiring python-dotenv"""
    env_file = Path(__file__).parent / ".env"
    if env_file.exists():
        logger.info(f"Loading environment variables from {env_file}")
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue

                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip().strip('"\'')

        logger.info("Environment variables loaded from .env file")
    else:
        logger.info("No .env file found")

# Try to load .env file
try:
    load_env_file()
except Exception as e:
    logger.warning(f"Error loading .env file: {e}")

# Essential paths
project_dir = os.path.dirname(os.path.abspath(__file__))
n8n_dir = os.path.join(project_dir, "n8n-voice-interface")
backend_dir = os.path.join(n8n_dir, "backend")
frontend_dir = os.path.join(n8n_dir, "frontend")

# Add paths to Python path
paths_to_add = [
    project_dir,
    n8n_dir,
    backend_dir,
    site.getusersitepackages()  # Add user packages
]

for path in paths_to_add:
    if os.path.exists(path) and path not in sys.path:
        sys.path.insert(0, path)
        logger.info(f"Added to Python path: {path}")

# Check for required environment variables
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    logger.warning("OPENAI_API_KEY is not set. The application may not function correctly.")
    logger.info("You can set it in Replit Secrets or in a .env file.")

# Create necessary directories
os.makedirs("/tmp/audio", exist_ok=True)

# Set default environment variables if not already set
default_env = {
    "STT_MODEL": "gpt-4o-transcribe",
    "TTS_MODEL": "gpt-4o-mini-tts",
    "TTS_VOICE": "ash",
    "PORT": "8080"
}

for key, value in default_env.items():
    if key not in os.environ:
        os.environ[key] = value
        logger.info(f"Set default {key}={value}")

# Try to fix the frontend directory path issue
def ensure_frontend_accessible():
    """Make sure the frontend directory is accessible as expected"""
    expected_path = os.path.join(backend_dir, "..", "frontend")

    # If the relative path already exists, nothing to do
    if os.path.exists(expected_path):
        logger.info(f"Frontend directory already accessible at {expected_path}")
        return True

    # If the frontend directory exists, try to create a symlink
    if os.path.exists(frontend_dir):
        try:
            # Create a relative symlink
            os.symlink(frontend_dir, expected_path)
            logger.info(f"Created symlink from {expected_path} to {frontend_dir}")
            return True
        except Exception as e:
            logger.error(f"Failed to create symlink: {e}")

            # Alternative approach - try to copy files
            try:
                import shutil
                if not os.path.exists(expected_path):
                    os.makedirs(os.path.dirname(expected_path), exist_ok=True)
                    shutil.copytree(frontend_dir, expected_path)
                    logger.info(f"Copied frontend files to {expected_path}")
                    return True
            except Exception as e:
                logger.error(f"Failed to copy frontend files: {e}")

    logger.warning(f"Frontend directory not accessible at expected path: {expected_path}")
    logger.warning("Web interface may not work correctly")
    return False

# Print debug information
logger.info(f"Project directory: {project_dir}")
logger.info(f"N8N directory: {n8n_dir}")
logger.info(f"Backend directory: {backend_dir}")
logger.info(f"Frontend directory: {frontend_dir}")

# Check if the application can run
def check_imports():
    """Check if all required packages are available"""
    required_packages = ["fastapi", "uvicorn", "pydantic"]
    missing = []

    for package in required_packages:
        try:
            importlib.import_module(package)
        except ImportError:
            missing.append(package)

    if missing:
        logger.error(f"Missing required packages: {', '.join(missing)}")
        logger.error("Please install them with: pip install --user --break-system-packages fastapi uvicorn pydantic")
        return False

    logger.info("All required packages are installed")
    return True

# Main application
if __name__ == "__main__":
    # Ensure the frontend directory is accessible
    ensure_frontend_accessible()

    # Check imports
    if not check_imports():
        sys.exit(1)

    # Change to the correct directory
    os.chdir(n8n_dir)
    logger.info(f"Changed working directory to: {n8n_dir}")

    # Run the application
    try:
        # Try with backend module
        logger.info("Starting application...")

        # Import the app
        sys.path.insert(0, backend_dir)
        from backend.app import app

        # Run with uvicorn
        import uvicorn
        port = int(os.environ.get("PORT", 8080))
        logger.info(f"Starting server on port {port}")
        uvicorn.run("backend.app:app", host="0.0.0.0", port=port)
    except Exception as e:
        logger.error(f"Failed to start application: {e}")
        sys.exit(1)