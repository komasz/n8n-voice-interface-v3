#!/bin/bash
# Setup script for N8N Voice Interface on Replit

echo "Setting up N8N Voice Interface..."

# Install dependencies using pip with --user flag
echo "Installing Python dependencies..."
pip install fastapi==0.103.1 uvicorn==0.23.2 python-multipart==0.0.6 httpx==0.26.0 requests==2.31.0 python-dotenv==1.0.0 pydantic==2.3.0 pydub==0.25.1 --user

# Create required directories
echo "Creating temporary directories..."
mkdir -p /tmp/audio

# Set environment variables
echo "Setting environment variables..."
export STT_MODEL="gpt-4o-transcribe"
export TTS_MODEL="gpt-4o-mini-tts"
export TTS_VOICE="ash"

echo "Setup complete!"
echo "You can now run the application with: python main.py"