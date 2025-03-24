// Globalne zmienne
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
let processingBeepPlayer = null; // Nowa zmienna dla odtwarzacza dźwięku przetwarzania
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

// Ustawienia dla wykrywania ciszy
const SILENCE_THRESHOLD = 15; // Próg poniżej którego uznajemy za ciszę
const SILENCE_DURATION = 1500; // 1.5 sekundy ciszy, aby zakończyć nagrywanie
const CHECK_INTERVAL = 100;   // Sprawdzaj co 100ms
let silenceStartTime = null;
let speechDetected = false;

// Licznik dla wpisów w konwersacji
let conversationEntryCount = 0;
const MAX_CONVERSATION_ENTRIES = 10; // Maksymalna liczba wpisów konwersacji do wyświetlenia

// ====== GLOBALNE FUNKCJE ======

// Funkcja do znalezienia obsługiwanego typu MIME, zoptymalizowana dla API OpenAI
window.getSupportedMimeType = function() {
    // Formaty w kolejności preferencji dla API OpenAI
    const preferredMimeTypes = [
        'audio/wav',       // Format WAV jest bardzo dobrze obsługiwany przez API OpenAI
        'audio/wave',
        'audio/x-wav',
        'audio/mp3',       // MP3 również jest dobrze obsługiwany
        'audio/mpeg',
        'audio/webm',      // WebM może działać, ale nie jest najlepszym wyborem
        'audio/ogg',       // OGG może być problematyczny
        'audio/m4a',
        'audio/mp4'
    ];
    
    // Sprawdź, które formaty są obsługiwane przez przeglądarkę
    for (const type of preferredMimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
            console.log(`Wybrano format nagrywania: ${type} (preferowany przez OpenAI)`);
            return type;
        }
    }
    
    // Jeśli żaden z preferowanych typów nie jest obsługiwany, spróbuj inne z określonymi kodekami
    const fallbackMimeTypes = [
        'audio/webm;codecs=pcm',
        'audio/webm;codecs=opus', 
        'audio/ogg;codecs=opus'
    ];
    
    for (const type of fallbackMimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
            console.log(`Wybrano format nagrywania: ${type} (zapasowy)`);
            return type;
        }
    }
    
    // W ostateczności pozwól przeglądarce wybrać domyślny format
    console.warn('Żaden z preferowanych typów MIME nie jest obsługiwany przez tę przeglądarkę');
    return '';
};

// Funkcja do rozpoczynania nasłuchiwania
window.startListening = async function() {
    try {
        // Get microphone stream
        microphoneStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                channelCount: 1,
                sampleRate: 44100
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
        
        // Ważne: Nie tworzymy mediaRecorder od razu - zrobimy to przy rozpoczęciu nagrywania
        mediaRecorder = null;
        
        // Start silence detection loop
        window.startSilenceDetection();
        
        // Start visualization
        visualizationContainer.classList.add('active-visualization');
        
        console.log("Continuous listening mode activated");
    } catch (error) {
        console.error("Error starting listening:", error);
        throw error;
    }
};

// Funkcja do zatrzymywania nasłuchiwania
window.stopListening = function() {
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
    mediaRecorder = null;
    
    console.log("Continuous listening mode deactivated");
};

// Funkcja do przełączania nasłuchiwania
window.toggleContinuousListening = async function() {
    if (!recordButton) {
        console.error("Element recordButton nie został jeszcze zainicjalizowany");
        throw new Error("Nie można uruchomić nasłuchiwania");
    }
    
    if (isListening) {
        // Stop listening
        window.stopListening();
        recordButton.classList.remove('recording');
        recordButton.title = "Rozpocznij ciągłe słuchanie";
        statusMessage.textContent = 'Gotowy do słuchania';
    } else {
        // Start listening
        try {
            await window.startListening();
            recordButton.classList.add('recording');
            recordButton.title = "Zatrzymaj ciągłe słuchanie";
            statusMessage.textContent = 'Ciągłe słuchanie aktywne...';
            window.showMessage('Ciągłe słuchanie aktywne. Zacznij mówić, aby wysłać zapytanie.', 'success');
        } catch (error) {
            console.error('Błąd podczas uruchamiania słuchania:', error);
            window.showMessage(`Nie można uzyskać dostępu do mikrofonu: ${error.message}`, 'error');
            throw error;
        }
    }
};

