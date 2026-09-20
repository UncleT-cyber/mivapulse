/*
 * MivaPulse - AI-Assisted Exam Preparation Platform
 * Copyright (c) 2026 Anthony Abah. All rights reserved.
 * https://github.com/UncleT-cyber/mivapulse
 * Licensed under the MIT License.
 */

// State management
let selectedFiles = [];

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const fileQueue = document.getElementById('file-queue');
const fileList = document.getElementById('file-list');
const clearFilesBtn = document.getElementById('clear-files-btn');
const extractBtn = document.getElementById('extract-btn');

// Drag and Drop Event Listeners
if (dropzone && fileInput) {
  // Trigger file selection via browse button
  browseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropzone.addEventListener('click', () => fileInput.click());

  // Input change event
  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
  });

  // Drag states
  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files) {
      handleFiles(dt.files);
    }
  });
}

// File Queue Handlers
function handleFiles(files) {
  const newFiles = Array.from(files);
  selectedFiles = [...selectedFiles, ...newFiles];
  renderFileQueue();
}

function renderFileQueue() {
  if (selectedFiles.length === 0) {
    fileQueue.classList.add('hidden');
    return;
  }

  fileQueue.classList.remove('hidden');
  fileList.innerHTML = '';

  selectedFiles.forEach((file, index) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.innerHTML = `
      <span>📄 <strong>${file.name}</strong> (${(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
      <button class="remove-file-btn" data-index="${index}">✕</button>
    `;
    fileList.appendChild(li);
  });

  // Attach event listeners to individual remove buttons
  document.querySelectorAll('.remove-file-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(e.target.getAttribute('data-index'), 10);
      removeFile(index);
    });
  });
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileQueue();
}

clearFilesBtn?.addEventListener('click', () => {
  selectedFiles = [];
  renderFileQueue();
  fileInput.value = '';
});

// Step 2 & 3 Integration Pipeline
extractBtn?.addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;

  const statusTitle = document.getElementById('status-title');
  const statusSubtitle = document.getElementById('status-subtitle');

  // Show Loading UI
  document.getElementById('upload-step')?.classList.add('hidden');
  document.getElementById('processing-step')?.classList.remove('hidden');

  if (statusTitle) statusTitle.textContent = "Step 1/2: Reading Documents...";
  if (statusSubtitle) statusSubtitle.textContent = "Extracting raw text from files...";

  const formData = new FormData();
  selectedFiles.forEach((file) => formData.append('files', file));

  try {
    // 1. EXTRACT RAW TEXT (Step 2)
    const textRes = await fetch('/api/extract-text', {
      method: 'POST',
      body: formData,
    });

    if (!textRes.ok) {
      const errData = await textRes.json();
      throw new Error(errData.error || 'Failed to parse text from documents.');
    }

    const textData = await textRes.json();

    // 2. PASS RAW TEXT TO GROQ AI (Step 3)
    if (statusTitle) statusTitle.textContent = "Step 2/2: Groq AI Processing...";
    if (statusSubtitle) statusSubtitle.textContent = "Structuring questions, option keys, and explanations...";

    const aiRes = await fetch('/api/extract-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: textData.text }),
    });

    if (!aiRes.ok) {
      const errData = await aiRes.json();
      throw new Error(errData.error || 'AI question extraction failed.');
    }

    const aiData = await aiRes.json();
    console.log("MivaPrep Standardized Questions Payload:", aiData.questions);

    // Save extracted result for the Review & Edit Workspace (Step 5)
    sessionStorage.setItem('mivaprep_extracted_questions', JSON.stringify(aiData.questions));

    // Temporary Alert for Verification
    document.getElementById('processing-step')?.classList.add('hidden');
    document.getElementById('upload-step')?.classList.remove('hidden');

    alert(`🎉 Success! Groq formatted ${aiData.count} clean quiz questions.\n\nOpen Console (F12) to inspect standard JSON!`);

  } catch (error) {
    console.error("Pipeline Error:", error);
    alert(`Extraction Pipeline Failed: ${error.message}`);
    
    document.getElementById('processing-step')?.classList.add('hidden');
    document.getElementById('upload-step')?.classList.remove('hidden');
  }
});