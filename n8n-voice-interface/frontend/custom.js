// This script is added to index.html
// Automatically runs the greeting and listening on page load

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Starting automatic greeting and listening script');
    
    // Default webhook URL set directly if none is saved
    const savedWebhookUrl = localStorage.getItem('webhookUrl');
    if (!savedWebhookUrl) {
        // Set the specific webhook URL as the default
        const defaultWebhookUrl = 'https://performancetech.app.n8n.cloud/webhook/7e2b2075-de0d-430b-bc82-4981fac57da9';
        localStorage.setItem('webhookUrl', defaultWebhookUrl);
        
        // Update the form field
        const webhookUrlInput = document.getElementById('webhook-url');
        if (webhookUrlInput) {
            webhookUrlInput.value = defaultWebhookUrl;
        }
        
        // Show success message to user that the webhook URL is preconfigured
        if (window.showMessage) {
            window.showMessage('Webhook URL jest skonfigurowany domyślnie. Możesz go zmienić w ustawieniach, jeśli potrzebujesz.', 'success');
        }
    }
    
    // Wait 2 seconds for the page to load
    setTimeout(async () => {
        try {
            // First play the greeting
            console.log('Starting greeting');
            const greetingSuccess = await window.playGreeting();
            
            // Even if the greeting fails, continue with listening
            console.log('Greeting ' + (greetingSuccess ? 'completed' : 'failed') + ', starting listening');
            
            // Then start continuous listening
            await window.toggleContinuousListening();
        } catch (error) {
            console.error('error:', error);
            
            // Despite the error, try to start listening
            try {
                console.log('Attempting to start listening despite greeting error...');
                await window.toggleContinuousListening();
            } catch (listeningError) {
                console.error('Failed to start listening:', listeningError);
            }
        }
    }, 2000);
});
