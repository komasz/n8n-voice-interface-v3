// This script provides EXTREME sensitivity settings with proper error handling

document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing voice interface with safety checks...');

    // Set default webhook URL if none is saved
    const savedWebhookUrl = localStorage.getItem('webhookUrl');
    if (!savedWebhookUrl) {
        const defaultWebhookUrl = 'https://performancetech.app.n8n.cloud/webhook/7e2b2075-de0d-430b-bc82-4981fac57da9';
        localStorage.setItem('webhookUrl', defaultWebhookUrl);

        const webhookUrlInput = document.getElementById('webhook-url');
        if (webhookUrlInput) {
            webhookUrlInput.value = defaultWebhookUrl;
        }
    }

    // Wait longer for DOM and scripts to initialize
    setTimeout(() => {
        // Add super sensitivity controls to the settings section
        addSensitivityControls();

        // Fix the first click behavior
        fixFirstClickGreeting();

        // Modify the original app's startListening function to increase sensitivity
        safelyModifyAppFunctions();

    }, 1000); // Wait a full second to ensure everything is loaded
});

// Function to add sensitivity controls to the settings section
function addSensitivityControls() {
    // Find the settings container
    const settingsContainer = document.querySelector('.settings-container .form-group');
    if (!settingsContainer) {
        console.warn("Settings container not found");
        return;
    }

    // Create sensitivity controls with ultra-sensitive ranges
    const sensitivityControls = document.createElement('div');
    sensitivityControls.innerHTML = `
        <label for="mic-sensitivity">Czułość mikrofonu (SUPER CZUŁY):</label>
        <div class="slider-container">
            <input type="range" id="mic-sensitivity" min="0.1" max="20" step="0.1" value="1">
            <span id="sensitivity-value">1</span>
        </div>
        <p class="sensitivity-info">Wartości poniżej 1 = ekstremalna czułość (może wykrywać nawet bardzo ciche dźwięki)</p>
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
            margin-top: 5px;
            margin-bottom: 15px;
        }
    `;
    document.head.appendChild(style);

    // Insert after webhook URL input
    settingsContainer.appendChild(sensitivityControls);

    // Get saved sensitivity or use default
    const savedSensitivity = localStorage.getItem('micSensitivity') || 1;
    const sensitivitySlider = document.getElementById('mic-sensitivity');
    const sensitivityValue = document.getElementById('sensitivity-value');

    if (sensitivitySlider && sensitivityValue) {
        // Set initial values
        sensitivitySlider.value = savedSensitivity;
        sensitivityValue.textContent = savedSensitivity;

        // Update value when slider changes
        sensitivitySlider.addEventListener('input', function() {
            sensitivityValue.textContent = this.value;
            localStorage.setItem('micSensitivity', this.value);

            // Store the value to apply it to the original app's SILENCE_THRESHOLD
            window.CUSTOM_SILENCE_THRESHOLD = parseFloat(this.value);
        });
    }
}

// Function to fix first-click greeting behavior
function fixFirstClickGreeting() {
    const recordButton = document.getElementById('record-button');
    if (!recordButton) {
        console.warn("Record button not found");
        return;
    }

    // Store a reference to the original function if it exists
    const originalToggleFunction = window.toggleContinuousListening;
    if (!originalToggleFunction) {
        console.warn("toggleContinuousListening function not found");
        return;
    }

    // Override the toggle function with our safer version
    window.toggleContinuousListening = async function() {
        try {
            // Check if this is the first click and we're not already listening
            const isCurrentlyListening = window.isListening === true;
            const greetingPlayed = localStorage.getItem('greetingPlayed') === 'true';

            // If this is the first click and we're not listening
            if (!isCurrentlyListening && !greetingPlayed) {
                try {
                    console.log('First time clicking - playing greeting');

                    // Play the greeting if the function exists
                    if (typeof window.playGreeting === 'function') {
                        await window.playGreeting();

                        // Mark that greeting has been played
                        localStorage.setItem('greetingPlayed', 'true');
                    } else {
                        console.warn("playGreeting function not found");
                    }
                } catch (error) {
                    console.error('Error playing first-time greeting:', error);
                    // Continue despite greeting error
                }
            }

            // Apply our custom sensitivity before toggling
            applySensitivityOverrides();

            // Call the original function to handle toggling
            return await originalToggleFunction();
        } catch (error) {
            console.error("Error in custom toggleContinuousListening:", error);
            return await originalToggleFunction();
        }
    };
}

// Function to safely modify app functions
function safelyModifyAppFunctions() {
    // Wait for the app to be fully initialized
    console.log("Attempting to modify app functions for higher sensitivity...");

    // Store custom sensitivity value from localStorage or default to 1
    window.CUSTOM_SILENCE_THRESHOLD = parseFloat(localStorage.getItem('micSensitivity') || 1);

    // Create safe references to modify the original functions
    try {
        // Store original startSilenceDetection function if it exists
        if (typeof window.startSilenceDetection === 'function') {
            const originalStartSilenceDetection = window.startSilenceDetection;

            // Override with our enhanced version
            window.startSilenceDetection = function() {
                try {
                    console.log("Starting enhanced silence detection");

                    // Call original function to initialize properly
                    originalStartSilenceDetection();

                    // Apply our sensitivity overrides after the original function runs
                    applySensitivityOverrides();

                } catch (error) {
                    console.error("Error in enhanced startSilenceDetection:", error);
                    // Fallback to original function
                    originalStartSilenceDetection();
                }
            };

            console.log("Successfully overrode startSilenceDetection");
        } else {
            console.warn("startSilenceDetection function not found");
        }
    } catch (error) {
        console.error("Error modifying app functions:", error);
    }
}

// Function to apply sensitivity overrides to the app's variables
function applySensitivityOverrides() {
    try {
        // Apply our custom silence threshold if the global variable exists
        if (typeof window.SILENCE_THRESHOLD !== 'undefined') {
            const originalThreshold = window.SILENCE_THRESHOLD;
            window.SILENCE_THRESHOLD = window.CUSTOM_SILENCE_THRESHOLD || 1;
            console.log(`Modified SILENCE_THRESHOLD from ${originalThreshold} to ${window.SILENCE_THRESHOLD}`);
        }

        // Reduce silence duration if it exists
        if (typeof window.SILENCE_DURATION !== 'undefined') {
            window.SILENCE_DURATION = 800; // Reduced from the default (usually 1500ms)
            console.log(`Modified SILENCE_DURATION to ${window.SILENCE_DURATION}ms`);
        }

        // Make checks more frequent if possible
        if (typeof window.CHECK_INTERVAL !== 'undefined') {
            window.CHECK_INTERVAL = 50; // Reduced from the default (usually 100ms)
            console.log(`Modified CHECK_INTERVAL to ${window.CHECK_INTERVAL}ms`);
        }
    } catch (error) {
        console.error("Error applying sensitivity overrides:", error);
    }
}