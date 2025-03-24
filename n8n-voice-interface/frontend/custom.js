// Konfiguracja
const WEBHOOK_URL = localStorage.getItem('webhookUrl');
const SILENCE_THRESHOLD = -45; // dB
const SILENCE_DURATION = 1500; // ms
const AUTO_RESTART_RECORDING = true;
const GREETING_TEXT = "Cześć. jestem agentem depilacja.pl, jak mogę Ci pomóc?";

// Globalne zmienne
let mediaRecorder;
let audioContext;
let analyser;
let recordingNumber = 0;
let recordingStartTime;
let silenceStart = null;
let isListening = false;
let isFirstRun = true;
let audioQueue = [];
let isPlaying = false;

// Inicjalizacja po załadowaniu strony
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM w pełni załadowany, aplikacja gotowa');
    
    // Inicjalizacja Audio API (wymaga interakcji użytkownika w niektórych przeglądarkach)
    document.body.addEventListener('click', initAudioContext, { once: true });
    
    // Uruchom automatyczne powitanie i nasłuchiwanie po załadowaniu strony
    setTimeout(() => {
        console.log('Uruchamiam skrypt automatycznego powitania i nasłuchiwania');
        startAutoListening();
    }, 1000);
});

// Inicjalizacja Audio Context (wymagane do analizy dźwięku)
function initAudioContext() {
    if (audioContext) return;
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
    } catch (error) {
        console.error('Nie można utworzyć Audio Context:', error);
    }
}

// Funkcja rozpoczynająca automatyczne powitanie i nasłuchiwanie
async function startAutoListening() {
    if (isFirstRun) {
        console.log('Powitanie rozpoczęte');
        await playGreeting();
        isFirstRun = false;
    }
    
    console.log('Continuous listening mode activated');
    startContinuousListening();
}

// Funkcja odtwarzająca powitanie
async function playGreeting() {
    try {
        console.log('Rozpoczynam odtwarzanie powitania...');
        // Generuj TTS dla powitania
        console.log(`Wysyłam żądanie do API TTS z tekstem: ${GREETING_TEXT}`);
        
        const response = await fetch('/api/speak', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: GREETING_TEXT
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Otrzymano odpowiedź TTS:', data);
        
        // Odtwórz audio
        const baseUrl = window.location.origin;
        const audioUrl = `${baseUrl}${data.audio_url}`;
        console.log('URL audio powitania:', audioUrl);
        
        // Użyj funkcji odtwarzania audio z kolejkowania
        await playAudio(audioUrl);
        return true;
    } catch (error) {
        console.error('Błąd w funkcji playGreeting:', error);
        return false;
    }
}

// Funkcja odtwarzająca audio z URL
function playAudio(url) {
    return new Promise((resolve, reject) => {
        const audio = new Audio(url);
        
        audio.onended = () => {
            resolve();
        };
        
        audio.onerror = (error) => {
            console.error('Błąd odtwarzania audio:', error);
            reject(error);
        };
        
        // Preload audio before playing
        audio.oncanplaythrough = () => {
            audio.play().catch(err => {
                console.error('Błąd podczas odtwarzania audio:', err);
                reject(err);
            });
        };
        
        audio.load();
    });
}

// Funkcja dodająca audio do kolejki i odtwarzająca jedno po drugim
async function queueAudio(url) {
    return new Promise((resolve) => {
        // Dodaj do kolejki razem z callbackiem resolve
        audioQueue.push({ url, resolve });
        
        // Jeśli nic nie jest odtwarzane, rozpocznij odtwarzanie
        if (!isPlaying) {
            playNextInQueue();
        }
    });
}

// Odtwarzanie następnego elementu z kolejki
async function playNextInQueue() {
    if (audioQueue.length === 0) {
        isPlaying = false;
        return;
    }
    
    isPlaying = true;
    const { url, resolve } = audioQueue.shift();
    
    try {
        await playAudio(url);
        resolve(); // Rozwiąż obietnicę dla tego audio
    } catch (error) {
        console.error('Błąd odtwarzania kolejkowanego audio:', error);
    }
    
    // Odtwórz następny element w kolejce
    playNextInQueue();
}

// Rozpocznij ciągłe nasłuchiwanie
async function startContinuousListening() {
    if (isListening) return;
    
    try {
        // Zatrzymaj wszelkie aktywne nagrywania
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        
        // Wybierz preferowany format nagrywania
        const mimeType = getSupportedMimeType();
        console.log(`Wybrano format nagrywania: ${mimeType}`);
        
        // Utwórz nowy MediaRecorder
        mediaRecorder = new MediaRecorder(stream, { mimeType });
        console.log(`Utworzono nowy MediaRecorder z formatem: ${mediaRecorder.mimeType}`);
        
        // Podłącz analizator dźwięku (do wykrywania ciszy)
        if (audioContext && analyser) {
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
        }
        
        const audioChunks = [];
        recordingNumber++;
        const currentRecordingNumber = recordingNumber;
        
        // Obsługa zdarzenia dataavailable
        mediaRecorder.addEventListener('dataavailable', event => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        });
        
        // Obsługa zdarzenia stop
        mediaRecorder.addEventListener('stop', async () => {
            if (audioChunks.length === 0) {
                console.log(`Nagrywanie #${currentRecordingNumber} nie zawiera danych.`);
                if (AUTO_RESTART_RECORDING) startContinuousListening();
                return;
            }
            
            const duration = Date.now() - recordingStartTime;
            console.log(`Nagrywanie #${currentRecordingNumber} zakończone`);
            
            // Jeśli nagranie jest zbyt krótkie, zignoruj je
            if (duration < 1000) {
                console.log(`Nagrywanie #${currentRecordingNumber} jest zbyt krótkie (${duration}ms). Pomijam.`);
                if (AUTO_RESTART_RECORDING) startContinuousListening();
                return;
            }
            
            // Utwórz Blob z nagrania
            const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
            const fileName = `recording-${currentRecordingNumber}.webm`;
            
            try {
                await processRecording(audioBlob, fileName);
            } catch (error) {
                console.error('Błąd przetwarzania nagrania:', error);
            }
            
            // Zatrzymaj strumień audio
            stream.getTracks().forEach(track => track.stop());
            
            // Jeśli włączono automatyczne ponowne uruchomienie, rozpocznij nowe nagrywanie
            if (AUTO_RESTART_RECORDING) {
                startContinuousListening();
            }
        });
        
        // Rozpocznij nagrywanie
        mediaRecorder.start();
        recordingStartTime = Date.now();
        isListening = true;
        silenceStart = null;
        
        console.log(`Nagrywanie #${currentRecordingNumber} rozpoczęte (format: ${mediaRecorder.mimeType})`);
        
        // Rozpocznij monitorowanie poziomu dźwięku
        monitorAudioLevel();
        
    } catch (error) {
        console.error('Błąd podczas rozpoczynania nasłuchiwania:', error);
        isListening = false;
    }
}

