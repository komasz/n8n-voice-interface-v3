// Add this code to your custom.js file
// Improves microphone sensitivity and adds controls to adjust it

document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing voice interface with improved sensitivity controls...');
    
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
    }
    
    // Wait for DOM and scripts to initialize
    setTimeout(() => {
        // Add sensitivity controls to the settings section
        addSensitivityControls();
        
        // Adjust speech detection sensitivity
        adjustSpeechDetection();
        
        // Override the click event on the record button for first-time greeting
        overrideButtonForFirstGreeting();
        
    }, 500);
});

// Function to add sensitivity controls to the settings section
function addSensitivityControls() {
    // Find the settings container
    const settingsContainer = document.querySelector('.settings-container .form-group');
    if (!settingsContainer) return;
    
    // Create sensitivity controls
    const sensitivityControls = document.createElement('div');
    sensitivityControls.innerHTML = `
        <label for="mic-sensitivity">Czułość mikrofonu:</label>
        <div class="slider-container">
            <input type="range" id="mic-sensitivity" min="15" max="50" step="5" value="30">
            <span id="sensitivity-value">30</span>
        </div>
        <p class="sensitivity-info">Wyższa wartość = mniej czuły mikrofon (wymaga głośniejszej mowy)</p>
    `;
    
    // Add some styles
    const style = document.createElement('style');
    style.textContent = `
        .slider-container {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
        }
        #mic-sensitivity {
            flex: 1;
            margin-right: 10px;
        }
        .sensitivity-info {
            font-size: 0.85rem;
            color: #666;
            margin-top: -5px;
            margin-bottom: 15px;
        }
    `;
    document.head.appendChild(style);
    
    // Insert after webhook URL input
    settingsContainer.appendChild(sensitivityControls);
    
    // Get saved sensitivity or use default
    const savedSensitivity = localStorage.getItem('micSensitivity') || 30;
    const sensitivitySlider = document.getElementById('mic-sensitivity');
    const sensitivityValue = document.getElementById('sensitivity-value');
    
    // Set initial values
    sensitivitySlider.value = savedSensitivity;
    sensitivityValue.textContent = savedSensitivity;
    
    // Update value when slider changes
    sensitivitySlider.addEventListener('input', function() {
        sensitivityValue.textContent = this.value;
        localStorage.setItem('micSensitivity', this.value);
        
        // Update global threshold if it exists
        if (window.SPEECH_DETECTION) {
            window.SPEECH_DETECTION.SILENCE_THRESHOLD = parseInt(this.value);
            console.log(`Updated microphone sensitivity: ${this.value}`);
        }
    });
}

// Function to adjust speech detection sensitivity
function adjustSpeechDetection() {
    // Create global object for speech detection settings
    window.SPEECH_DETECTION = {
        // Get saved sensitivity or use default higher value (30 instead of original 15)
        SILENCE_THRESHOLD: parseInt(localStorage.getItem('micSensitivity') || 30),
        // Minimum duration of speech required before actual recording starts
        MIN_SPEECH_DURATION: 300, // 300ms of consistent speech before recording
        // Flag to track if we've detected enough speech to start recording
        significantSpeechDetected: false,
        // Timer to track speech duration
        speechTimer: null
    };
    
    // Override the startSilenceDetection function to use our improved version
    const originalStartSilenceDetection = window.startSilenceDetection;
    
    window.startSilenceDetection = function() {
        // If the original function exists, call it to initialize
        if (typeof originalStartSilenceDetection === 'function') {
            originalStartSilenceDetection();
        }
        
        // Buffer for frequency data
        const dataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
        
        // Clear any existing interval
        if (silenceDetectionInterval) {
            clearInterval(silenceDetectionInterval);
        }
        
        // Set up improved interval to check for speech and silence
        silenceDetectionInterval = setInterval(() => {
            if (!isListening || !audioAnalyser) {
                clearInterval(silenceDetectionInterval);
                silenceDetectionInterval = null;
                return;
            }
            
            // Get current frequency data
            audioAnalyser.getByteFrequencyData(dataArray);
            
            // Calculate average volume
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            
            // Update visualization
            window.updateVisualization(average);
            
            // Jeśli odpowiedź jest w trakcie przetwarzania, nie rozpoczynaj nowego nagrywania
            if (isProcessingResponse) {
                return;
            }
            
            // User is speaking - using our custom threshold from settings
            if (average > window.SPEECH_DETECTION.SILENCE_THRESHOLD) {
                // If audio is playing, stop it
                if (audioPlayer && !audioPlayer.paused) {
                    window.stopAudioPlayback();
                }
                
                // Track speech duration before starting recording
                if (!window.SPEECH_DETECTION.speechTimer && !isRecording) {
                    // Start timing how long speech continues
                    window.SPEECH_DETECTION.speechTimer = Date.now();
                } else if (window.SPEECH_DETECTION.speechTimer && !isRecording) {
                    // Check if speech has continued long enough
                    const speechDuration = Date.now() - window.SPEECH_DETECTION.speechTimer;
                    
                    if (speechDuration >= window.SPEECH_DETECTION.MIN_SPEECH_DURATION) {
                        // Speech has continued long enough, start actual recording
                        window.SPEECH_DETECTION.significantSpeechDetected = true;
                        window.startNewRecording();
                        
                        // Reset the timer
                        window.SPEECH_DETECTION.speechTimer = null;
                    }
                }
                
                // Reset silence timer since we're detecting speech
                silenceStartTime = null;
                speechDetected = true;
            } 
            // User is silent
            else {
                // Reset speech timer if sound drops below threshold
                if (window.SPEECH_DETECTION.speechTimer && !isRecording) {
                    window.SPEECH_DETECTION.speechTimer = null;
                }
                
                // Only check for end of speech if we're recording and speech was detected
                if (isRecording && speechDetected) {
                    // If this is the start of silence
                    if (silenceStartTime === null) {
                        silenceStartTime = Date.now();
                    }
                    
                    // Check if silence has lasted long enough
                    const silenceDuration = Date.now() - silenceStartTime;
                    if (silenceDuration >= SILENCE_DURATION) {
                        console.log(`Cisza wykryta przez ${silenceDuration}ms. Kończę nagrywanie.`);
                        window.stopCurrentRecording();
                        
                        // Reset for next recording
                        speechDetected = false;
                        silenceStartTime = null;
                        window.SPEECH_DETECTION.significantSpeechDetected = false;
                    }
                }
            }
        }, CHECK_INTERVAL);
    };
}

// Override the button for first-time greeting
function overrideButtonForFirstGreeting() {
    const recordButton = document.getElementById('record-button');
    if (recordButton) {
        // Remove any existing click handlers by cloning the button
        const newRecordButton = recordButton.cloneNode(true);
        recordButton.parentNode.replaceChild(newRecordButton, recordButton);
        
        // Add our custom click handler
        newRecordButton.addEventListener('click', async function() {
            // Check if this is the first click and we're not already listening
            const greetingPlayed = localStorage.getItem('greetingPlayed') === 'true';
            
            // If this is the first click and we're not listening
            if (!window.isListening && !greetingPlayed) {
                try {
                    console.log('First time clicking - playing greeting');
                    
                    // Play the greeting
                    await window.playGreeting();
                    
                    // Mark that greeting has been played
                    localStorage.setItem('greetingPlayed', 'true');
                } catch (error) {
                    console.error('Error playing first-time greeting:', error);
                }
            }
            
            // Always toggle listening state
            await window.toggleContinuousListening();
        });
    }
}
