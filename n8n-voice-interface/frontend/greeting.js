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

    // Store original click handler
    const originalClickHandler = recordButton.onclick;
    
    // Remove original click handler (we'll call it ourselves)
    recordButton.onclick = null;
    
    // Add our custom click handler
    recordButton.addEventListener('click', async function(event) {
        // If we're starting listening (not stopping)
        if (!recordButton.classList.contains('recording')) {
            // Play greeting first
            statusMessage.textContent = 'Odtwarzanie powitania...';
            await playGreeting();
            
            console.log("Powitanie zakończone, uruchamiam nasłuchiwanie");
            statusMessage.textContent = 'Uruchamianie nasłuchiwania...';
            
            // Use the global function if available
            if (typeof window.toggleContinuousListening === 'function') {
                window.toggleContinuousListening();
            } else {
                console.error("Funkcja toggleContinuousListening nie jest dostępna!");
                showMessage('Błąd: Nie można uruchomić nasłuchiwania', 'error');
            }
        } else {
            // If stopping listening, just toggle continuous listening
            if (typeof window.toggleContinuousListening === 'function') {
                window.toggleContinuousListening();
            } else {
                console.error("Funkcja toggleContinuousListening nie jest dostępna!");
                showMessage('Błąd: Nie można zatrzymać nasłuchiwania', 'error');
            }
        }
    });

    // Function to play the greeting
    async function playGreeting() {
        const greetingText = localStorage.getItem('greetingText') || DEFAULT_GREETING;
        
        try {
            console.log("Rozpoczynam odtwarzanie powitania...");
            
            // Stop any current playback
            greetingPlayer.pause();
            greetingPlayer.currentTime = 0;
            
            // Update test button state if applicable
            if (document.activeElement === testGreetingButton) {
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
            if (document.activeElement === testGreetingButton) {
                testGreetingButton.disabled = false;
                testGreetingButton.innerHTML = '<i class="fas fa-play"></i> Testuj powitanie';
            }
        }
    }
    
    // Helper function to show messages (uses the global function from app.js)
    function showMessage(message, type) {
        if (typeof window.showMessage === 'function') {
            window.showMessage(message, type);
        } else {
            console.log(`${type}: ${message}`);
        }
    }
});
