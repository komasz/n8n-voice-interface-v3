document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const greetingTextInput = document.getElementById('greeting-text');
    const saveGreetingButton = document.getElementById('save-greeting');
    const testGreetingButton = document.getElementById('test-greeting');
    const statusMessage = document.getElementById('status-message');
    const recordButton = document.getElementById('record-button');

    // Audio player for greeting
    const greetingPlayer = new Audio();
    
    // Default greeting text in Polish
    const DEFAULT_GREETING = "Witaj! Możesz teraz mówić. W czym mogę pomóc?";
    
    // Load saved greeting from localStorage
    greetingTextInput.value = localStorage.getItem('greetingText') || DEFAULT_GREETING;

    // Save greeting text to localStorage
    saveGreetingButton.addEventListener('click', () => {
        const greetingText = greetingTextInput.value.trim();
        if (greetingText) {
            localStorage.setItem('greetingText', greetingText);
            showMessage('Tekst powitania został zapisany pomyślnie!', 'success');
        } else {
            greetingTextInput.value = DEFAULT_GREETING;
            localStorage.setItem('greetingText', DEFAULT_GREETING);
            showMessage('Użyto domyślnego tekstu powitania', 'success');
        }
    });

    // Test greeting (play the greeting audio)
    testGreetingButton.addEventListener('click', async () => {
        await playGreeting();
    });

    // Poprawka: Przejmujemy obsługę kliknięcia przycisku w bezpieczniejszy sposób
    // Usuwamy wszystkie obecne listenery
    const newRecordButton = recordButton.cloneNode(true);
    recordButton.parentNode.replaceChild(newRecordButton, recordButton);
    
    // Dodajemy naszego listenera
    newRecordButton.addEventListener('click', async function(event) {
        console.log("Przycisk nagrywania kliknięty");
        
        // Jeśli zatrzymujemy nagrywanie, po prostu wywołaj funkcję toggle
        if (newRecordButton.classList.contains('recording')) {
            console.log("Zatrzymuję nasłuchiwanie");
            window.toggleContinuousListening();
            return;
        }
        
        // Jeśli rozpoczynamy nasłuchiwanie
        try {
            console.log("Odtwarzam powitanie...");
            statusMessage.textContent = 'Odtwarzanie powitania...';
            const greetingSuccess = await playGreeting();
            
            console.log("Powitanie zakończone, uruchamiam nasłuchiwanie");
            statusMessage.textContent = 'Uruchamianie nasłuchiwania...';
            
            // Bezpośrednio wywołaj funkcję nasłuchiwania - ważne, nie przez setTimeout
            if (typeof window.toggleContinuousListening === 'function') {
                console.log("Wywołuję toggleContinuousListening");
                window.toggleContinuousListening();
            } else {
                console.error("Funkcja toggleContinuousListening nie jest dostępna!");
                showMessage('Błąd: Nie można uruchomić nasłuchiwania', 'error');
            }
        } catch (error) {
            console.error("Błąd podczas obsługi przycisku nagrywania:", error);
            statusMessage.textContent = 'Gotowy do słuchania';
            showMessage('Błąd podczas uruchamiania nasłuchiwania', 'error');
        }
    });

    // Function to play the greeting
    async function playGreeting() {
        const greetingText = localStorage.getItem('greetingText') || DEFAULT_GREETING;
        let isTestButton = false;
        
        try {
            console.log("Rozpoczynam odtwarzanie powitania...");
            
            // Stop any current playback
            greetingPlayer.pause();
            greetingPlayer.currentTime = 0;
            
            // Sprawdź, czy funkcja została wywołana z przycisku testowego
            isTestButton = document.activeElement === testGreetingButton;
            
            if (isTestButton) {
                testGreetingButton.disabled = true;
                testGreetingButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generowanie...';
            }
            
            console.log("Wysyłam żądanie do API TTS z tekstem:", greetingText);
            
            // Send request to get TTS for the greeting
            const response = await fetch('/api/speak', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: greetingText })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error("Błąd API TTS:", response.status, errorText);
                throw new Error('Nie udało się wygenerować powitania głosowego');
            }
            
            const data = await response.json();
            console.log("Otrzymano odpowiedź TTS:", data);
            
            if (!data.audio_url) {
                throw new Error('Brak URL audio w odpowiedzi');
            }
            
            // Set up audio URL and event listeners
            const audioUrl = data.audio_url.startsWith('http') 
                ? data.audio_url 
                : window.location.origin + data.audio_url;
                
            console.log("URL audio powitania:", audioUrl);
            greetingPlayer.src = audioUrl;
            
            // Wait for the audio to play completely
            console.log("Rozpoczynam odtwarzanie audio...");
            await new Promise((resolve, reject) => {
                greetingPlayer.onended = () => {
                    console.log("Odtwarzanie powitania zakończone");
                    resolve();
                };
                greetingPlayer.onerror = (e) => {
                    console.error("Błąd odtwarzania audio:", e);
                    reject(new Error("Błąd odtwarzania audio"));
                };
                
                greetingPlayer.play().catch(error => {
                    console.error("Błąd podczas uruchamiania odtwarzania:", error);
                    reject(error);
                });
            });
            
            console.log("Funkcja playGreeting zakończona pomyślnie");
            return true;
        } catch (error) {
            console.error('Błąd odtwarzania powitania:', error);
            showMessage('Błąd odtwarzania powitania: ' + error.message, 'error');
            return false;
        } finally {
            if (isTestButton) {
                testGreetingButton.disabled = false;
                testGreetingButton.innerHTML = '<i class="fas fa-play"></i> Testuj powitanie';
            }
        }
    }
    
    // Add this function to window object for other scripts to use
    window.playGreeting = playGreeting;
    
    // Helper function to show messages (uses the same function as in app.js)
    function showMessage(message, type) {
        const messageContainer = document.getElementById('message-container');
        const messageText = document.getElementById('message-text');
        
        if (!messageContainer || !messageText) {
            console.error('Elementy komunikatów nie zostały znalezione');
            return;
        }
        
        messageText.textContent = message;
        messageContainer.classList.remove('hidden', 'success', 'error');
        messageContainer.classList.add(type);
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            messageContainer.classList.add('hidden');
        }, 5000);
    }
});
