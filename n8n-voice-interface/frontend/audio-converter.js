/**
 * Moduł do konwersji i optymalizacji formatu audio po stronie przeglądarki
 * dla lepszej kompatybilności z API OpenAI.
 */
class AudioConverter {
    /**
     * Konwertuje Blob audio do formatu WAV lub MP3
     * 
     * @param {Blob} audioBlob - Oryginalny Blob audio z MediaRecorder
     * @param {string} targetFormat - Format docelowy ('wav' lub 'mp3')
     * @param {Object} options - Opcje konwersji
     * @returns {Promise<Blob>} - Skonwertowany Blob audio
     */
    static async convertAudioFormat(audioBlob, targetFormat = 'wav', options = {}) {
        console.log(`Rozpoczynam konwersję audio do formatu: ${targetFormat}`);
        
        // Domyślne parametry
        const defaultOptions = {
            sampleRate: 44100,     // 44.1 kHz (standard CD)
            channels: 1,           // Mono (wymagane przez OpenAI)
            bitDepth: 16           // 16-bit PCM
        };
        
        // Połącz z opcjami użytkownika
        const settings = { ...defaultOptions, ...options };
        console.log("Parametry konwersji:", settings);
        
        try {
            // Utwórz AudioContext
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Konwertuj Blob na ArrayBuffer
            const arrayBuffer = await audioBlob.arrayBuffer();
            
            // Dekoduj audio
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            console.log("Zdekodowano audio:", {
                duration: audioBuffer.duration,
                numberOfChannels: audioBuffer.numberOfChannels,
                sampleRate: audioBuffer.sampleRate
            });
            
            // Konwertuj do wybranego formatu
            if (targetFormat === 'wav') {
                return this._convertToWAV(audioBuffer, settings);
            } else if (targetFormat === 'mp3') {
                // MP3 jest trudniejszy do implementacji w czystym JS
                // Tutaj tylko przygotowujemy dane, faktyczną konwersję zrobi backend
                return this._prepareForMP3Conversion(audioBuffer, settings);
            }
            
            throw new Error(`Nieobsługiwany format: ${targetFormat}`);
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
     * @param {Object} options - Opcje konwersji
     * @returns {Blob} - Audio w formacie WAV
     */
    static _convertToWAV(audioBuffer, options) {
        console.log("Konwertuję do WAV z opcjami:", options);
        
        const { sampleRate, channels, bitDepth } = options;
        const bytesPerSample = bitDepth / 8;
        const blockAlign = channels * bytesPerSample;
        
        // Przygotuj próbki audio
        let samples;
        if (audioBuffer.numberOfChannels === 1) {
            // Już mono
            samples = audioBuffer.getChannelData(0);
        } else {
            // Miksuj do mono jeśli wielokanałowe
            samples = new Float32Array(audioBuffer.length);
            for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                const channelData = audioBuffer.getChannelData(channel);
                for (let i = 0; i < samples.length; i++) {
                    samples[i] += channelData[i] / audioBuffer.numberOfChannels;
                }
            }
        }
        
        // Resampling do docelowej częstotliwości próbkowania jeśli potrzebny
        if (audioBuffer.sampleRate !== sampleRate) {
            samples = this._resampleAudio(samples, audioBuffer.sampleRate, sampleRate);
        }
        
        // Tworzymy bufor dla pliku WAV
        const wavBuffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
        const view = new DataView(wavBuffer);
        
        // Nagłówki WAV
        this._writeWAVHeaders(view, {
            sampleRate: sampleRate,
            channels: channels,
            bitDepth: bitDepth,
            dataSize: samples.length * bytesPerSample
        });
        
        // Zapisz próbki audio
        const offset = 44;
        this._floatTo16BitPCM(view, offset, samples);
        
        // Zwróć jako Blob
        return new Blob([wavBuffer], { type: 'audio/wav' });
    }
    
    /**
     * Przygotowuje AudioBuffer do konwersji MP3 - tutaj konwersja do WAV jako fallback
     * 
     * @private
     * @param {AudioBuffer} audioBuffer - Audio w formacie AudioBuffer
     * @param {Object} options - Opcje konwersji
     * @returns {Blob} - Audio w formacie przygotowanym do konwersji MP3
     */
    static _prepareForMP3Conversion(audioBuffer, options) {
        console.log("Przygotowuję dane do konwersji MP3 (fallback do WAV)");
        // Jako że konwersja do MP3 w przeglądarce jest złożona,
        // używamy WAV jako formatu pośredniego, który zostanie przekonwertowany po stronie serwera
        return this._convertToWAV(audioBuffer, options);
    }
    
    /**
     * Zapisuje nagłówki WAV do DataView
     * 
     * @private
     * @param {DataView} view - DataView do zapisu nagłówków
     * @param {Object} options - Parametry nagłówka
     */
    static _writeWAVHeaders(view, options) {
        const { sampleRate, channels, bitDepth, dataSize } = options;
        
        // "RIFF" chunk descriptor
        this._writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        this._writeString(view, 8, 'WAVE');
        
        // "fmt " sub-chunk
        this._writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);           // Subchunk1Size
        view.setUint16(20, 1, true);            // AudioFormat (1 = PCM)
        view.setUint16(22, channels, true);     // NumChannels
        view.setUint32(24, sampleRate, true);   // SampleRate
        view.setUint32(28, sampleRate * channels * bitDepth / 8, true); // ByteRate
        view.setUint16(32, channels * bitDepth / 8, true);              // BlockAlign
        view.setUint16(34, bitDepth, true);                             // BitsPerSample
        
        // "data" sub-chunk
        this._writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);     // Subchunk2Size
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
     * Konwertuje próbki Float32 do 16-bit PCM
     * 
     * @private
     * @param {DataView} view - DataView do zapisu
     * @param {number} offset - Offset w bajtach
     * @param {Float32Array} samples - Próbki audio
     */
    static _floatTo16BitPCM(view, offset, samples) {
        for (let i = 0; i < samples.length; i++) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
            view.setInt16(offset + i * 2, val, true);
        }
    }
    
    /**
     * Prostý resampling audio
     * 
     * @private
     * @param {Float32Array} samples - Próbki audio
     * @param {number} fromSampleRate - Oryginalna częstotliwość próbkowania
     * @param {number} toSampleRate - Docelowa częstotliwość próbkowania
     * @returns {Float32Array} - Zresamplowane próbki
     */
    static _resampleAudio(samples, fromSampleRate, toSampleRate) {
        if (fromSampleRate === toSampleRate) {
            return samples;
        }
        
        const ratio = fromSampleRate / toSampleRate;
        const newLength = Math.round(samples.length / ratio);
        const result = new Float32Array(newLength);
        
        for (let i = 0; i < newLength; i++) {
            const pos = i * ratio;
            const leftPos = Math.floor(pos);
            const rightPos = Math.ceil(pos);
            const weight = pos - leftPos;
            
            if (rightPos >= samples.length) {
                result[i] = samples[leftPos];
            } else {
                result[i] = samples[leftPos] * (1 - weight) + samples[rightPos] * weight;
            }
        }
        
        return result;
    }
    
    /**
     * Konwertuje i optymalizuje Blob audio do formatu najlepszego dla OpenAI
     * 
     * @param {Blob} audioBlob - Oryginalny Blob audio
     * @returns {Promise<Blob>} - Zoptymalizowany Blob audio
     */
    static async optimizeForOpenAI(audioBlob) {
        console.log("Optymalizuję audio dla OpenAI API:", audioBlob);
        
        // WAV to najbardziej niezawodny format dla API OpenAI
        return await this.convertAudioFormat(audioBlob, 'wav', {
            sampleRate: 44100,  // 44.1kHz
            channels: 1,        // Mono
            bitDepth: 16        // 16-bit
        });
    }
}

// Eksportuj klasę do globalnej przestrzeni
window.AudioConverter = AudioConverter;
