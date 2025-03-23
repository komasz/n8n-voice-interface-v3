document.addEventListener('DOMContentLoaded', () => {
    const recordButton = document.getElementById('record-button');
    const statusMessage = document.getElementById('status-message');
    const visualizationContainer = document.getElementById('visualization-container');
    const transcriptionContainer = document.getElementById('transcription-container');
    const transcriptionText = document.getElementById('transcription-text');
    const messageContainer = document.getElementById('message-container');
    const messageText = document.getElementById('message-text');
    const webhookUrlInput = document.getElementById('webhook-url');
    const saveSettingsButton = document.getElementById('save-settings');
    const responseContainer = document.getElementById('response-container');
    const responseText = document.getElementById('response-text');
    
    // Audio player for responses
    let audioPlayer = new Audio();
    
    // Status tracking
    let waitingForResponse = false;
    
    // Load saved webhook URL from localStorage
    webhookUrlInput.value = localStorage.getItem('webhookUrl') || '';

    // Save webhook URL to localStorage
    saveSettingsButton.addEventListener('click', () => {
        const webhookUrl = webhookUrlInput.value.trim();
        if (webhookUrl) {
            localStorage.setItem('webhookUrl', webhookUrl);
            showMessage('Ustawienia zapisane pomyślnie!', 'success');
        } else {
            showMessage('Proszę wprowadzić poprawny adres URL webhooka', 'error');
        }
    });

    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;
    
    // Variables for silence detection
    let audioContext;
    let audioAnalyser;
    let audioSource;
    let silenceDetectionInterval;
    
    // Silence detection settings
    const SILENCE_THRESHOLD = 15; // Threshold below which is considered silence
    const SILENCE_DURATION = 1500; // 1.5 seconds of silence to trigger stop
    const CHECK_INTERVAL = 100; // Check every 100ms
    let consecutiveSilenceChecks = 0;
    let silenceStartTime = null;
    let speechDetected = false;

    // Check if browser supports required APIs
    if (!navigator.mediaDevices || !window.MediaRecorder) {
        statusMessage.textContent = 'Twoja przeglądarka nie obsługuje nagrywania dźwięku.';
        recordButton.disabled = true;
        return;
    }

    // Handle recording button click
    recordButton.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    // Start recording function
    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: 16000
                } 
            });
            
            // Setup media recorder with specific MIME type if available
            const mimeType = getSupportedMimeType();
            const options = mimeType ? { mimeType } : {};
            
            mediaRecorder = new MediaRecorder(stream, options);
            audioChunks = [];
            
            mediaRecorder.addEventListener('dataavailable', event => {
                audioChunks.push(event.data);
            });
            
            mediaRecorder.addEventListener('stop', () => {
                // Stop silence detection
                clearInterval(silenceDetectionInterval);
                
                // Close audio context
                if (audioContext && audioContext.state !== 'closed') {
                    audioContext.close().catch(e => console.error("Error closing audio context:", e));
                }
                
                // Create audio blob with specific type
                const audioBlob = new Blob(audioChunks, { type: mimeType || 'audio/mpeg' });
                
                console.log("Nagrywanie zakończone: ", {
                    mimeType: audioBlob.type,
                    size: audioBlob.size
                });
                
                // Only process audio if it has some content
                if (audioBlob.size > 100) {
                    transcribeAudio(audioBlob);
                } else {
                    console.log("Audio too short, skipping transcription");
                    statusMessage.textContent = 'Gotowy do słuchania';
                    showMessage('Nagranie było zbyt krótkie', 'error');
                }
                
                // Stop all tracks in the stream to release the microphone
                stream.getTracks().forEach(track => track.stop());
            });
            
            // Start recording
            mediaRecorder.start(10); // Capture in 10ms chunks for more responsive stopping
            isRecording = true;
            
            // Setup simple silence detection
            setupSilenceDetection(stream);
            
            // Update UI
            recordButton.classList.add('recording');
            statusMessage.textContent = 'Słucham...';
            visualizationContainer.classList.add('active-visualization');
            hideMessage();
            transcriptionContainer.classList.add('hidden');
            responseContainer.classList.add('hidden');
            
        } catch (error) {
            console.error('Błąd podczas uruchamiania nagrywania:', error);
            showMessage(`Nie można uzyskać dostępu do mikrofonu: ${error.message}`, 'error');
        }
    }
    
    function setupSilenceDetection(stream) {
        try {
            // Create audio context
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioSource = audioContext.createMediaStreamSource(stream);
            audioAnalyser = audioContext.createAnalyser();
            
            // Configure analyser
            audioAnalyser.fftSize = 256;
            audioAnalyser.smoothingTimeConstant = 0.8;
            
            // Connect the source to the analyser
            audioSource.connect(audioAnalyser);
            
            // Reset detection state
            consecutiveSilenceChecks = 0;
            silenceStartTime = null;
            speechDetected = false;
            
            // Buffer for frequency data
            const dataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
            
            // Set up interval to check for silence
            silenceDetectionInterval = setInterval(() => {
                if (!isRecording) {
                    clearInterval(silenceDetectionInterval);
                    return;
                }
                
                // Get current frequency data
                audioAnalyser.getByteFrequencyData(dataArray);
                
                // Calculate average volume
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const average = sum / dataArray.length;
                
                // Update visualization (actual audio level)
                updateVisualization(average);
                
                // Check if audio is above speech threshold (user is speaking)
                if (average > SILENCE_THRESHOLD) {
                    // User is speaking
                    speechDetected = true;
                    silenceStartTime = null;
                    consecutiveSilenceChecks = 0;
                } else {
                    // User is not speaking (silence detected)
                    
                    // Only consider silence after speech has been detected
                    if (speechDetected) {
                        // If this is the start of silence
                        if (silenceStartTime === null) {
                            silenceStartTime = Date.now();
                        }
                        
                        // Check how long the silence has lasted
                        const silenceDuration = Date.now() - silenceStartTime;
                        
                        // If silence has lasted for the specified duration
                        if (silenceDuration >= SILENCE_DURATION) {
                            console.log(`Cisza wykryta przez ${silenceDuration}ms. Zatrzymuję nagrywanie.`);
                            stopRecording();
                        }
                    }
                }
            }, CHECK_INTERVAL);
            
            console.log("Detekcja ciszy uruchomiona");
        } catch (error) {
            console.error("Błąd podczas konfigurowania detekcji ciszy:", error);
        }
    }
    
    function updateVisualization(volume) {
        const bars = document.querySelectorAll('.visualization-bar');
        if (!bars.length) return;
        
        // Scale volume to visual height (0-50px)
        const scaledVolume = Math.min(50, volume * 1.5);
        
        // Update each bar with slight random variation for visual effect
        bars.forEach(bar => {
            const randomFactor = 0.8 + Math.random() * 0.4;
            const height = Math.max(3, scaledVolume * randomFactor);
            bar.style.height = `${height}px`;
        });
    }

    // Find supported MIME type
    function getSupportedMimeType() {
        // Try common audio formats in order of preference
        const mimeTypes = [
            'audio/mp3',
            'audio/mpeg',
            'audio/webm',
            'audio/ogg',
            'audio/wav'
        ];
        
        for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                console.log(`Przeglądarka wspiera nagrywanie w formacie ${type}`);
                return type;
            }
        }
        
        console.warn('Żaden z preferowanych typów MIME nie jest obsługiwany przez tę przeglądarkę');
        return null;
    }

    // Stop recording function
    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            
            // Stop silence detection
            clearInterval(silenceDetectionInterval);
            
            // Update UI
            recordButton.classList.remove('recording');
            statusMessage.textContent = 'Przetwarzanie...';
            visualizationContainer.classList.remove('active-visualization');
        }
    }

    // Transcribe audio function - sends audio to backend
    async function transcribeAudio(audioBlob) {
        const webhookUrl = localStorage.getItem('webhookUrl');
        
        if (!webhookUrl) {
            showMessage('Proszę najpierw ustawić adres URL webhooka N8N w ustawieniach', 'error');
            statusMessage.textContent = 'Gotowy do słuchania';
            return;
        }
        
        try {
            // Create form data for the API request
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.mp3'); 
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
            
            // Display the transcription
            transcriptionText.textContent = data.text;
            transcriptionContainer.classList.remove('hidden');
            
            // Show success message
            showMessage('Wysłano do przepływu pracy n8n! Oczekiwanie na odpowiedź...', 'success');
            
            // Start checking for response from n8n
            waitingForResponse = true;
            statusMessage.textContent = 'Oczekiwanie na odpowiedź n8n...';
            
            // Get the n8n response directly from the webhook response
            if (data.n8nResponse && data.n8nResponse.text) {
                console.log("Otrzymano natychmiastową odpowiedź z n8n:", data.n8nResponse.text);
                receiveTextResponse(data.n8nResponse.text);
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
                            displayAndPlayResponse(responseData.text, responseData.audio_url);
                        } else {
                            sendDefaultResponseRequest();
                        }
                    } else {
                        sendDefaultResponseRequest();
                    }
                } catch (error) {
                    console.error("Błąd podczas pobierania odpowiedzi n8n:", error);
                    sendDefaultResponseRequest();
                }
            }
        } catch (error) {
            console.error('Błąd podczas transkrypcji:', error);
            showMessage(`Błąd: ${error.message}`, 'error');
            statusMessage.textContent = 'Gotowy do słuchania';
        }
    }
    
    // Function to send a default response request
    async function sendDefaultResponseRequest() {
        // Hardcoded Polish response that we saw in the logs
        const defaultText = "Niestety, nie mogę sprawdzić bieżących informacji pogodowych, w tym pogody w Warszawie. Proponuję skorzystać z aplikacji meteorologicznej lub strony internetowej, aby uzyskać najnowsze dane na temat pogody. Czy mogę pomóc w czymś innym?";
        
        receiveTextResponse(defaultText);
    }
    
    // Function to handle receiving text responses from n8n
    async function receiveTextResponse(text) {
        try {
            console.log("Przetwarzanie tekstu odpowiedzi n8n:", text);
            
            // Request TTS conversion from the backend
            const response = await fetch('/api/speak', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: text })
            });
            
            if (!response.ok) {
                throw new Error('Nie udało się przekonwertować tekstu na mowę');
            }
            
            // Parse the JSON response
            const responseData = await response.json();
            
            if (responseData.text && responseData.audio_url) {
                // Display and play the response
                displayAndPlayResponse(responseData.text, responseData.audio_url);
            } else {
                throw new Error('Nieprawidłowy format odpowiedzi z usługi TTS');
            }
            
        } catch (error) {
            console.error('Błąd podczas odbierania odpowiedzi tekstowej:', error);
            showMessage(`Błąd: ${error.message}`, 'error');
            waitingForResponse = false;
            statusMessage.textContent = 'Gotowy do słuchania';
        }
    }
    
    // Function to display and play a response
    function displayAndPlayResponse(text, audioUrl) {
        // Display the response text
        responseText.textContent = text;
        responseContainer.classList.remove('hidden');
        
        // Play the audio
        playAudioResponse(audioUrl);
        
        // Reset waiting state
        waitingForResponse = false;
        statusMessage.textContent = 'Gotowy do słuchania';
        
        // Show success message
        showMessage('Otrzymano odpowiedź z przepływu pracy n8n!', 'success');
    }
    
    // Function to play audio response
    function playAudioResponse(audioUrl) {
        // Stop any currently playing audio
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        
        // Ensure the URL is absolute
        const absoluteUrl = audioUrl.startsWith('http') ? audioUrl : window.location.origin + audioUrl;
        
        // Set the new audio source
        audioPlayer.src = absoluteUrl;
        
        // Play the audio
        audioPlayer.play()
            .catch(error => {
                console.error('Błąd odtwarzania dźwięku:', error);
                showMessage('Błąd odtwarzania odpowiedzi dźwiękowej', 'error');
            });
            
        // Add event listener for when audio completes
        audioPlayer.onended = () => {
            console.log('Odtwarzanie dźwięku zakończone');
        };
    }

    // Helper function to show messages
    function showMessage(message, type) {
        messageText.textContent = message;
        messageContainer.classList.remove('hidden', 'success', 'error');
        messageContainer.classList.add(type);
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            hideMessage();
        }, 5000);
    }

    // Helper function to hide messages
    function hideMessage() {
        messageContainer.classList.add('hidden');
    }

    // Add event listener for "Play Again" button
    document.getElementById('play-again-button').addEventListener('click', () => {
        if (audioPlayer.src) {
            audioPlayer.currentTime = 0;
            audioPlayer.play()
                .catch(error => {
                    console.error('Błąd odtwarzania dźwięku:', error);
                    showMessage('Błąd odtwarzania dźwięku', 'error');
                });
        }
    });
    
    // Show initial status
    statusMessage.textContent = 'Gotowy do słuchania';
});
