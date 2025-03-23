/**
 * Prostszy i bardziej niezawodny konwerter audio dla przeglądarki
 */
class AudioConverter {
    /**
     * Konwertuje Blob audio do formatu WAV
     * 
     * @param {Blob} audioBlob - Oryginalny Blob audio z MediaRecorder
     * @returns {Promise<Blob>} - Skonwertowany Blob audio w formacie WAV
     */
    static async convertToWAV(audioBlob) {
        console.log(`Rozpoczynam konwersję audio do WAV. Obecny format: ${audioBlob.type}, rozmiar: ${audioBlob.size} bajtów`);
        
        // Jeśli już mamy WAV, po prostu go zwróć
        if (audioBlob.type === 'audio/wav') {
            console.log("Plik już jest w formacie WAV, pomijam konwersję");
            return audioBlob;
        }
        
        try {
            // Utwórz AudioContext
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log(`Utworzono AudioContext, sample rate: ${audioContext.sampleRate}Hz`);
            
            // Konwertuj Blob na ArrayBuffer
            const arrayBuffer = await audioBlob.arrayBuffer();
            console.log(`Odczytano ${arrayBuffer.byteLength} bajtów danych audio`);
            
            // Dekoduj audio
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            console.log("Zdekodowano audio:", {
                duration: audioBuffer.duration.toFixed(2) + "s",
                numberOfChannels: audioBuffer.numberOfChannels,
                sampleRate: audioBuffer.sampleRate + "Hz",
                length: audioBuffer.length + " próbek"
            });
            
            // Konwertuj AudioBuffer do WAV
            const wavBlob = this._encodeWAV(audioBuffer);
            console.log(`Zakończono konwersję do WAV, nowy rozmiar: ${wavBlob.size} bajtów`);
            
            return wavBlob;
        } catch (error) {
            console.error("Błąd podczas konwersji audio:", error);
            // W razie błędu, zwróć oryginalny blob
            return audioBlob;
        }
    }
    
    /**
     * Konwertuje AudioBuffer do formatu WAV
     * 
     * @private
     * @param {AudioBuffer} audioBuffer - Audio w formacie AudioBuffer
     * @returns {Blob} - Audio w formacie WAV
     */
    static _encodeWAV(audioBuffer) {
        // Parametry WAV
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const bitDepth = 16; // 16-bit audio (standard PCM)
        const bytesPerSample = bitDepth / 8;
        
        // Konwertuj do mono jeśli wielokanałowe
        let samples;
        if (numChannels === 1) {
            samples = audioBuffer.getChannelData(0);
        } else {
            // Miksuj do mono
            samples = new Float32Array(audioBuffer.length);
            for (let channel = 0; channel < numChannels; channel++) {
                const channelData = audioBuffer.getChannelData(channel);
                for (let i = 0; i < samples.length; i++) {
                    samples[i] += channelData[i] / numChannels;
                }
            }
        }
        
        // Tworzymy bufor dla pliku WAV (header + data)
        const dataSize = samples.length * bytesPerSample;
        const wavBuffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(wavBuffer);
        
        // Zapisz nagłówek WAV
        // "RIFF" chunk descriptor
        this._writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        this._writeString(view, 8, 'WAVE');
        
        // "fmt " sub-chunk
        this._writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);             // Subchunk1Size (16 for PCM)
        view.setUint16(20, 1, true);              // AudioFormat (1 = PCM)
        view.setUint16(22, 1, true);              // NumChannels (1 = mono)
        view.setUint32(24, sampleRate, true);     // SampleRate
        view.setUint32(28, sampleRate * 1 * bytesPerSample, true); // ByteRate
        view.setUint16(32, 1 * bytesPerSample, true);    // BlockAlign
        view.setUint16(34, bitDepth, true);       // BitsPerSample
        
        // "data" sub-chunk
        this._writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);      // Subchunk2Size
        
        // Konwertuj Float32 próbki do 16-bit PCM i zapisuj
        const offset = 44;
        for (let i = 0; i < samples.length; i++) {
            // Limit to [-1.0, 1.0] range
            const sample = Math.max(-1, Math.min(1, samples[i]));
            // Convert to 16-bit value
            const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            // Write 16-bit sample
            view.setInt16(offset + (i * 2), value, true);
        }
        
        // Utwórz Blob z prawidłowym typem MIME
        return new Blob([wavBuffer], { type: 'audio/wav' });
    }
    
    /**
     * Zapisuje string do DataView
     * 
     * @private
     * @param {DataView} view - DataView do zapisu
     * @param {number} offset - Offset w bajtach
     * @param {string} string - String do zapisu
     */
    static _writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
    
    /**
     * Metoda główna do optymalizacji audio dla OpenAI API
     * 
     * @param {Blob} audioBlob - Oryginalny blob audio
     * @returns {Promise<Object>} - Obiekt zawierający zoptymalizowane audio i jego metadane
     */
    static async optimizeForOpenAI(audioBlob) {
        console.log("Optymalizuję audio dla OpenAI API", audioBlob);
        
        try {
            // Konwertuj do WAV (najlepszy format dla OpenAI)
            const wavBlob = await this.convertToWAV(audioBlob);
            
            // Generuj unikalną nazwę pliku z odpowiednim rozszerzeniem
            const timestamp = new Date().getTime();
            const filename = `recording-${timestamp}.wav`;
            
            return {
                blob: wavBlob,
                filename: filename,
                mimeType: 'audio/wav'
            };
        } catch (error) {
            console.error("Błąd podczas optymalizacji audio:", error);
            
            // W przypadku błędu, zwróć oryginalny blob z właściwym rozszerzeniem
            let filename = `recording-${Date.now()}`;
            let mimeType = audioBlob.type || 'audio/webm';
            
            if (mimeType.includes('wav')) {
                filename += '.wav';
            } else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
                filename += '.mp3';
            } else if (mimeType.includes('webm')) {
                filename += '.webm';
            } else {
                filename += '.wav'; // Domyślnie WAV
                mimeType = 'audio/wav';
            }
            
            return {
                blob: audioBlob,
                filename: filename,
                mimeType: mimeType
            };
        }
    }
}

// Eksportuj klasę do globalnej przestrzeni
window.AudioConverter = AudioConverter;
