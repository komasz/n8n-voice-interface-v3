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
            await window.playGreeting();
            
            console.log('Powitanie zakończone, uruchamiam nasłuchiwanie');
            
            // Następnie uruchom ciągłe nasłuchiwanie
            await window.toggleContinuousListening();
        } catch (error) {
            console.error('error:', error);
        }
    }, 2000);
});
