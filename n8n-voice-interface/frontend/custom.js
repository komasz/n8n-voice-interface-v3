// This script is added to index.html
// Automatically runs the greeting and listening on page load

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Starting automatic greeting and listening script');
    
    // Default webhook URL set directly if none is saved
    const savedWebhookUrl = localStorage.getItem('webhookUrl');
    if (!savedWebhookUrl) {
        // Set a placeholder webhook URL that clearly indicates it needs to be changed
        const defaultWebhookUrl = 'http://YOUR-N8N-INSTANCE/webhook/YOUR-WEBHOOK-ID';
        localStorage.setItem('webhookUrl', defaultWebhookUrl);
        
        // Update the form field
        const webhookUrlInput = document.getElementById('webhook-url');
        if (webhookUrlInput) {
            webhookUrlInput.value = defaultWebhookUrl;
        }
        
        // Show message to user to update the webhook URL
        if (window.showMessage) {
            window.showMessage('Please update the N8N webhook URL in settings before using the voice interface', 'error');
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
