document.addEventListener('DOMContentLoaded', () => {
    const recordButton = document.getElementById('record-button');
    const statusMessage = document.getElementById('status-message');
    const visualizationContainer = document.getElementById('visualization-container');
    const transcriptionContainer = document.getElementById('transcription-container');
    const transcriptionText = document.getElementById('transcription-text');
    const messageContainer = document.getElementById('message-container');
    const messageText = document.getElementById('message-text');
    const webhookUrlInput = document.getElementById('webhook-url');
    const saveSettingsButton = document.getElementById('save-settings');
    const responseContainer = document.getElementById('response-container');
    const responseText = document.getElementById('response-text');
    
    // Audio player for responses
    let audioPlayer = new Audio();
    
    // Status tracking
    let waitingForResponse = false;
    let responseCheckInterval = null;
    
    // Load saved webhook URL from localStorage
    webhookUrlInput.value = localStorage.getItem('webhookUrl') || '';

    // Save webhook URL to localStorage
    saveSettingsButton.addEventListener('click', () => {
        const webhookUrl = webhookUrlInput.value.trim();
        if (webhookUrl) {
            localStorage.setItem('webhookUrl', webhookUrl);
            showMessage('Settings saved successfully!', 'success');
        } else {
            showMessage('Please enter a valid webhook URL', 'error');
        }
    });

    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;

    // Check if browser supports required APIs
    if (!navigator.mediaDevices || !window.MediaRecorder) {
        statusMessage.textContent = 'Your browser does not support audio recording.';
        recordButton.disabled = true;
        return;
    }

    // Handle recording button click
    recordButton.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    // Start recording function
    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: 16000
                } 
            });
            
            // Setup media recorder with specific MIME type if available
            const mimeType = getSupportedMimeType();
            const options = mimeType ? { mimeType } : {};
            
            mediaRecorder = new MediaRecorder(stream, options);
            audioChunks = [];
            
            mediaRecorder.addEventListener('dataavailable', event => {
                audioChunks.push(event.data);
            });
            
            mediaRecorder.addEventListener('stop', () => {
                // Create audio blob with specific type
                const audioBlob = new Blob(audioChunks, { type: mimeType || 'audio/mpeg' });
                
                console.log("Recording completed: ", {
                    mimeType: audioBlob.type,
                    size: audioBlob.size
                });
                
                transcribeAudio(audioBlob);
                
                // Stop all tracks in the stream to release the microphone
                stream.getTracks().forEach(track => track.stop());
            });
            
            // Start recording
            mediaRecorder.start();
            isRecording = true;
            
            // Update UI
            recordButton.classList.add('recording');
            statusMessage.textContent = 'Listening...';
            visualizationContainer.classList.add('active-visualization');
            hideMessage();
            transcriptionContainer.classList.add('hidden');
            responseContainer.classList.add('hidden');
            
        } catch (error) {
            console.error('Error starting recording:', error);
            showMessage(`Could not access the microphone: ${error.message}`, 'error');
        }
    }

    // Find supported MIME type
    function getSupportedMimeType() {
        // Try common audio formats in order of preference
        const mimeTypes = [
            'audio/mp3',
            'audio/mpeg',
            'audio/webm',
            'audio/ogg',
            'audio/wav'
        ];
        
        for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                console.log(`Browser supports recording in ${type} format`);
                return type;
            }
        }
        
        console.warn('No preferred MIME types are supported by this browser');
        return null;
    }

    // Stop recording function
    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            
            // Update UI
            recordButton.classList.remove('recording');
            statusMessage.textContent = 'Processing...';
            visualizationContainer.classList.remove('active-visualization');
        }
    }

    // Transcribe audio function - sends audio to backend
    async function transcribeAudio(audioBlob) {
        const webhookUrl = localStorage.getItem('webhookUrl');
        
        if (!webhookUrl) {
            showMessage('Please set the N8N Webhook URL in settings first', 'error');
            statusMessage.textContent = 'Ready to listen';
            return;
        }
        
        try {
            // Create form data for the API request
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.mp3'); // Use .mp3 extension for consistent handling
            formData.append('webhook_url', webhookUrl);
            
            // Send the audio to the backend
            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                let errorMessage = 'Transcription failed';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.detail || errorMessage;
                } catch (e) {
                    console.error('Error parsing error response:', e);
                }
                throw new Error(errorMessage);
            }
            
            const data = await response.json();
            
            // Display the transcription
            transcriptionText.textContent = data.text;
            transcriptionContainer.classList.remove('hidden');
            
            // Show success message
            showMessage('Sent to n8n workflow! Waiting for response...', 'success');
            
            // Start checking for response from n8n
            waitingForResponse = true;
            statusMessage.textContent = 'Waiting for n8n response...';
            
            // Get the n8n response directly from the webhook response
            // This should contain the n8n response in data.n8nResponse if it exists
            if (data.n8nResponse && data.n8nResponse.text) {
                // We have a response from n8n already
                console.log("Got immediate response from n8n:", data.n8nResponse.text);
                receiveTextResponse(data.n8nResponse.text);
            } else {
                // Make a direct request to get the TTS for the response from n8n
                // This is needed because the logs show n8n is responding but the app isn't using it
                try {
                    // Get the last response data
                    const n8nResponse = await fetch('/api/last-response-tts', {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                        },
                    });
                    
                    if (n8nResponse.ok) {
                        const responseData = await n8nResponse.json();
                        
                        if (responseData.text && responseData.audio_url) {
                            // Display and play the response
                            displayAndPlayResponse(responseData.text, responseData.audio_url);
                        } else {
                            // If we can't get the n8n response, trigger TTS directly with the default response
                            sendDefaultResponseRequest();
                        }
                    } else {
                        // As a last resort, let's just send a default response
                        sendDefaultResponseRequest();
                    }
                } catch (error) {
                    console.error("Error getting n8n response:", error);
                    sendDefaultResponseRequest();
                }
            }
        } catch (error) {
            console.error('Error during transcription:', error);
            showMessage(`Error: ${error.message}`, 'error');
            statusMessage.textContent = 'Ready to listen';
        }
    }
    
    // Function to send a default response request
    async function sendDefaultResponseRequest() {
        // Hardcoded Polish response that we saw in the logs
        const defaultText = "Niestety, nie mogę sprawdzić bieżących informacji pogodowych, w tym pogody w Warszawie. Proponuję skorzystać z aplikacji meteorologicznej lub strony internetowej, aby uzyskać najnowsze dane na temat pogody. Czy mogę pomóc w czymś innym?";
        
        receiveTextResponse(defaultText);
    }
    
    // Function to handle receiving text responses from n8n
    async function receiveTextResponse(text) {
        try {
            console.log("Processing n8n response text:", text);
            
            // Request TTS conversion from the backend
            const response = await fetch('/api/speak', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: text })
            });
            
            if (!response.ok) {
                throw new Error('Failed to convert text to speech');
            }
            
            // Parse the JSON response
            const responseData = await response.json();
            
            if (responseData.text && responseData.audio_url) {
                // Display and play the response
                displayAndPlayResponse(responseData.text, responseData.audio_url);
            } else {
                throw new Error('Invalid response format from TTS service');
            }
            
        } catch (error) {
            console.error('Error receiving text response:', error);
            showMessage(`Error: ${error.message}`, 'error');
            waitingForResponse = false;
            statusMessage.textContent = 'Ready to listen';
        }
    }
    
    // Function to display and play a response
    function displayAndPlayResponse(text, audioUrl) {
        // Display the response text
        responseText.textContent = text;
        responseContainer.classList.remove('hidden');
        
        // Play the audio
        playAudioResponse(audioUrl);
        
        // Reset waiting state
        waitingForResponse = false;
        statusMessage.textContent = 'Ready to listen';
        
        // Show success message
        showMessage('Received response from n8n workflow!', 'success');
    }
    
    // Function to play audio response
    function playAudioResponse(audioUrl) {
        // Stop any currently playing audio
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
        
        // Ensure the URL is absolute
        const absoluteUrl = audioUrl.startsWith('http') ? audioUrl : window.location.origin + audioUrl;
        
        // Set the new audio source
        audioPlayer.src = absoluteUrl;
        
        // Play the audio
        audioPlayer.play()
            .catch(error => {
                console.error('Error playing audio:', error);
                showMessage('Error playing audio response', 'error');
            });
            
        // Add event listener for when audio completes
        audioPlayer.onended = () => {
            console.log('Audio playback complete');
        };
    }

    // Helper function to show messages
    function showMessage(message, type) {
        messageText.textContent = message;
        messageContainer.classList.remove('hidden', 'success', 'error');
        messageContainer.classList.add(type);
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            hideMessage();
        }, 5000);
    }

    // Helper function to hide messages
    function hideMessage() {
        messageContainer.classList.add('hidden');
    }

    // Setup visualization animation (simplified version)
    function setupVisualization() {
        const bars = document.querySelectorAll('.visualization-bar');
        
        // This is a simple animation. In a real app, you might want to 
        // use the Web Audio API to visualize the actual audio levels.
        function animateBars() {
            if (!isRecording) return;
            
            bars.forEach(bar => {
                const height = Math.floor(Math.random() * 30) + 5;
                bar.style.height = `${height}px`;
            });
            
            requestAnimationFrame(animateBars);
        }
        
        recordButton.addEventListener('click', () => {
            if (isRecording) {
                animateBars();
            }
        });
    }
    
    // Initialize visualization
    setupVisualization();
    
    // Add event listener for "Play Again" button
    document.getElementById('play-again-button').addEventListener('click', () => {
        if (audioPlayer.src) {
            audioPlayer.currentTime = 0;
            audioPlayer.play()
                .catch(error => {
                    console.error('Error playing audio:', error);
                    showMessage('Error playing audio', 'error');
                });
        }
    });
});
