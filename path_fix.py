
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