// Funkcja do odtwarzania powitania bez HEAD request
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
            throw new Error(`Nie udało się przekonwertować tekstu na mowę (status ${response.status})`);
        }
        
        const responseData = await response.json();
        console.log("Otrzymano odpowiedź TTS:");
        console.log(responseData);
        
        if (!responseData.audio_url) {
            throw new Error("Brak URL audio w odpowiedzi");
        }
        
        // Upewnij się, że audioPlayer jest zainicjalizowany
        if (!audioPlayer) {
            audioPlayer = new Audio();
        }
        
        // Przygotuj URL audio
        const audioUrl = responseData.audio_url.startsWith('http') 
            ? responseData.audio_url 
            : window.location.origin + responseData.audio_url;
        
        console.log(`URL audio powitania: ${audioUrl}`);
        
        // Ustaw źródło audio bezpośrednio
        audioPlayer.src = audioUrl;
        
        // Obsługa błędów
        audioPlayer.onerror = (e) => {
            console.error("Błąd odtwarzania powitania:", e);
            throw new Error("Błąd odtwarzania");
        };
        
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
            
            // Rozpocznij odtwarzanie z obsługą błędów
            audioPlayer.play().catch(err => {
                console.error("Błąd podczas rozpoczęcia odtwarzania:", err);
                reject(err);
            });
        });
        
        console.log("Funkcja playGreeting zakończona pomyślnie");
        return true;
    } catch (error) {
        console.error("Błąd w funkcji playGreeting:", error);
        // Spróbuj kontynuować bez odtwarzania audio
        window.showMessage(`Nie udało się odtworzyć powitania: ${error.message}`, 'error');
        return false;
    }
};

// Funkcja do odtwarzania dźwięku przetwarzania
window.playProcessingBeep = function() {
    try {
        // Utwórz odtwarzacz audio, jeśli potrzeba
        if (!processingBeepPlayer) {
            processingBeepPlayer = new Audio();
        }
        
        // Ustaw źródło na dźwięk sygnalizacyjny
        processingBeepPlayer.src = 'processing-beep.mp3';
        
        // Skonfiguruj aby odtwarzać raz
        processingBeepPlayer.loop = false;
        
        // Odtwórz dźwięk
        processingBeepPlayer.play().catch(error => {
            console.error('Błąd odtwarzania sygnału przetwarzania:', error);
        });
        
        console.log('Odtwarzanie sygnału przetwarzania');
        return true;
    } catch (error) {
        console.error('Błąd w funkcji playProcessingBeep:', error);
        return false;
    }
};

// Funkcja do wykrywania ciszy
window.startSilenceDetection = function() {
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
        
        // Update visualization
        window.updateVisualization(average);
        
        // User is speaking
        if (average > SILENCE_THRESHOLD) {
            // Jeśli odtwarzane jest audio, przerwij odtwarzanie
            if (audioPlayer && !audioPlayer.paused) {
                window.stopAudioPlayback();
            }
            
            // If not already recording, start a new recording
            if (!isRecording) {
                window.startNewRecording();
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
                    window.stopCurrentRecording();
                    
                    // Reset for next recording
                    speechDetected = false;
                    silenceStartTime = null;
                }
            }
        }
    }, CHECK_INTERVAL);
};

// Funkcja do zatrzymywania odtwarzania audio
window.stopAudioPlayback = function() {
    if (audioPlayer && !audioPlayer.paused) {
        console.log('Przerwanie odtwarzania - wykryto mowę użytkownika');
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        
        // Opcjonalnie: pokaż krótki komunikat
        window.showMessage('Przerwano odtwarzanie, słucham...', 'success');
        
        // Znajdź i zaktualizuj wszystkie przyciski odtwarzania
        const playButtons = document.querySelectorAll('.play-button');
        playButtons.forEach(button => {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-play"></i> Odtwórz';
        });
    }
};

