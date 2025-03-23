// Find supported MIME type
function getSupportedMimeType() {
    // Priorytetyzuj formaty obsługiwane przez OpenAI - ważna kolejność
    const mimeTypes = [
        'audio/wav',        // WAV działa najlepiej z OpenAI
        'audio/webm',       // WEBM też jest obsługiwany
        'audio/mp3',
        'audio/mpeg'
    ];
    
    for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
            console.log(`Przeglądarka wspiera nagrywanie w formacie ${type}`);
            return type;
        }
    }
    
    // Codec opus jest często dostępny i generuje dobry format
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        console.log('Przeglądarka wspiera nagrywanie w formacie audio/webm;codecs=opus');
        return 'audio/webm;codecs=opus';
    }
    
    console.warn('Żaden z preferowanych typów MIME nie jest obsługiwany przez tę przeglądarkę');
    return null;
}

// Start continuous listening mode
async function startListening() {
    // Get microphone stream z optymalnymi parametrami dla OpenAI
    microphoneStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
            channelCount: 1,         // Mono - ważne dla transkrypcji
            sampleRate: 16000,       // 16kHz jest optymalne dla większości modeli STT
            echoCancellation: true,  // Redukcja echa
            noiseSuppression: true,  // Redukcja szumów
            autoGainControl: true    // Automatyczna kontrola wzmocnienia
        } 
    });
    
    // Setup audio context and analyzer
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000  // Ustaw ten sam sampleRate jako audio context
    });
    audioSource = audioContext.createMediaStreamSource(microphoneStream);
    audioAnalyser = audioContext.createAnalyser();
    
    // Configure analyzer
    audioAnalyser.fftSize = 256;
    audioAnalyser.smoothingTimeConstant = 0.8;
    audioSource.connect(audioAnalyser);
    
    // Reset detection state
    silenceStartTime = null;
    speechDetected = false;
    isListening = true;
    isRecording = false;
    
    // Setup the media recorder z lepszymi opcjami
    const mimeType = getSupportedMimeType();
    const options = mimeType ? { 
        mimeType: mimeType,
        audioBitsPerSecond: 64000 // Niższy bitrate dla lepszej kompatybilności
    } : {};
    console.log("Używam MediaRecorder z typem:", mimeType || "domyślnym", "i bitrate:", options.audioBitsPerSecond || "domyślnym");
    mediaRecorder = new MediaRecorder(microphoneStream, options);
    
    // Start silence detection loop
    startSilenceDetection();
    
    // Start visualization
    visualizationContainer.classList.add('active-visualization');
    
    console.log("Continuous listening mode activated");
}

// Process a recorded audio blob
async function processRecording(audioBlob, recordingId) {
    const webhookUrl = localStorage.getItem('webhookUrl');
    
    if (!webhookUrl) {
        showMessage('Proszę najpierw ustawić adres URL webhooka N8N w ustawieniach', 'error');
        return;
    }
    
    // Logowanie informacji o Blob
    console.log(`Nagranie #${recordingId}: rozmiar=${audioBlob.size} bajtów, typ=${audioBlob.type}`);
    
    // Create a new conversation entry for this recording
    const entryId = `entry-${recordingId}`;
    addConversationEntry(entryId);
    
    try {
        activeRequests++;
        updateStatus();
        
        // Create form data for the API request
        const formData = new FormData();
        
        // Utwórz nazwę pliku z rozszerzeniem pasującym do MIME type
        let fileExtension = 'mp3';  // domyślne rozszerzenie
        if (audioBlob.type) {
            if (audioBlob.type.includes('wav')) fileExtension = 'wav';
            else if (audioBlob.type.includes('webm')) fileExtension = 'webm';
            else if (audioBlob.type.includes('ogg')) fileExtension = 'ogg';
        }
        
        const fileName = `recording-${recordingId}.${fileExtension}`;
        console.log(`Wysyłam nagranie jako: ${fileName} z typem MIME: ${audioBlob.type || 'audio/mpeg'}`);
        
        // Dodaj plik audio do formData
        formData.append('audio', audioBlob, fileName);
        formData.append('webhook_url', webhookUrl);
        
        // Send the audio to the backend
        const response = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            let errorMessage = 'Transkrypcja nie powiodła się';
            try {
                const errorData = await response.json();
                errorMessage = errorData.detail || errorMessage;
            } catch (e) {
                console.error('Błąd parsowania odpowiedzi błędu:', e);
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        // Update the conversation entry with the transcription
        updateConversationEntryWithTranscription(entryId, data.text);
        
        // Process the response from n8n
        if (data.n8nResponse && data.n8nResponse.text) {
            console.log(`Otrzymano natychmiastową odpowiedź dla nagrania #${recordingId}`);
            handleN8nResponse(data.n8nResponse.text, entryId);
        } else {
            // Try to get the response via last-response-tts endpoint
            try {
                const n8nResponse = await fetch('/api/last-response-tts', {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                    },
                });
                
                if (n8nResponse.ok) {
                    const responseData = await n8nResponse.json();
                    
                    if (responseData.text && responseData.audio_url) {
                        handleN8nResponse(responseData.text, entryId, responseData.audio_url);
                    } else {
                        handleDefaultResponse(entryId);
                    }
                } else {
                    handleDefaultResponse(entryId);
                }
            } catch (error) {
                console.error(`Błąd podczas pobierania odpowiedzi dla nagrania #${recordingId}:`, error);
                handleDefaultResponse(entryId);
            }
        }
    } catch (error) {
        console.error(`Błąd podczas przetwarzania nagrania #${recordingId}:`, error);
        updateConversationEntryWithError(entryId, error.message);
    } finally {
        activeRequests--;
        updateStatus();
    }
}
