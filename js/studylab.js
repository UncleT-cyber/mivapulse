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

    // ── QUESTION TYPE PICKER ──
    let questionType = 'all'; // 'all' | 'mcq' | 'essay'
    const qtypeBtns = document.querySelectorAll('.qtype-btn');
    qtypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            qtypeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            questionType = btn.dataset.qtype;
            console.log('Question type set to:', questionType);
        });
    });

    // ── LOAD VOICES (Browser TTS) ──
    // English voices sorted with OFFLINE (localService) voices first.
    // Chrome's network "Google" voices (localService=false) fire onstart but
    // often produce NO audio — the #1 cause of silent TTS in Chrome. We
    // therefore prefer and default to offline voices, which always work.
    let englishVoices = [];
    const isChrome = /Chrome\//.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent);

    function sortVoicesLocalFirst(list) {
        return [...list].sort((a, b) => {
            if (a.localService !== b.localService) return a.localService ? -1 : 1;
            if (a.default !== b.default) return a.default ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    }

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

        const enVoices = voices.filter(v => v.lang && v.lang.startsWith('en'));
        englishVoices = sortVoicesLocalFirst(enVoices);
        const localCount = englishVoices.filter(v => v.localService).length;
        console.log('English voices:', englishVoices.length, '| offline:', localCount, '| online:', englishVoices.length - localCount);

        voiceSelector.innerHTML = '';
        englishVoices.forEach((v, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            const tag = v.localService ? '' : '  [online]';
            opt.textContent = `${v.name} (${v.lang})${tag}`;
            voiceSelector.appendChild(opt);
        });
        // Default to the best offline voice (index 0 after sort)
        if (englishVoices.length) voiceSelector.value = '0';
    }
    if (window.speechSynthesis) {
        speechSynthesis.onvoiceschanged = loadBrowserVoices;
        loadBrowserVoices();
    }

    // ── BROWSER TTS ENGINE (default, no API key needed) ──
    // Chunked queue engine. Pause/Resume is implemented as STOP + REMEMBER,
    // because Chrome's native pause()/resume() is unreliable with network
    // voices and freezes the engine. We never call pause()/resume() at all.
    let currentUtterance = null;
    let speechPaused = false;
    let speechQueue = [];     // chunks of text to speak in order
    let queueIndex = 0;       // index of chunk currently being spoken
    let speechToken = 0;      // increments to invalidate stale callbacks

    // Split text into chunks of <= maxLen chars, breaking on sentence boundaries
    function splitIntoChunks(text, maxLen = 200) {
        const clean = text.replace(/\s+/g, ' ').trim();
        const chunks = [];
        let remaining = clean;
        while (remaining.length > 0) {
            if (remaining.length <= maxLen) {
                chunks.push(remaining);
                break;
            }
            let breakAt = -1;
            const slice = remaining.substring(0, maxLen);
            for (const terminator of ['. ', '? ', '! ']) {
                breakAt = Math.max(breakAt, slice.lastIndexOf(terminator));
            }
            if (breakAt < maxLen * 0.5) {
                breakAt = slice.lastIndexOf(' '); // fall back to last space
            }
            if (breakAt <= 0) breakAt = maxLen;
            chunks.push(remaining.substring(0, breakAt + 1).trim());
            remaining = remaining.substring(breakAt + 1);
        }
        return chunks;
    }

    // Resolve the voice the user selected in the dropdown (offline-first list)
    function getSelectedVoice() {
        if (!englishVoices.length) {
            const all = speechSynthesis.getVoices();
            return all.find(v => v.lang && v.lang.startsWith('en')) || all[0] || null;
        }
        const idx = parseInt(voiceSelector.value, 10);
        if (!isNaN(idx) && englishVoices[idx]) return englishVoices[idx];
        return englishVoices[0]; // best offline voice
    }

    // Begin speaking from the current queueIndex with a fresh token.
    // Only cancels the engine when something is actually active — cancelling
    // an idle engine right before speak() triggers Chrome's 'interrupted' bug.
    function speakFromCurrentChunk() {
        speechToken++;
        const token = speechToken;
        // Chrome can boot the engine in a stuck-paused state; resume clears it.
        if (speechSynthesis.paused) speechSynthesis.resume();
        const engineBusy = speechSynthesis.speaking || speechSynthesis.pending || speechSynthesis.paused;
        if (engineBusy) {
            speechSynthesis.cancel();
            // Chrome sometimes keeps the paused flag set even after cancel — clear it
            if (speechSynthesis.paused) speechSynthesis.resume();
            // Brief delay lets cancel() fully flush before speaking again
            setTimeout(() => speakChunk(token, 0), 200);
        } else {
            // Engine idle — speak immediately inside the user gesture (no delay)
            speakChunk(token, 0);
        }
    }

    function speakWithBrowser(text) {
        if (!window.speechSynthesis) {
            audioStatus.textContent = 'Speech not supported in this browser.';
            return;
        }
        speechQueue = splitIntoChunks(text);
        queueIndex = 0;
        speechPaused = false;

        const voice = getSelectedVoice();
        console.log('TTS: starting,', speechQueue.length, 'chunks, voice:', voice ? voice.name : 'system default');
        // IMPORTANT: speak synchronously within the user's click gesture.
        // Chrome's autoplay policy blocks speechSynthesis.speak() if it is
        // deferred outside the gesture (e.g. waiting for voiceschanged).
        // If voices aren't loaded yet, Chrome falls back to the system voice,
        // and the selected voice takes over for subsequent chunks/plays.
        speakFromCurrentChunk();
    }

    function speakChunk(token, attempt = 0) {
        if (token !== speechToken) return; // stale callback from old session

        if (queueIndex >= speechQueue.length) {
            audioStatus.textContent = 'Finished reading.';
            speechPaused = false;
            updatePlayButton(false);
            console.log('✓ All', speechQueue.length, 'chunks read');
            return;
        }

        const chunk = speechQueue[queueIndex];
        const utterance = new SpeechSynthesisUtterance(chunk);
        const voice = getSelectedVoice();
        if (voice) utterance.voice = voice;
        utterance.rate = parseFloat(currentSpeed) || 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        let started = false;
        let lastActivity = Date.now();

        utterance.onstart = () => {
            if (token !== speechToken) return;
            started = true;
            lastActivity = Date.now();
            audioStatus.textContent = `Reading aloud... (part ${queueIndex + 1} of ${speechQueue.length})`;
            updatePlayButton(true);
        };
        utterance.onend = () => {
            if (token !== speechToken) return;
            queueIndex++;
            speakChunk(token, 0); // speak the next chunk
        };
        utterance.onerror = (e) => {
            if (token !== speechToken) return;
            if (e.error === 'canceled' || e.error === 'interrupted') return;
            console.error('✗ Speech error:', e.error);
            if (e.error === 'not-allowed') {
                // Chrome autoplay policy: needs a direct user gesture. The click
                // that triggered this should count, but if blocked, prompt a re-click.
                audioStatus.textContent = 'Browser blocked audio — click Play once more.';
            } else {
                audioStatus.textContent = 'Speech error: ' + e.error;
            }
            speechPaused = false;
            updatePlayButton(false);
        };

        currentUtterance = utterance;
        speechSynthesis.speak(utterance);

        // KEEP-ALIVE: Chrome can freeze mid-utterance on long sessions. If the
        // engine stops reporting activity while an utterance is unfinished,
        // flush and re-speak the current chunk.
        const onBoundary = () => { lastActivity = Date.now(); };
        utterance.addEventListener('boundary', onBoundary);
        const heartbeat = setInterval(() => {
            if (token !== speechToken) { clearInterval(heartbeat); return; }
            if (!speechSynthesis.speaking && !speechSynthesis.pending) {
                clearInterval(heartbeat); // utterance ended normally (onend handles it)
                return;
            }
            if (speechSynthesis.paused) return; // user paused via our flow? no — we never pause the engine; treat as stuck below
            if (Date.now() - lastActivity > 20000) {
                console.log('⚠ Engine frozen mid-chunk — restarting chunk');
                clearInterval(heartbeat);
                speechSynthesis.cancel();
                setTimeout(() => speakChunk(token, Math.min(attempt + 1, 2)), 250);
            }
        }, 5000);
        utterance.addEventListener('end', () => clearInterval(heartbeat), { once: true });
        utterance.addEventListener('error', () => clearInterval(heartbeat), { once: true });

        // WATCHDOG: Chrome sometimes accepts speak() but never starts audio.
        // If the utterance hasn't started within 2.5s, flush the engine and
        // retry this chunk once.
        setTimeout(() => {
            if (token !== speechToken) return;
            if (started || speechSynthesis.speaking) return; // all good
            if (attempt >= 2) {
                console.error('✗ Speech failed to start after retries');
                audioStatus.textContent = 'Speech failed to start. Try changing the voice.';
                speechPaused = false;
                updatePlayButton(false);
                return;
            }
            console.log('⚠ Utterance never started — flushing engine and retrying (attempt', attempt + 1, ')');
            speechSynthesis.cancel();
            if (speechSynthesis.paused) speechSynthesis.resume(); // clear stuck state
            setTimeout(() => speakChunk(token, attempt + 1), 250);
        }, 2500);
    }

    // Pause = stop the engine but remember exactly where we were.
    // queueIndex still points at the interrupted chunk, so Play resumes there.
    function pauseBrowserSpeech() {
        if (!window.speechSynthesis || speechQueue.length === 0) return;
        speechToken++; // kills any in-flight callbacks via the token guard
        speechSynthesis.cancel();
        speechPaused = true;
        const pos = Math.min(queueIndex + 1, speechQueue.length);
        audioStatus.textContent = `Paused at part ${pos} of ${speechQueue.length}. Press play to continue.`;
        updatePlayButton(false);
    }

    function stopBrowserSpeech() {
        if (window.speechSynthesis) {
            speechToken++;
            speechSynthesis.cancel();
            speechPaused = false;
            speechQueue = [];
            queueIndex = 0;
            audioStatus.textContent = 'Stopped.';
            updatePlayButton(false);
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
        if (!text) {
            audioStatus.textContent = 'No text to read. Extract text first.';
            return;
        }

        const hasRemainingQueue = speechQueue.length > 0 && queueIndex < speechQueue.length;

        // Currently playing — pause (stop + remember position)
        if (speechSynthesis.speaking || speechSynthesis.pending) {
            pauseBrowserSpeech();
            return;
        }

        // Paused with a queue — resume from the exact chunk we stopped at
        if (speechPaused && hasRemainingQueue) {
            speechPaused = false;
            speakFromCurrentChunk();
            return;
        }

        // Nothing active — start fresh from the beginning
        speakWithBrowser(text);
    });

    // Switching voices mid-session: restart current chunk with the new voice
    if (voiceSelector) voiceSelector.addEventListener('change', () => {
        const voice = getSelectedVoice();
        const label = voice ? voice.name : 'default';
        if (speechSynthesis.speaking || speechSynthesis.pending) {
            // Keep the queue, re-speak the current chunk with the new voice
            audioStatus.textContent = `Switched voice: ${label}`;
            speakFromCurrentChunk();
        } else if (speechPaused) {
            audioStatus.textContent = `Paused (voice: ${label}). Press play to continue.`;
        } else {
            audioStatus.textContent = `Voice set: ${label}`;
        }
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
        const typeLabel = questionType === 'mcq' ? 'MCQ' : questionType === 'essay' ? 'Essay' : 'Mixed';
        quizStatus.textContent = `AI is formatting ${typeLabel} questions...`;
        quizStatus.style.color = 'var(--text-secondary)';
        try {
            const resp = await fetch('/api/extract-questions', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, questionType })
            });
            const data = await resp.json();
            if (!resp.ok || !data.success) {
                quizStatus.textContent = data.error || 'Generation failed. Please try again.';
                quizStatus.style.color = 'var(--danger)';
                return;
            }
            if (data.success && data.questions && data.questions.length > 0) {
                // Enforce the chosen type on the client side as a safety net
                let filtered = data.questions;
                if (questionType === 'mcq') {
                    filtered = filtered.filter(q => (q.type || 'mcq') !== 'essay');
                } else if (questionType === 'essay') {
                    filtered = filtered.filter(q => q.type === 'essay');
                }
                if (filtered.length === 0) {
                    quizStatus.textContent = 'No questions of the selected type were found. Try "Mixed" or different content.';
                    quizStatus.style.color = 'var(--danger)';
                    return;
                }
                generatedQuestions = filtered;
                let msg = `Extracted ${data.questions.length} questions`;
                if (data.estimatedInSource > 0) {
                    msg += ` (source has ~${data.estimatedInSource} numbered items)`;
                }
                if (data.inputTruncated) {
                    msg += ' — document was too long, only the first portion was processed';
                    quizStatus.style.color = 'var(--warning, #f59e0b)';
                } else if (data.truncated) {
                    msg += ' — output was cut off; try a shorter document for full extraction';
                    quizStatus.style.color = 'var(--warning, #f59e0b)';
                } else {
                    quizStatus.style.color = 'var(--success)';
                }
                quizStatus.textContent = msg + '. Ready to study or export.';
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