// Funkcja do rozpoczynania nowego nagrywania
window.startNewRecording = function() {
    // Reset recording state
    audioChunks = [];
    recordingId++;
    const currentRecordingId = recordingId;
    
    // Ustal format MIME dla nagrywania - próbuj najlepszych formatów dla OpenAI API
    const mimeType = window.getSupportedMimeType();
    const options = mimeType ? { mimeType } : {};
    
    // Jeśli nie mamy jeszcze MediaRecorder, utwórz go
    if (!mediaRecorder) {
        try {
            mediaRecorder = new MediaRecorder(microphoneStream, options);
            console.log(`Utworzono nowy MediaRecorder z formatem: ${mimeType || "domyślnym"}`);
        } catch (e) {
            console.error(`Błąd przy tworzeniu MediaRecorder: ${e.message}`);
            // Spróbuj utworzyć bez określania typu MIME
            mediaRecorder = new MediaRecorder(microphoneStream);
            console.log("Utworzono MediaRecorder z domyślnymi opcjami");
        }
    }
    
    // Setup mediaRecorder event handlers
    mediaRecorder.onstart = () => {
        console.log(`Nagrywanie #${currentRecordingId} rozpoczęte (format: ${mediaRecorder.mimeType || "domyślny"})`);
        isRecording = true;
    };
    
    mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
    };
    
    mediaRecorder.onstop = () => {
        console.log(`Nagrywanie #${currentRecordingId} zakończone`);
        isRecording = false;
        
        // Create audio blob with correct MIME type
        // WAŻNE: Użyj faktycznego typu MIME z MediaRecorder, nie próbuj go zmieniać
        const actualMimeType = mediaRecorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunks, { type: actualMimeType });
        
        console.log(`Nagranie #${currentRecordingId}: ${audioBlob.size} bajtów, typ: ${actualMimeType}`);
        
        // Dodaj prawidłowe rozszerzenie pliku na podstawie typu MIME
        let fileExtension = '.webm'; // domyślne
        if (actualMimeType.includes('mp3') || actualMimeType.includes('mpeg')) {
            fileExtension = '.mp3';
        } else if (actualMimeType.includes('wav') || actualMimeType.includes('wave')) {
            fileExtension = '.wav';
        } else if (actualMimeType.includes('ogg')) {
            fileExtension = '.ogg';
        } else if (actualMimeType.includes('m4a') || actualMimeType.includes('mp4')) {
            fileExtension = '.m4a';
        }
        
        // Only process if it's not too small
        if (audioBlob.size > 1000) {
            // Odtwórz sygnał przetwarzania przed rozpoczęciem
            window.playProcessingBeep();
            
            // Rozpocznij przetwarzanie po krótkim opóźnieniu, aby sygnał był słyszalny
            setTimeout(() => {
                window.processRecording(audioBlob, currentRecordingId, fileExtension);
            }, 500); // 500ms opóźnienia, aby dźwięk był słyszalny
        } else {
            console.log(`Nagranie #${currentRecordingId} zbyt krótkie, pomijam`);
        }
    };
    
    // Start recording in small chunks for more responsiveness
    mediaRecorder.start(100);
};

// Funkcja do zatrzymywania aktualnego nagrywania
window.stopCurrentRecording = function() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
};

// Funkcja do przetwarzania nagrania
window.processRecording = async function(audioBlob, recordingId, fileExtension = '.webm') {
    const webhookUrl = localStorage.getItem('webhookUrl');
    
    if (!webhookUrl) {
        window.showMessage('Proszę najpierw ustawić adres URL webhooka N8N w ustawieniach', 'error');
        return;
    }
    
    // Create a new conversation entry for this recording
    const entryId = `entry-${recordingId}`;
    window.addConversationEntry(entryId);
    
    try {
        activeRequests++;
        window.updateStatus();
        
        // Create form data for the API request
        const formData = new FormData();
        formData.append('audio', audioBlob, `recording-${recordingId}${fileExtension}`);
        formData.append('webhook_url', webhookUrl);
        
        console.log(`Wysyłanie nagrania ${recordingId} jako ${fileExtension}, typ MIME: ${audioBlob.type}`);
        
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
        window.updateConversationEntryWithTranscription(entryId, data.text);
        
        // Process the response from n8n
        if (data.n8nResponse && data.n8nResponse.text) {
            console.log(`Otrzymano natychmiastową odpowiedź dla nagrania #${recordingId}`);
            window.handleN8nResponse(data.n8nResponse.text, entryId);
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
                        window.handleN8nResponse(responseData.text, entryId, responseData.audio_url);
                    } else {
                        window.handleDefaultResponse(entryId);
                    }
                } else {
                    window.handleDefaultResponse(entryId);
                }
            } catch (error) {
                console.error(`Błąd podczas pobierania odpowiedzi dla nagrania #${recordingId}:`, error);
                window.handleDefaultResponse(entryId);
            }
        }
    } catch (error) {
        console.error(`Błąd podczas przetwarzania nagrania #${recordingId}:`, error);
        window.updateConversationEntryWithError(entryId, error.message);
    } finally {
        activeRequests--;
        window.updateStatus();
    }
};

