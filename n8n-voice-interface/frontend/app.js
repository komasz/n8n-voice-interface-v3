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
            showMessage('Successfully sent to n8n workflow!', 'success');
            
            // Update status
            statusMessage.textContent = 'Ready to listen';
            
        } catch (error) {
            console.error('Error during transcription:', error);
            showMessage(`Error: ${error.message}`, 'error');
            statusMessage.textContent = 'Ready to listen';
        }
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
});
