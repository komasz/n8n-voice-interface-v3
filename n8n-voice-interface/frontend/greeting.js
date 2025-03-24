// Add this function to your app.js file to replace the current playGreeting function

// Function to play a greeting without HEAD request
window.playGreeting = async function(greetingText = "Hello. I'm your voice assistant. How can I help you today?") {
    console.log("Starting greeting playback...");
    
    try {
        console.log(`Sending request to TTS API with text: ${greetingText}`);
        const response = await fetch('/api/speak', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: greetingText })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to convert text to speech (status ${response.status})`);
        }
        
        const responseData = await response.json();
        console.log("Received TTS response:");
        console.log(responseData);
        
        if (!responseData.audio_url) {
            throw new Error("No audio URL in response");
        }
        
        // Make sure audioPlayer is initialized
        if (!audioPlayer) {
            audioPlayer = new Audio();
        }
        
        // Prepare audio URL
        const audioUrl = responseData.audio_url.startsWith('http') 
            ? responseData.audio_url 
            : window.location.origin + responseData.audio_url;
        
        console.log(`Greeting audio URL: ${audioUrl}`);
        
        // Set audio source directly
        audioPlayer.src = audioUrl;
        
        // Error handling
        audioPlayer.onerror = (e) => {
            console.error("Error playing greeting:", e);
            throw new Error("Playback error");
        };
        
        // Use Promise to wait for playback to finish
        await new Promise((resolve, reject) => {
            audioPlayer.onended = () => {
                console.log("Greeting playback completed");
                resolve();
            };
            
            audioPlayer.onerror = (e) => {
                console.error("Error playing greeting:", e);
                reject(new Error("Playback error"));
            };
            
            // Start playback with error handling
            audioPlayer.play().catch(err => {
                console.error("Error starting playback:", err);
                reject(err);
            });
        });
        
        console.log("playGreeting function completed successfully");
        return true;
    } catch (error) {
        console.error("Error in playGreeting function:", error);
        // Try to continue without playing audio
        window.showMessage(`Failed to play greeting: ${error.message}`, 'error');
        return false;
    }
};
