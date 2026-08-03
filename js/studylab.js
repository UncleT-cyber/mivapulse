/* ==========================================================================
   MIVAPULSE v2 - STUDYLAB ENGINE
   Upload → Extract → Listen / Quiz / Export
   Browser TTS (default) + ElevenLabs (optional)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const dropzone = document.getElementById('studylabDropzone');
    const fileInput = document.getElementById('studylabFileInput');
    const browseBtn = document.getElementById('studylabBrowseBtn');
    const progressSection = document.getElementById('extractionProgress');
    const progressStatus = document.getElementById('extractionStatus');
    const progressBar = document.getElementById('extractionProgressBar');
    const textArea = document.getElementById('extractedText');
    const generateBtn = document.getElementById('generateQuizBtn');
    const quizStatus = document.getElementById('quizGenStatus');

    // TTS refs
    const playBtn = document.getElementById('playBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const voiceSelector = document.getElementById('voiceSelector');
    const audioStatus = document.getElementById('audioStatus');
    const speedBtns = document.querySelectorAll('.speed-btn');

    // Action buttons
    const launchQuizBtn = document.getElementById('launchQuizBtn');
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const actionBar = document.getElementById('actionSection');

    // Show the sticky action bar once text is extracted
    function showActionBar() {
        if (actionBar) actionBar.classList.add('visible');
    }

    let currentSpeed = 1.0;
    let generatedQuestions = [];
    let extractedRawText = '';

    // ── THEME TOGGLE ──
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const cur = document.documentElement.getAttribute('data-theme');
            const next = cur === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('miva-theme', next);
        });
    }

    // ── SPEED BUTTONS ──
    speedBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            speedBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSpeed = parseFloat(btn.dataset.speed);
        });
    });

    // ── LOAD VOICES (Browser TTS) ──
    function loadBrowserVoices() {
        if (!window.speechSynthesis) {
            console.log('Speech synthesis not supported');
            return;
        }
        const voices = speechSynthesis.getVoices();
        console.log('Voices loaded:', voices.length);
        
        if (!voices.length) {
            console.log('No voices available yet');
            return;
        }
        
        voiceSelector.innerHTML = '';
        const enVoices = voices.filter(v => v.lang.startsWith('en'));
        console.log('English voices:', enVoices.length);
        
        enVoices.forEach((v, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `${v.name} (${v.lang})`;
            voiceSelector.appendChild(opt);
        });
    }
    if (window.speechSynthesis) {
        speechSynthesis.onvoiceschanged = loadBrowserVoices;
        loadBrowserVoices();
    }

    // ── BROWSER TTS ENGINE (default, no API key needed) ──
    let currentUtterance = null;
    let speechPaused = false;

    function speakWithBrowser(text) {
        if (!window.speechSynthesis) {
            audioStatus.textContent = 'Speech not supported in this browser.';
            return;
        }
        
        // Only cancel if something is actually speaking
        if (speechSynthesis.speaking || speechSynthesis.pending) {
            speechSynthesis.cancel();
            // Wait longer for cancel to fully complete
            setTimeout(() => startSpeaking(text), 500);
        } else {
            // Nothing speaking, start immediately
            startSpeaking(text);
        }
    }
    
    function startSpeaking(text) {
        console.log('startSpeaking called with text length:', text.length);
        
        let voices = speechSynthesis.getVoices();
        console.log('Voices available:', voices.length);
        
        if (voices.length === 0) {
            audioStatus.textContent = 'Loading voices... Please try again.';
            return;
        }
        
        // Test with very short text first to ensure audio works
        const testText = 'Hello, this is a test.';
        console.log('Testing with short text first...');
        
        // Try to find a reliable voice (not Samantha which can be buggy)
        const enVoices = voices.filter(v => v.lang.startsWith('en'));
        console.log('English voices:', enVoices.length);
        
        // Prefer Google US English or Microsoft voices over Samantha
        let selectedVoice = null;
        const preferredVoices = ['Google US English', 'Microsoft David', 'Microsoft Zira', 'Daniel', 'Karen'];
        for (let pref of preferredVoices) {
            const found = enVoices.find(v => v.name.includes(pref));
            if (found) {
                selectedVoice = found;
                console.log('Found preferred voice:', found.name);
                break;
            }
        }
        
        // Fallback to first English voice if no preferred found
        if (!selectedVoice && enVoices.length > 0) {
            selectedVoice = enVoices[0];
            console.log('Using fallback voice:', selectedVoice.name);
        }
        
        // Truncate long text to first 1000 chars for better performance
        const speakText = text.length > 1000 ? text.substring(0, 1000) : text;
        console.log('Text to speak:', speakText.substring(0, 100) + '...');
        
        const utterance = new SpeechSynthesisUtterance(speakText);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
        
        utterance.rate = parseFloat(currentSpeed) || 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        utterance.onstart = () => { 
            audioStatus.textContent = 'Reading aloud...';
            console.log('✓ Speech started successfully');
            // Update play button to show pause
            if (playBtn) {
                playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                playBtn.classList.add('playing');
            }
        };
        utterance.onend = () => { 
            audioStatus.textContent = 'Finished reading.';
            console.log('✓ Speech ended');
            // Reset play button and state
            speechPaused = false;
            if (playBtn) {
                playBtn.innerHTML = '<i class="fas fa-play"></i>';
                playBtn.classList.remove('playing');
            }
        };
        utterance.onerror = (e) => { 
            console.error('✗ Speech error:', e.error);
            if (e.error === 'interrupted') {
                console.log('Speech interrupted, retrying...');
                setTimeout(() => {
                    const retry = new SpeechSynthesisUtterance(speakText);
                    const voices = speechSynthesis.getVoices();
                    const enVoices = voices.filter(v => v.lang.startsWith('en'));
                    if (enVoices.length > 0) {
                        const selIdx = parseInt(voiceSelector.value) || 0;
                        retry.voice = enVoices[selIdx % enVoices.length];
                    }
                    retry.rate = parseFloat(currentSpeed) || 1.0;
                    retry.onstart = () => { audioStatus.textContent = 'Reading aloud...'; };
                    retry.onend = () => { audioStatus.textContent = 'Finished reading.'; };
                    retry.onerror = (e2) => { 
                        if (e2.error !== 'canceled' && e2.error !== 'interrupted') {
                            audioStatus.textContent = 'Speech error: ' + e2.error; 
                        }
                    };
                    speechSynthesis.speak(retry);
                }, 200);
            } else if (e.error !== 'canceled') {
                audioStatus.textContent = 'Speech error: ' + e.error; 
            }
        };
        
        currentUtterance = utterance;
        
        try {
            console.log('Calling speechSynthesis.speak()...');
            speechSynthesis.speak(utterance);
            console.log('✓ Speak called. Checking status...');
            
            // Check status after a moment
            setTimeout(() => {
                console.log('Status check - speaking:', speechSynthesis.speaking, 'paused:', speechSynthesis.paused, 'pending:', speechSynthesis.pending);
                if (speechSynthesis.paused && !speechSynthesis.speaking) {
                    console.log('Speech was paused, resuming...');
                    speechSynthesis.resume();
                }
                if (!speechSynthesis.speaking && !speechSynthesis.pending) {
                    console.log('⚠ Speech not started! Trying alternative method...');
                    // Try with a very short text
                    const testUtterance = new SpeechSynthesisUtterance('Hello');
                    testUtterance.onstart = () => console.log('Test speech started');
                    testUtterance.onerror = (e) => console.error('Test speech error:', e.error);
                    speechSynthesis.speak(testUtterance);
                }
            }, 300);
        } catch (err) {
            console.error('✗ Speech exception:', err);
            audioStatus.textContent = 'Speech error: ' + err.message;
        }
    }

    function pauseBrowserSpeech() {
        if (window.speechSynthesis.speaking && !speechSynthesis.paused) {
            speechSynthesis.pause();
            speechPaused = true;
            audioStatus.textContent = 'Paused.';
            console.log('Speech paused');
        }
    }

    function resumeBrowserSpeech() {
        if (window.speechSynthesis.paused && speechPaused) {
            speechSynthesis.resume();
            speechPaused = false;
            audioStatus.textContent = 'Reading aloud...';
            console.log('Speech resumed');
            
            // Chrome bug workaround: if resume doesn't work, restart
            setTimeout(() => {
                if (speechSynthesis.paused && speechPaused) {
                    console.log('Resume failed, restarting speech...');
                    speechSynthesis.cancel();
                    speechPaused = false;
                    const text = textArea.value.trim();
                    if (text) {
                        speakWithBrowser(text);
                    }
                }
            }, 500);
        }
    }

    function stopBrowserSpeech() {
        if (window.speechSynthesis) {
            speechSynthesis.cancel();
            speechPaused = false;
            audioStatus.textContent = 'Stopped.';
        }
    }

    // ── TTS BUTTON HANDLERS ──
    function updatePlayButton(isPlaying) {
        if (!playBtn) return;
        if (isPlaying) {
            playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            playBtn.classList.add('playing');
            playBtn.title = 'Pause';
        } else {
            playBtn.innerHTML = '<i class="fas fa-play"></i>';
            playBtn.classList.remove('playing');
            playBtn.title = 'Play';
        }
    }
    
    if (playBtn) playBtn.addEventListener('click', () => {
        const text = textArea.value.trim();
        console.log('Play/Pause clicked. Text length:', text.length);
        console.log('Current state - speaking:', speechSynthesis.speaking, 'paused:', speechSynthesis.paused, 'speechPaused:', speechPaused);
        
        if (!text) { 
            audioStatus.textContent = 'No text to read. Extract text first.'; 
            return; 
        }
        
        // Check if speech is paused (either by API or by our flag)
        const isPaused = speechSynthesis.paused || speechPaused;
        const isPlaying = speechSynthesis.speaking && !speechSynthesis.paused;
        
        // If paused, resume
        if (isPaused) {
            console.log('Resuming speech...');
            speechSynthesis.resume();
            speechPaused = false;
            audioStatus.textContent = 'Reading aloud...';
            updatePlayButton(true);
            return;
        }
        
        // If playing, pause
        if (isPlaying) {
            console.log('Pausing speech...');
            speechSynthesis.pause();
            speechPaused = true;
            audioStatus.textContent = 'Paused.';
            updatePlayButton(false);
            return;
        }
        
        // Otherwise start new speech
        console.log('Starting new speech...');
        speechPaused = false;
        speakWithBrowser(text);
        updatePlayButton(true);
    });
    if (pauseBtn) pauseBtn.addEventListener('click', () => { 
        pauseBrowserSpeech(); 
        updatePlayButton(false);
    });
    if (stopBtn) stopBtn.addEventListener('click', () => { 
        stopBrowserSpeech(); 
        updatePlayButton(false);
    });

    // ── FILE UPLOAD ──
    if (browseBtn) browseBtn.addEventListener('click', () => fileInput.click());
    if (fileInput) fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });
    if (dropzone) {
        ['dragover','dragenter'].forEach(ev => dropzone.addEventListener(ev, (e) => {
            e.preventDefault(); dropzone.classList.add('dragover');
        }));
        ['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, (e) => {
            e.preventDefault(); dropzone.classList.remove('dragover');
        }));
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
        });
    }

    async function handleFile(file) {
        progressSection.style.display = 'block';
        progressStatus.textContent = 'Extracting text...';
        progressBar.style.width = '0%';
        try {
            let text = '';
            if (file.type === 'application/pdf') {
                text = await extractPdfText(file);
            } else if (file.type.startsWith('image/')) {
                text = await extractImageText(file);
            } else if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
                text = await file.text();
            } else {
                throw new Error('Unsupported file format. Use PDF, images, or text files.');
            }
            textArea.value = text;
            extractedRawText = text;
            progressStatus.textContent = 'Extraction complete!';
            showActionBar();
            progressBar.style.width = '100%';
        } catch (err) {
            progressStatus.textContent = 'Error: ' + err.message;
        }
    }

    async function extractPdfText(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(' ') + '\n\n';
            progressBar.style.width = `${(i / pdf.numPages) * 100}%`;
        }
        return text;
    }

    async function extractImageText(file) {
        progressStatus.textContent = 'Running OCR...';
        const { data: { text } } = await Tesseract.recognize(file, 'eng', {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    progressBar.style.width = `${Math.round(m.progress * 100)}%`;
                }
            }
        });
        return text;
    }

    // ── GENERATE QUIZ QUESTIONS (AI reformats into quiz-engine format) ──
    if (generateBtn) generateBtn.addEventListener('click', async () => {
        const text = textArea.value.trim();
        if (!text) { quizStatus.textContent = 'No text to generate from.'; return; }
        quizStatus.textContent = 'AI is formatting questions...';
        quizStatus.style.color = 'var(--text-secondary)';
        try {
            const resp = await fetch('/api/extract-questions', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            const data = await resp.json();
            if (data.success && data.questions && data.questions.length > 0) {
                generatedQuestions = data.questions;
                quizStatus.textContent = `Generated ${data.questions.length} questions! Ready to study or export.`;
                quizStatus.style.color = 'var(--success)';
                // Enable action buttons
                if (launchQuizBtn) launchQuizBtn.disabled = false;
                if (exportJsonBtn) exportJsonBtn.disabled = false;
            } else {
                quizStatus.textContent = 'No questions could be extracted. Try different content.';
                quizStatus.style.color = 'var(--danger)';
            }
        } catch (err) {
            quizStatus.textContent = 'Generation failed. Check connection.';
            quizStatus.style.color = 'var(--danger)';
        }
    });

    // ── LAUNCH QUIZ ENGINE (navigates to quiz page with generated questions) ──
    if (launchQuizBtn) launchQuizBtn.addEventListener('click', () => {
        if (generatedQuestions.length === 0) {
            quizStatus.textContent = 'Generate questions first!';
            return;
        }
        // Save questions to localStorage for quiz engine to pick up
        localStorage.setItem('mivapulse_studylab_quiz', JSON.stringify({
            questions: generatedQuestions,
            source: 'StudyLab',
            timestamp: Date.now()
        }));
        window.location.href = 'quiz.html?source=studylab';
    });

    // ── EXPORT JSON ──
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', () => {
        if (generatedQuestions.length === 0) { quizStatus.textContent = 'Generate questions first!'; return; }
        const blob = new Blob([JSON.stringify(generatedQuestions, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'studylab-questions.json'; a.click();
        URL.revokeObjectURL(url);
        quizStatus.textContent = 'Exported as JSON!';
    });

    // ── EXPORT AS TEXT/PDF ──
    if (exportPdfBtn) exportPdfBtn.addEventListener('click', () => {
        const text = textArea.value.trim();
        if (!text) { quizStatus.textContent = 'No text to export.'; return; }
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'studylab-notes.txt'; a.click();
        URL.revokeObjectURL(url);
        quizStatus.textContent = 'Exported as text file!';
    });

    // ── BACK LINK ──
    document.getElementById('backToHome')?.addEventListener('click', (e) => {
        e.preventDefault(); window.location.href = 'index.html';
    });
});