// Funkcja do obsługi odpowiedzi z n8n
window.handleN8nResponse = async function(text, entryId, audioUrl = null) {
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
        window.updateConversationEntryWithResponse(entryId, text, audioUrl);
        
        // Play audio
        window.playAudioResponse(audioUrl);
        
    } catch (error) {
        console.error('Błąd podczas obsługi odpowiedzi:', error);
        window.updateConversationEntryWithError(entryId, error.message);
    }
};

// Funkcja do obsługi domyślnej odpowiedzi
window.handleDefaultResponse = function(entryId) {
    const defaultText = "Niestety, nie mogę sprawdzić bieżących informacji. Czy mogę pomóc w czymś innym?";
    window.handleN8nResponse(defaultText, entryId);
};

// Funkcja do dodawania nowego wpisu konwersacji
window.addConversationEntry = function(entryId) {
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
};

// Funkcja do aktualizacji wpisu konwersacji o transkrypcję
window.updateConversationEntryWithTranscription = function(entryId, text) {
    const entry = document.getElementById(entryId);
    if (!entry) return;
    
    const messageStatus = entry.querySelector('.user-message .message-status');
    const messageContent = entry.querySelector('.user-message .message-content');
    
    messageStatus.textContent = 'Ty:';
    messageContent.textContent = text;
    messageContent.classList.remove('loading');
};

// Funkcja do aktualizacji wpisu konwersacji o odpowiedź
window.updateConversationEntryWithResponse = function(entryId, text, audioUrl) {
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
        window.playAudioResponse(audioUrl, playButton);
    });
    
    // Scroll to show the new content
    conversationContainer.scrollTop = conversationContainer.scrollHeight;
};

// Funkcja do aktualizacji wpisu konwersacji o błąd
window.updateConversationEntryWithError = function(entryId, errorText) {
    const entry = document.getElementById(entryId);
    if (!entry) return;
    
    const messageStatus = entry.querySelector('.user-message .message-status');
    const messageContent = entry.querySelector('.user-message .message-content');
    
    messageStatus.textContent = 'Błąd:';
    messageStatus.style.color = 'red';
    messageContent.textContent = errorText;
    messageContent.classList.remove('loading');
};

// Funkcja do aktualizacji statusu
window.updateStatus = function() {
    if (!statusMessage) return;
    
    if (!isListening) {
        statusMessage.textContent = 'Gotowy do słuchania';
        return;
    }
    
    if (activeRequests > 0) {
        statusMessage.textContent = `Ciągłe słuchanie aktywne... (${activeRequests} ${activeRequests === 1 ? 'zapytanie' : 'zapytania'} w toku)`;
    } else {
        statusMessage.textContent = 'Ciągłe słuchanie aktywne...';
    }
};

// Funkcja do aktualizacji wizualizacji
window.updateVisualization = function(volume) {
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
};