// Funkcja monitorująca poziom dźwięku w celu wykrycia ciszy
function monitorAudioLevel() {
    if (!isListening || !mediaRecorder || !analyser) return;
    
    // Sprawdź, czy nagrywanie jest nadal aktywne
    if (mediaRecorder.state !== 'recording') {
        return;
    }
    
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);
    
    // Oblicz poziom dźwięku (RMS)
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
        const amplitude = (dataArray[i] - 128) / 128;
        sum += amplitude * amplitude;
    }
    const rms = Math.sqrt(sum / bufferLength);
    
    // Konwersja na dB
    const dbFS = 20 * Math.log10(rms);
    
    // Logika wykrywania ciszy
    if (dbFS < SILENCE_THRESHOLD) {
        if (silenceStart === null) {
            silenceStart = Date.now();
        } else if (Date.now() - silenceStart > SILENCE_DURATION) {
            // Cisza wykryta przez odpowiednio długi czas
            console.log(`Cisza wykryta przez ${SILENCE_DURATION}ms. Kończę nagrywanie.`);
            mediaRecorder.stop();
            isListening = false;
            return;
        }
    } else {
        // Reset licznika ciszy przy wykryciu dźwięku
        silenceStart = null;
    }
    
    // Kontynuuj monitorowanie
    requestAnimationFrame(monitorAudioLevel);
}

// Funkcja przetwarzająca nagranie i wysyłająca do API
async function processRecording(audioBlob, fileName) {
    // Sprawdź, czy mamy URL webhooka
    const webhookUrl = WEBHOOK_URL || localStorage.getItem('webhookUrl');
    
    if (!webhookUrl) {
        console.error('Brak skonfigurowanego URL webhooka. Przejdź do ustawień, aby go dodać.');
        showMessage('Brak URL webhooka. Przejdź do ustawień.', 'error');
        return;
    }
    
    try {
        // Utwórz FormData z nagraniem i URL-em webhooka
        const formData = new FormData();
        formData.append('audio', audioBlob, fileName);
        formData.append('webhook_url', webhookUrl);
        
        // Wyświetl komunikat o przetwarzaniu
        showMessage('Przetwarzanie nagrania...', 'info');
        
        // Wyślij nagranie do API
        const response = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Transkrypcja nie powiodła się');
        }
        
        const data = await response.json();
        
        // Wyświetl tekst transkrypcji
        showTranscription(data.text);
        
        // Wyświetl komunikat o sukcesie
        showMessage('Wysłano do n8n!', 'success');
        
        // Jeśli otrzymaliśmy odpowiedź, odtwórz ją
        if (data.response) {
            // Generuj TTS dla odpowiedzi
            const ttsResponse = await fetch('/api/speak', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: data.response
                })
            });
            
            if (ttsResponse.ok) {
                const ttsData = await ttsResponse.json();
                const baseUrl = window.location.origin;
                const audioUrl = `${baseUrl}${ttsData.audio_url}`;
                
                // Odtwórz odpowiedź
                await playAudio(audioUrl);
            }
        }
    } catch (error) {
        console.error('Błąd przetwarzania nagrania:', error);
        showMessage(`Błąd: ${error.message}`, 'error');
    }
}

// Funkcja wybierająca obsługiwany format MIME
function getSupportedMimeType() {
    const preferredTypes = [
        'audio/webm',          // Preferowany przez OpenAI
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/mpeg',
        'audio/wav'
    ];
    
    for (const type of preferredTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    
    return '';  // Pusty string pozwoli MediaRecorder wybrać domyślny format
}

// Funkcja wyświetlająca transkrypcję
function showTranscription(text) {
    const transcriptionContainer = document.getElementById('transcription-container');
    const transcriptionText = document.getElementById('transcription-text');
    
    if (transcriptionContainer && transcriptionText) {
        transcriptionText.textContent = text;
        transcriptionContainer.classList.remove('hidden');
    }
}

// Funkcja wyświetlająca komunikaty
function showMessage(message, type = 'info') {
    const messageContainer = document.getElementById('message-container');
    const messageText = document.getElementById('message-text');
    
    if (messageContainer && messageText) {
        messageText.textContent = message;
        messageContainer.classList.remove('hidden', 'success', 'error', 'info');
        messageContainer.classList.add(type);
        
        // Automatyczne ukrycie po 5 sekundach
        setTimeout(() => {
            messageContainer.classList.add('hidden');
        }, 5000);
    }
}
