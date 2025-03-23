// Globalne deklaracje funkcji, aby były dostępne poza EventListener
let recordButton;
let statusMessage;
let visualizationContainer;
let transcriptionContainer;
let transcriptionText;
let messageContainer;
let messageText;
let webhookUrlInput;
let saveSettingsButton;
let responseContainer;
let responseText;
let conversationContainer;
let audioPlayer;
let isListening = false;
let isRecording = false;
let isProcessing = false;
let mediaRecorder = null;
let audioChunks = [];
let recordingId = 0;
let audioContext;
let audioAnalyser;
let audioSource;
let microphoneStream;
let silenceDetectionInterval;
let activeRequests = 0;

// Globalna definicja funkcji, by mogła być wywołana z zewnątrz
window.toggleContinuousListening = async function() {
    if (!recordButton) {
        console.error("Element recordButton nie został jeszcze zainicjalizowany");
        throw new Error("Nie można uruchomić nasłuchiwania");
    }
    
    if (isListening) {
        // Stop listening
        stopListening();
        recordButton.classList.remove('recording');
        recordButton.title = "Rozpocznij ciągłe słuchanie";
        statusMessage.textContent = 'Gotowy do słuchania';
    } else {
        // Start listening
        try {
            await startListening();
            recordButton.classList.add('recording');
            recordButton.title = "Zatrzymaj ciągłe słuchanie";
            statusMessage.textContent = 'Ciągłe słuchanie aktywne...';
            showMessage('Ciągłe słuchanie aktywne. Zacznij mówić, aby wysłać zapytanie.', 'success');
        } catch (error) {
            console.error('Błąd podczas uruchamiania słuchania:', error);
            showMessage(`Nie można uzyskać dostępu do mikrofonu: ${error.message}`, 'error');
            throw error;
        }
    }
};

// Funkcja do odtwarzania powitania
window.playGreeting = async function(greetingText = "Cześć. jestem agentem depilacja.pl, jak mogę Ci pomóc?") {
    console.log("Rozpoczynam odtwarzanie powitania...");
    
    try {
        console.log(`Wysyłam żądanie do API TTS z tekstem: ${greetingText}`);
        const response = await fetch('/api/speak', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: greetingText })
        });
        
        if (!response.ok) {
            throw new Error('Nie udało się przekonwertować tekstu na mowę');
        }
        
        const responseData = await response.json();
        console.log("Otrzymano odpowiedź TTS:");
        console.log(responseData);
        
        // Upewnij się, że audioPlayer jest zainicjalizowany
        if (!audioPlayer) {
            audioPlayer = new Audio();
        }
        
        const audioUrl = responseData.audio_url.startsWith('http') 
            ? responseData.audio_url 
            : window.location.origin + responseData.audio_url;
        
        console.log(`URL audio powitania: ${audioUrl}`);
        
        audioPlayer.src = audioUrl;
        console.log("Rozpoczynam odtwarzanie audio...");
        
        // Użyj Promise, aby poczekać na zakończenie odtwarzania
        await new Promise((resolve, reject) => {
            audioPlayer.onended = () => {
                console.log("Odtwarzanie powitania zakończone");
                resolve();
            };
            
            audioPlayer.onerror = (e) => {
                console.error("Błąd odtwarzania powitania:", e);
                reject(new Error("Błąd odtwarzania"));
            };
            
            audioPlayer.play().catch(err => {
                console.error("Błąd podczas rozpoczęcia odtwarzania:", err);
                reject(err);
            });
        });
        
        console.log("Funkcja playGreeting zakończona pomyślnie");
        return true;
    } catch (error) {
        console.error("Błąd w funkcji playGreeting:", error);
        return false;
    }
};

// Funkcja do pokazywania wiadomości, dostępna globalnie
window.showMessage = function(message, type) {
    if (!messageText || !messageContainer) {
        console.warn("Elementy komunikatów nie są jeszcze dostępne");
        return;
    }
    
    messageText.textContent = message;
    messageContainer.classList.remove('hidden', 'success', 'error');
    messageContainer.classList.add(type);
    
    // Auto-ukryj po 5 sekundach
    setTimeout(() => {
        hideMessage();
    }, 5000);
};

