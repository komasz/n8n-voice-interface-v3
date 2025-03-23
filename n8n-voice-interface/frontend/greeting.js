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

    // Add event listener to record button to play greeting before starting to listen
    const originalRecordButtonClickHandler = recordButton.onclick;
    recordButton.onclick = null; // Remove existing handler
    
    recordButton.addEventListener('click', async function(event) {
        // If we're starting listening (not stopping)
        if (!recordButton.classList.contains('recording')) {
            // Play greeting first
            statusMessage.textContent = 'Odtwarzanie powitania...';
            await playGreeting();
            
            // Wait for a small delay after greeting completes
            setTimeout(() => {
                statusMessage.textContent = 'Uruchamianie nasłuchiwania...';
                if (typeof window.toggleContinuousListening === 'function') {
                    window.toggleContinuousListening();
                } else if (typeof originalRecordButtonClickHandler === 'function') {
                    originalRecordButtonClickHandler.call(this, event);
                }
            }, 500); // Small delay after greeting
        } else {
            // If stopping listening, just call the original handler
            if (typeof window.toggleContinuousListening === 'function') {
                window.toggleContinuousListening();
            } else if (typeof originalRecordButtonClickHandler === 'function') {
                originalRecordButtonClickHandler.call(this, event);
            }
        }
    });

    // Function to play the greeting
    async function playGreeting() {
        const greetingText = localStorage.getItem('greetingText') || DEFAULT_GREETING;
        
        try {
            // Stop any current playback
            greetingPlayer.pause();
            greetingPlayer.currentTime = 0;
            
            testGreetingButton.disabled = true;
            testGreetingButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generowanie...';
            
            // Send request to get TTS for the greeting
            const response = await fetch('/api/speak', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: greetingText })
            });
            
            if (!response.ok) {
                throw new Error('Nie udało się wygenerować powitania głosowego');
            }
            
            const data = await response.json();
            
            if (!data.audio_url) {
                throw new Error('Brak URL audio w odpowiedzi');
            }
            
            // Set up audio URL and event listeners
            const audioUrl = data.audio_url.startsWith('http') 
                ? data.audio_url 
                : window.location.origin + data.audio_url;
                
            greetingPlayer.src = audioUrl;
            
            // Wait for the audio to play completely
            await new Promise((resolve, reject) => {
                greetingPlayer.onended = resolve;
                greetingPlayer.onerror = reject;
                greetingPlayer.play().catch(reject);
            });
            
            return true;
        } catch (error) {
            console.error('Błąd odtwarzania powitania:', error);
            showMessage('Błąd odtwarzania powitania: ' + error.message, 'error');
            return false;
        } finally {
            testGreetingButton.disabled = false;
            testGreetingButton.innerHTML = '<i class="fas fa-play"></i> Testuj powitanie';
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
