// Ten skrypt należy dodać do index.html
// Uruchamia powitanie i nasłuchiwanie automatycznie po załadowaniu strony

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Uruchamiam skrypt automatycznego powitania i nasłuchiwania');
    
    // Domyślny webhook URL ustawiony bezpośrednio, jeśli nie ma zapisanego
    const savedWebhookUrl = localStorage.getItem('webhookUrl');
    if (!savedWebhookUrl) {
        // Ustaw domyślny webhook URL - konieczne do działania
        const defaultWebhookUrl = 'https://twoja-instancja-n8n.com/webhook/domyslny';
        localStorage.setItem('webhookUrl', defaultWebhookUrl);
        
        // Zaktualizuj pole formularza
        const webhookUrlInput = document.getElementById('webhook-url');
        if (webhookUrlInput) {
            webhookUrlInput.value = defaultWebhookUrl;
        }
    }
    
    // Poczekaj 2 sekundy, żeby strona się załadowała
    setTimeout(async () => {
        try {
            // Najpierw odtwórz powitanie
            console.log('Powitanie rozpoczęte');
            const greetingSuccess = await window.playGreeting();
            
            // Nawet jeśli powitanie się nie udało, kontynuuj z nasłuchiwaniem
            console.log('Powitanie ' + (greetingSuccess ? 'zakończone' : 'nie powiodło się') + ', uruchamiam nasłuchiwanie');
            
            // Następnie uruchom ciągłe nasłuchiwanie
            await window.toggleContinuousListening();
        } catch (error) {
            console.error('error:', error);
            
            // Mimo błędu, spróbuj uruchomić nasłuchiwanie
            try {
                console.log('Próba uruchomienia nasłuchiwania mimo błędu powitania...');
                await window.toggleContinuousListening();
            } catch (listeningError) {
                console.error('Nie udało się uruchomić nasłuchiwania:', listeningError);
            }
        }
    }, 2000);
});