// Funkcja do ukrywania wiadomości
function hideMessage() {
    if (messageContainer) {
        messageContainer.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Inicjalizacja elementów DOM
    recordButton = document.getElementById('record-button');
    statusMessage = document.getElementById('status-message');
    visualizationContainer = document.getElementById('visualization-container');
    transcriptionContainer = document.getElementById('transcription-container');
    transcriptionText = document.getElementById('transcription-text');
    messageContainer = document.getElementById('message-container');
    messageText = document.getElementById('message-text');
    webhookUrlInput = document.getElementById('webhook-url');
    saveSettingsButton = document.getElementById('save-settings');
    responseContainer = document.getElementById('response-container');
    responseText = document.getElementById('response-text');
    conversationContainer = document.getElementById('conversation-container');
    
    // Inicjalizacja odtwarzacza audio
    audioPlayer = new Audio();
    
    // Wczytaj zapisany URL webhooka z localStorage
    webhookUrlInput.value = localStorage.getItem('webhookUrl') || '';

    // Zapisz URL webhooka do localStorage
    saveSettingsButton.addEventListener('click', () => {
        const webhookUrl = webhookUrlInput.value.trim();
        if (webhookUrl) {
            localStorage.setItem('webhookUrl', webhookUrl);
            showMessage('Ustawienia zapisane pomyślnie!', 'success');
        } else {
            showMessage('Proszę wprowadzić poprawny adres URL webhooka', 'error');
        }
    });

    // Zmienne dla wykrywania ciszy
    const SILENCE_THRESHOLD = 15; // Próg poniżej którego uznajemy za ciszę
    const SILENCE_DURATION = 1500; // 1.5 sekundy ciszy, aby zakończyć nagrywanie
    const CHECK_INTERVAL = 100;   // Sprawdzaj co 100ms
    let silenceStartTime = null;
    let speechDetected = false;
    
    // Licznik dla wpisów w konwersacji
    let conversationEntryCount = 0;
    const MAX_CONVERSATION_ENTRIES = 10; // Maksymalna liczba wpisów konwersacji do wyświetlenia

    // Sprawdź, czy przeglądarka obsługuje wymagane API
    if (!navigator.mediaDevices || !window.MediaRecorder) {
        statusMessage.textContent = 'Twoja przeglądarka nie obsługuje nagrywania dźwięku.';
        recordButton.disabled = true;
        return;
    }

    // Obsługa kliknięcia przycisku - uruchom/zatrzymaj ciągłe słuchanie
    recordButton.addEventListener('click', () => window.toggleContinuousListening());
    
    // Rozpocznij ciągłe słuchanie
    async function startListening() {
        // Get microphone stream
        microphoneStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                channelCount: 1,
                sampleRate: 16000
            } 
        });
        
        // Setup audio context and analyzer
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
        
        // Setup the media recorder (but don't start it yet)
        const mimeType = getSupportedMimeType();
        const options = mimeType ? { mimeType } : {};
        mediaRecorder = new MediaRecorder(microphoneStream, options);
        
        // Start silence detection loop
        startSilenceDetection();
        
        // Start visualization
        visualizationContainer.classList.add('active-visualization');
        
        console.log("Continuous listening mode activated");
    }
    
    // Zatrzymaj ciągłe słuchanie
    function stopListening() {
        // Stop silence detection
        clearInterval(silenceDetectionInterval);
        
        // Stop any active recording
        if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            isRecording = false;
        }
        
        // Release microphone
        if (microphoneStream) {
            microphoneStream.getTracks().forEach(track => track.stop());
        }
        
        // Close audio context
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close().catch(e => console.error("Error closing audio context:", e));
        }
        
        // Update visualization
        visualizationContainer.classList.remove('active-visualization');
        
        // Reset flags
        isListening = false;
        isRecording = false;
        
        console.log("Continuous listening mode deactivated");
    }
    
    // Funkcja do zatrzymywania odtwarzania audio
    function stopAudioPlayback() {
        if (audioPlayer && !audioPlayer.paused) {
            console.log('Przerwanie odtwarzania - wykryto mowę użytkownika');
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
            
            // Opcjonalnie: pokaż krótki komunikat
            showMessage('Przerwano odtwarzanie, słucham...', 'success');
            
            // Znajdź i zaktualizuj wszystkie przyciski odtwarzania
            const playButtons = document.querySelectorAll('.play-button');
            playButtons.forEach(button => {
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-play"></i> Odtwórz';
            });
        }
    }
    
    // Uruchom wykrywanie ciszy
    function startSilenceDetection() {
        // Buffer for frequency data
        const dataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
        
        // Set up interval to check for speech and silence
        silenceDetectionInterval = setInterval(() => {
            if (!isListening) {
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
            
            // User is speaking
            if (average > SILENCE_THRESHOLD) {
                // Jeśli odtwarzane jest audio, przerwij odtwarzanie
                if (audioPlayer && !audioPlayer.paused) {
                    stopAudioPlayback();
                }
                
                // If not already recording, start a new recording
                if (!isRecording) {
                    startNewRecording();
                }
                
                // Reset silence timer
                silenceStartTime = null;
                speechDetected = true;
            } 
            // User is silent
            else {
                // Only check for end of speech if we're recording and speech was detected
                if (isRecording && speechDetected) {
                    // If this is the start of silence
                    if (silenceStartTime === null) {
                        silenceStartTime = Date.now();
                    }
                    
                    // Check if silence has lasted long enough
                    const silenceDuration = Date.now() - silenceStartTime;
                    if (silenceDuration >= SILENCE_DURATION) {
                        console.log(`Cisza wykryta przez ${silenceDuration}ms. Kończę nagrywanie.`);
                        stopCurrentRecording();
                        
                        // Reset for next recording
                        speechDetected = false;
                        silenceStartTime = null;
                    }
                }
            }
        }, CHECK_INTERVAL);
    }
    
    // Rozpocznij nowe nagrywanie
    function startNewRecording() {
        // Reset recording state
        audioChunks = [];
        recordingId++;
        const currentRecordingId = recordingId;
        
        // Setup mediaRecorder event handlers
        mediaRecorder.onstart = () => {
            console.log(`Nagrywanie #${currentRecordingId} rozpoczęte`);
            isRecording = true;
        };
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
            console.log(`Nagrywanie #${currentRecordingId} zakończone`);
            isRecording = false;
            
            // Create audio blob with specific type
            const mimeType = getSupportedMimeType();
            const audioBlob = new Blob(audioChunks, { type: mimeType || 'audio/mpeg' });
            
            console.log(`Nagranie #${currentRecordingId}: ${audioBlob.size} bajtów`);
            
            // Only process if it's not too small
            if (audioBlob.size > 1000) {
                processRecording(audioBlob, currentRecordingId);
            } else {
                console.log(`Nagranie #${currentRecordingId} zbyt krótkie, pomijam`);
            }
        };
        
        // Start recording in small chunks for more responsiveness
        mediaRecorder.start(100);
    }
    
    // Zatrzymaj aktualne nagrywanie
    function stopCurrentRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    }
    
    // Przetwórz nagranie audio
    async function processRecording(audioBlob, recordingId) {
        const webhookUrl = localStorage.getItem('webhookUrl');
        
        if (!webhookUrl) {
            showMessage('Proszę najpierw ustawić adres URL webhooka N8N w ustawieniach', 'error');
            return;
        }
        
        // Create a new conversation entry for this recording
        const entryId = `entry-${recordingId}`;
        addConversationEntry(entryId);
        
        try {
            activeRequests++;
            updateStatus();
            
            // Create form data for the API request
            const formData = new FormData();
            formData.append('audio', audioBlob, `recording-${recordingId}.mp3`);
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
    
    // Obsługa odpowiedzi n8n
    async function handleN8nResponse(text, entryId, audioUrl = null) {
        try {
            if (!audioUrl) {
                // Convert text to speech
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
                
                const responseData = await response.json();
                audioUrl = responseData.audio_url;
            }
            
            // Update conversation entry with response
            updateConversationEntryWithResponse(entryId, text, audioUrl);
            
            // Play audio
            playAudioResponse(audioUrl);
            
        } catch (error) {
            console.error('Błąd podczas obsługi odpowiedzi:', error);
            updateConversationEntryWithError(entryId, error.message);
        }
    }
    
    // Obsługa domyślnej odpowiedzi, gdy n8n nie odpowiada
    function handleDefaultResponse(entryId) {
        const defaultText = "Niestety, nie mogę sprawdzić bieżących informacji. Czy mogę pomóc w czymś innym?";
        handleN8nResponse(defaultText, entryId);
    }
    
    // Dodaj nowy wpis konwersacji
    function addConversationEntry(entryId) {
        // Check if we have too many entries and remove the oldest
        const entries = conversationContainer.querySelectorAll('.conversation-entry');
        if (entries.length >= MAX_CONVERSATION_ENTRIES) {
            conversationContainer.removeChild(entries[0]);
        }
        
        // Create new entry
        const entryHtml = `
            <div id="${entryId}" class="conversation-entry">
                <div class="user-message">
                    <div class="message-status">Przetwarzanie...</div>
                    <div class="message-content loading"></div>
                </div>
                <div class="assistant-message hidden">
                    <div class="message-content"></div>
                    <div class="audio-controls hidden">
                        <button class="play-button btn-icon">
                            <i class="fas fa-play"></i> Odtwórz
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Add to container - at the bottom
        conversationContainer.insertAdjacentHTML('beforeend', entryHtml);
        conversationContainer.scrollTop = conversationContainer.scrollHeight;
        
        // Ensure the container is visible
        conversationContainer.classList.remove('hidden');
    }
    
    // Aktualizuj wpis konwersacji o transkrypcję
    function updateConversationEntryWithTranscription(entryId, text) {
        const entry = document.getElementById(entryId);
        if (!entry) return;
        
        const messageStatus = entry.querySelector('.user-message .message-status');
        const messageContent = entry.querySelector('.user-message .message-content');
        
        messageStatus.textContent = 'Ty:';
        messageContent.textContent = text;
        messageContent.classList.remove('loading');
    }
    
    // Aktualizuj wpis konwersacji o odpowiedź
    function updateConversationEntryWithResponse(entryId, text, audioUrl) {
        const entry = document.getElementById(entryId);
        if (!entry) return;
        
        const assistantMessage = entry.querySelector('.assistant-message');
        const messageContent = assistantMessage.querySelector('.message-content');
        const audioControls = assistantMessage.querySelector('.audio-controls');
        const playButton = audioControls.querySelector('.play-button');
        
        messageContent.textContent = text;
        assistantMessage.classList.remove('hidden');
        audioControls.classList.remove('hidden');
        
        // Set up play button
        playButton.addEventListener('click', () => {
            playAudioResponse(audioUrl, playButton);
        });
        
        // Scroll to show the new content
        conversationContainer.scrollTop = conversationContainer.scrollHeight;
    }
    
    // Aktualizuj wpis konwersacji o błąd
    function updateConversationEntryWithError(entryId, errorText) {
        const entry = document.getElementById(entryId);
        if (!entry) return;
        
        const messageStatus = entry.querySelector('.user-message .message-status');
        const messageContent = entry.querySelector('.user-message .message-content');
        
        messageStatus.textContent = 'Błąd:';
        messageStatus.style.color = 'red';
        messageContent.textContent = errorText;
        messageContent.classList.remove('loading');
    }
    
    // Aktualizuj komunikat statusu
    function updateStatus() {
        if (!isListening) {
            statusMessage.textContent = 'Gotowy do słuchania';
            return;
        }
        
        if (activeRequests > 0) {
            statusMessage.textContent = `Ciągłe słuchanie aktywne... (${activeRequests} ${activeRequests === 1 ? 'zapytanie' : 'zapytania'} w toku)`;
        } else {
            statusMessage.textContent = 'Ciągłe słuchanie aktywne...';
        }
    }
    
    // Aktualizuj wizualizację na podstawie faktycznego poziomu dźwięku
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

    // Znajdź obsługiwany typ MIME
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
    
    // Funkcja do odtwarzania odpowiedzi audio
    function playAudioResponse(audioUrl, buttonElement = null) {
        // Stop any currently playing audio
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        
        // Ensure the URL is absolute
        const absoluteUrl = audioUrl.startsWith('http') ? audioUrl : window.location.origin + audioUrl;
        
        // Set the new audio source
        audioPlayer.src = absoluteUrl;
        
        // Update button state if provided
        if (buttonElement) {
            buttonElement.disabled = true;
            buttonElement.innerHTML = '<i class="fas fa-volume-up"></i> Odtwarzanie...';
            
            // Reset button when playback ends
            audioPlayer.onended = () => {
                console.log('Odtwarzanie dźwięku zakończone');
                buttonElement.disabled = false;
                buttonElement.innerHTML = '<i class="fas fa-play"></i> Odtwórz';
            };
        }
        
        // Play the audio
        audioPlayer.play()
            .catch(error => {
                console.error('Błąd odtwarzania dźwięku:', error);
                showMessage('Błąd odtwarzania odpowiedzi dźwiękowej', 'error');
                
                // Reset button on error
                if (buttonElement) {
                    buttonElement.disabled = false;
                    buttonElement.innerHTML = '<i class="fas fa-play"></i> Odtwórz';
                }
            });
    }

    // Dodaj nasłuchiwacz do przycisku "Odtwórz ponownie"
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
    
    // Pokaż początkowy status
    statusMessage.textContent = 'Gotowy do słuchania';
});