// Funkcja do odtwarzania odpowiedzi audio bez HEAD request
window.playAudioResponse = function(audioUrl, buttonElement = null) {
    // Zatrzymaj aktualnie odtwarzany dźwięk
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    } else {
        audioPlayer = new Audio();
    }
    
    // Sprawdź, czy URL nie jest pusty
    if (!audioUrl) {
        console.error('Błąd odtwarzania: brak URL audio');
        window.showMessage('Błąd odtwarzania: brak URL audio', 'error');
        return;
    }
    
    // Upewnij się, że URL jest absolutny
    let absoluteUrl = audioUrl;
    if (!audioUrl.startsWith('http') && !audioUrl.startsWith('blob:')) {
        absoluteUrl = window.location.origin + audioUrl;
    }
    
    console.log(`Próba odtwarzania audio z URL: ${absoluteUrl}`);
    
    // Ustaw źródło audio bezpośrednio
    audioPlayer.src = absoluteUrl;
    
    // Dodaj odpowiednią obsługę błędów
    audioPlayer.onerror = function(e) {
        console.error('Błąd odtwarzania audio:', e);
        console.error('Kod błędu:', audioPlayer.error ? audioPlayer.error.code : 'nieznany');
        console.error('Wiadomość błędu:', audioPlayer.error ? audioPlayer.error.message : 'nieznana');
        
        window.showMessage(`Błąd odtwarzania audio: ${audioPlayer.error ? audioPlayer.error.message : 'nieznany błąd'}`, 'error');
        
        // Reset przycisku w przypadku błędu
        if (buttonElement) {
            buttonElement.disabled = false;
            buttonElement.innerHTML = '<i class="fas fa-play"></i> Odtwórz';
        }
    };
    
    // Obsługa zakończenia odtwarzania
    audioPlayer.onended = () => {
        console.log('Odtwarzanie dźwięku zakończone');
        
        // Reset przycisku po zakończeniu odtwarzania
        if (buttonElement) {
            buttonElement.disabled = false;
            buttonElement.innerHTML = '<i class="fas fa-play"></i> Odtwórz';
        }
    };
    
    // Aktualizacja stanu przycisku
    if (buttonElement) {
        buttonElement.disabled = true;
        buttonElement.innerHTML = '<i class="fas fa-volume-up"></i> Odtwarzanie...';
    }
    
    // Odtwórz audio z obsługą błędów
    audioPlayer.play()
        .catch(error => {
            console.error('Błąd odtwarzania dźwięku:', error);
            
            // Spróbuj alternatywną metodę dostępu do pliku audio
            if (audioUrl.includes('/api/audio/')) {
                console.log('Próbuję alternatywną metodę dostępu do audio...');
                
                // Spróbuj pobrać najnowszą odpowiedź audio
                fetch('/api/last-response-tts')
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('Nie można pobrać najnowszego audio');
                        }
                        return response.json();
                    })
                    .then(data => {
                        if (data.audio_url) {
                            console.log(`Odtwarzam najnowsze audio: ${data.audio_url}`);
                            audioPlayer.src = window.location.origin + data.audio_url;
                            return audioPlayer.play();
                        } else {
                            throw new Error('Brak URL audio w odpowiedzi');
                        }
                    })
                    .catch(finalError => {
                        console.error('Ostateczny błąd odtwarzania:', finalError);
                        window.showMessage('Nie można odtworzyć dźwięku', 'error');
                        
                        // Reset przycisku w przypadku błędu
                        if (buttonElement) {
                            buttonElement.disabled = false;
                            buttonElement.innerHTML = '<i class="fas fa-play"></i> Odtwórz';
                        }
                    });
            } else {
                window.showMessage('Błąd odtwarzania odpowiedzi dźwiękowej', 'error');
                
                // Reset przycisku w przypadku błędu
                if (buttonElement) {
                    buttonElement.disabled = false;
                    buttonElement.innerHTML = '<i class="fas fa-play"></i> Odtwórz';
                }
            }
        });
};

// Funkcja do pokazywania wiadomości
window.showMessage = function(message, type) {
    if (!messageText || !messageContainer) {
        console.warn("Elementy komunikatów nie są jeszcze dostępne");
        console.log("Komunikat:", message, "Typ:", type);
        return;
    }
    
    messageText.textContent = message;
    messageContainer.classList.remove('hidden', 'success', 'error');
    messageContainer.classList.add(type);
    
    // Auto-ukryj po 5 sekundach
    setTimeout(() => {
        window.hideMessage();
    }, 5000);
};

// Funkcja do ukrywania wiadomości
window.hideMessage = function() {
    if (messageContainer) {
        messageContainer.classList.add('hidden');
    }
};

// Inicjalizacja po załadowaniu DOM
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
            window.showMessage('Ustawienia zapisane pomyślnie!', 'success');
        } else {
            window.showMessage('Proszę wprowadzić poprawny adres URL webhooka', 'error');
        }
    });

    // Sprawdź, czy przeglądarka obsługuje wymagane API
    if (!navigator.mediaDevices || !window.MediaRecorder) {
        statusMessage.textContent = 'Twoja przeglądarka nie obsługuje nagrywania dźwięku.';
        recordButton.disabled = true;
        return;
    }

    // Obsługa kliknięcia przycisku - uruchom/zatrzymaj ciągłe słuchanie
    recordButton.addEventListener('click', () => window.toggleContinuousListening());

    // Dodaj nasłuchiwacz do przycisku "Odtwórz ponownie"
    const playAgainButton = document.getElementById('play-again-button');
    if (playAgainButton) {
        playAgainButton.addEventListener('click', () => {
            if (audioPlayer.src) {
                audioPlayer.currentTime = 0;
                audioPlayer.play()
                    .catch(error => {
                        console.error('Błąd odtwarzania dźwięku:', error);
                        window.showMessage('Błąd odtwarzania dźwięku', 'error');
                    });
            }
        });
    }
    
    // Pokaż początkowy status
    statusMessage.textContent = 'Gotowy do słuchania';
    
    console.log("DOM w pełni załadowany, aplikacja gotowa");
});
