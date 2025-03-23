// Funkcja do odtwarzania powitania po rozpoczęciu słuchania
document.addEventListener('DOMContentLoaded', function() {
    console.log("Greeting extension loaded");
    
    // Znajdź przyciski i pola
    const recordButton = document.getElementById('record-button');
    const originalOnClick = recordButton.onclick;
    const greetingTextInput = document.getElementById('greeting-text');
    const saveSettingsButton = document.getElementById('save-settings');
    
    // Jeśli nie znaleziono elementów, przerwij
    if (!recordButton || !greetingTextInput || !saveSettingsButton) {
        console.warn("Nie znaleziono wszystkich elementów wymaganych dla powitania");
        return;
    }
    
    // Wczytaj tekst powitania
    greetingTextInput.value = localStorage.getItem('greetingText') || 'Cześć jestem super agent!';
    
    // Funkcja do zapisywania tekstu powitania
    const originalSaveClick = saveSettingsButton.onclick;
    saveSettingsButton.onclick = function(e) {
        if (originalSaveClick) {
            originalSaveClick.call(this, e);
        }
        
        // Zapisz tekst powitania
        const greetingText = greetingTextInput.value.trim();
        if (greetingText) {
            localStorage.setItem('greetingText', greetingText);
            console.log("Zapisano tekst powitania:", greetingText);
        }
    };
    
    // Funkcja odtwarzania powitania przy użyciu TTS
    async function playGreeting() {
        try {
            // Pobierz tekst powitania z localStorage lub użyj domyślnego
            const greetingText = localStorage.getItem('greetingText') || 'Cześć jestem super agent!';
            
            // Wyświetl status
            const statusMessage = document.getElementById('status-message');
            if (statusMessage) {
                statusMessage.textContent = 'Odtwarzam powitanie...';
            }
            
            console.log("Generuję powitanie:", greetingText);
            
            // Konwertuj tekst na mowę przy użyciu istniejącego API
            const response = await fetch('/api/speak', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: greetingText })
            });
            
            if (!response.ok) {
                throw new Error('Nie udało się wygenerować powitania');
            }
            
            const responseData = await response.json();
            const audioUrl = responseData.audio_url;
            
            // Utwórz nowy odtwarzacz audio
            const greetingPlayer = new Audio();
            greetingPlayer.src = audioUrl.startsWith('http') ? audioUrl : window.location.origin + audioUrl;
            
            console.log("Odtwarzam powitanie");
            
            // Odtwórz powitanie
            await greetingPlayer.play();
            
            // Poczekaj na zakończenie
            return new Promise((resolve) => {
                greetingPlayer.onended = () => {
                    if (statusMessage) {
                        statusMessage.textContent = 'Ciągłe słuchanie aktywne...';
                    }
                    console.log("Powitanie zakończone");
                    resolve(true);
                };
            });
        } catch (error) {
            console.error('Błąd podczas odtwarzania powitania:', error);
            // Nie przerywaj uruchamiania słuchania, nawet jeśli powitanie się nie powiodło
            return false;
        }
    }
    
    // Podmień istniejące funkcje
    recordButton.onclick = async function(e) {
        // Jeśli przycisk ma już klasę recording, oznacza to, że 
        // słuchanie jest aktywne i chcemy je zatrzymać
        if (recordButton.classList.contains('recording')) {
            // Wywołaj oryginalną funkcję zatrzymania
            if (originalOnClick) {
                originalOnClick.call(this, e);
            }
        } else {
            // Wyłącz przycisk na czas odtwarzania
            recordButton.disabled = true;
            
            // Odtwórz powitanie
            await playGreeting();
            
            // Włącz przycisk
            recordButton.disabled = false;
            
            // Rozpocznij słuchanie
            if (originalOnClick) {
                originalOnClick.call(this, e);
            }
        }
    };
    
    console.log("Greeting extension initialized");
});
