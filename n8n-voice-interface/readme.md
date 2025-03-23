# N8N Voice Interface

A web application that serves as a voice interface for the n8n platform. This application listens to user speech, transcribes it using OpenAI's `gpt-4o-transcribe` model, and sends the transcribed text to an n8n webhook.

## Features

- **Simple Voice Interface**: Click and speak to trigger your n8n workflows
- **High-Quality Transcription**: Uses OpenAI's advanced `gpt-4o-transcribe` model for accurate speech recognition
- **N8N Integration**: Sends transcribed text directly to any n8n webhook
- **Easy Configuration**: Set your n8n webhook URL directly in the web interface
- **Modern UI**: Clean, responsive design with audio visualization

## Prerequisites

- OpenAI API Key
- n8n instance with a webhook node

## Installation

### Using Docker (recommended)

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/n8n-voice-interface.git
   cd n8n-voice-interface
   ```

2. Set your OpenAI API key:
   ```bash
   echo "OPENAI_API_KEY=your_openai_api_key_here" > .env
   ```

3. Build and run the Docker container:
   ```bash
   docker-compose up -d
   ```

4. Access the application at http://localhost:8000

### Manual Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/n8n-voice-interface.git
   cd n8n-voice-interface
   ```

2. Install backend dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. Set your OpenAI API key:
   ```bash
   export OPENAI_API_KEY=your_openai_api_key_here
   ```

4. Run the application:
   ```bash
   python app.py
   ```

5. Access the application at http://localhost:8000

## Setting Up n8n

1. In your n8n instance, add a Webhook node
2. Set it to wait for POST requests
3. Copy the webhook URL
4. Paste the webhook URL in the settings section of the N8N Voice Interface
5. In your n8n workflow, access the transcription text using `{{ $json.transcription }}`

## Usage

1. Open the web application in your browser
2. Enter your n8n webhook URL in the settings section
3. Click the microphone button and speak
4. Your speech will be transcribed and sent to the n8n webhook
5. Your n8n workflow will be triggered with the transcribed text

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key
- `STT_MODEL`: The speech-to-text model to use (default: `gpt-4o-transcribe`)
- `PORT`: The port to run the application on (default: `8000`)

## License

MIT

## Acknowledgements

- This project was inspired by the AIUI project
- Uses OpenAI's Speech-to-Text API
- Built with FastAPI and modern web technologies
