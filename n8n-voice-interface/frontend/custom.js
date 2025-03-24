// This script is added to index.html
// Sets default webhook URL and modifies button behavior for first-time greeting

document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing voice interface...');
    
    // Set default webhook URL if none is saved
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
    
    // Modify the toggleContinuousListening function to play greeting on first click
    // Store the original function
    const originalToggleFunction = window.toggleContinuousListening;
    
    // Replace with our new function that checks if this is the first time
    window.toggleContinuousListening = async function() {
        // Check if this is the first time clicking the button
        const greetingPlayed = localStorage.getItem('greetingPlayed');
        
        // If listening is not active and greeting hasn't been played yet
        if (!window.isListening && !greetingPlayed) {
            try {
                console.log('First time clicking - playing greeting');
                
                // Play the greeting
                await window.playGreeting();
                
                // Mark that greeting has been played
                localStorage.setItem('greetingPlayed', 'true');
                
                // Now call the original function to start listening
                return await originalToggleFunction();
            } catch (error) {
                console.error('Error playing first-time greeting:', error);
                // Continue with original function if greeting fails
                return await originalToggleFunction();
            }
        } else {
            // Not first time, just call original function
            return await originalToggleFunction();
        }
    };
    
    console.log('Initialization complete - waiting for user to press microphone button');
});
