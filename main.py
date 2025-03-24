"""
Entry point for N8N Voice Interface on Replit
"""
import os
import sys
import site
import importlib
import shutil

# First, try to set up the Python path correctly
project_dir = os.path.dirname(os.path.abspath(__file__))
n8n_dir = os.path.join(project_dir, "n8n-voice-interface")
backend_dir = os.path.join(n8n_dir, "backend")
frontend_dir = os.path.join(n8n_dir, "frontend")

# Add directories to Python path
for path in [project_dir, n8n_dir, backend_dir]:
    if path not in sys.path:
        sys.path.insert(0, path)

# Add user site-packages to Python path
user_site = site.getusersitepackages()
if os.path.exists(user_site) and user_site not in sys.path:
    sys.path.insert(0, user_site)

# Try to import required packages
required_packages = ["fastapi", "uvicorn", "python_multipart", "httpx", "requests"]
missing_packages = []

for package in required_packages:
    try:
        importlib.import_module(package)
    except ImportError:
        missing_packages.append(package)

# If packages are missing, try to install them
if missing_packages:
    print(f"Missing packages: {missing_packages}")
    print("Running package installer...")
    try:
        # First try to import our installer
        try:
            from install_packages import install_packages
            install_packages()
        except ImportError:
            # If installer isn't available, run pip directly
            import subprocess
            print("Installing missing packages...")
            cmd = [
                sys.executable, 
                "-m", 
                "pip", 
                "install", 
                "--user",
                "--break-system-packages",
                "fastapi==0.103.1",
                "uvicorn==0.23.2",
                "python-multipart==0.0.6",
                "httpx==0.26.0",
                "requests==2.31.0",
                "python-dotenv==1.0.0",
                "pydantic==2.3.0",
                "pydub==0.25.1"
            ]
            subprocess.check_call(cmd)

            # Refresh site packages
            importlib.invalidate_caches()
    except Exception as e:
        print(f"Error installing packages: {e}")
        print("Please run the setup script manually:")
        print("python install_packages.py")
        sys.exit(1)

# Set environment variables
os.environ["STT_MODEL"] = os.environ.get("STT_MODEL", "gpt-4o-transcribe")
os.environ["TTS_MODEL"] = os.environ.get("TTS_MODEL", "gpt-4o-mini-tts")
os.environ["TTS_VOICE"] = os.environ.get("TTS_VOICE", "ash")

# Create temp directories
os.makedirs("/tmp/audio", exist_ok=True)

# Print debug information
print("Python path:")
for p in sys.path:
    print(f"  - {p}")

print(f"User site-packages: {user_site}")
print(f"Current directory: {os.getcwd()}")
print(f"Backend directory: {backend_dir}")
print(f"Frontend directory: {frontend_dir}")

# FIX THE FRONTEND PATH ISSUE
# Create a symbolic link to make "../frontend" work 
print("Setting up frontend directory for app...")
if os.path.exists(frontend_dir):
    print(f"Frontend directory exists at: {frontend_dir}")

    # Create a temporary patch to fix the relative path issue
    with open(os.path.join(backend_dir, 'path_fix.py'), 'w') as f:
        f.write("""
# Patch the app before importing
import os
import sys
from pathlib import Path

# Get the correct path to frontend
backend_dir = os.path.dirname(os.path.abspath(__file__))
frontend_dir = os.path.join(os.path.dirname(backend_dir), "frontend")

# Create a symbolic link or directory if needed
if not os.path.exists(os.path.join(backend_dir, "..", "frontend")):
    try:
        os.symlink(frontend_dir, os.path.join(backend_dir, "..", "frontend"))
        print(f"Created symlink to frontend directory")
    except:
        # If symlink fails, try to modify the app code directly
        import fileinput
        app_file = os.path.join(backend_dir, "app.py")
        for line in fileinput.input(app_file, inplace=True):
            if 'StaticFiles(directory="../frontend"' in line:
                print(line.replace('../frontend', frontend_dir))
            else:
                print(line, end='')
        print(f"Modified app.py to use absolute path: {frontend_dir}")
""")

    # Import the path fix before importing the app
    sys.path.insert(0, backend_dir)

    # Run the path fix
    print("Running path fix...")
    try:
        import path_fix
    except Exception as e:
        print(f"Error in path fix: {e}")

else:
    print(f"WARNING: Frontend directory not found at: {frontend_dir}")
    # Try to find the frontend directory
    for root, dirs, files in os.walk(n8n_dir):
        if "index.html" in files:
            print(f"Found potential frontend directory: {root}")
            # Create a symlink in the expected location
            try:
                os.symlink(root, os.path.join(backend_dir, "..", "frontend"))
                print(f"Created symlink to frontend directory: {root}")
            except Exception as e:
                print(f"Error creating symlink: {e}")

# Import and run the application
if __name__ == "__main__":
    try:
        # Check if we can import fastapi now
        import fastapi
        print("Successfully imported FastAPI!")

        # Change to n8n-voice-interface directory (important for relative paths)
        os.chdir(n8n_dir)
        print(f"Changed working directory to: {n8n_dir}")

        # Check if the expected frontend directory exists
        expected_frontend = os.path.join(n8n_dir, "frontend")
        if os.path.exists(expected_frontend):
            print(f"Frontend directory exists at: {expected_frontend}")
        else:
            print(f"WARNING: Frontend directory still missing at: {expected_frontend}")

        # Try to import the app
        from backend.app import app

        # Run the application
        import uvicorn
        port = int(os.environ.get("PORT", 8080))
        print(f"Starting N8N Voice Interface on port {port}...")
        uvicorn.run("backend.app:app", host="0.0.0.0", port=port)
    except ImportError as e:
        print(f"Error importing: {e}")
        print("Please run the setup script and try again.")
        sys.exit(1)