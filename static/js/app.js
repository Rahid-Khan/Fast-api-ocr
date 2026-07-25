let currentJobId = null;
let pollTimer = null;
let progressSource = null;
let streamSource = null;
let selectedFile = null;
let streamText = '';
let streamIdx = 0;
let typewriterTimer = null;

const API = '/api';

// Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const btnRemove = document.getElementById('btn-remove');
const btnStart = document.getElementById('btn-start');
const gpuWarning = document.getElementById('gpu-warning');

// Views
function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');
}

// GPU status check
async function checkGpu() {
    try {
        const res = await fetch(API + '/gpu-status');
        const data = await res.json();
        if (data.warning) {
            gpuWarning.textContent = data.warning;
            gpuWarning.classList.remove('hidden');
        }
    } catch (e) { /* ignore */ }
}

// File handling
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files.length) handleFile(fileInput.files[0]); });

function handleFile(file) {
    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatSize(file.size);
    filePreview.classList.remove('hidden');
    btnStart.disabled = false;
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

btnRemove.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    filePreview.classList.add('hidden');
    btnStart.disabled = true;
});

// Upload & process
btnStart.addEventListener('click', async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        btnStart.disabled = true;
        btnStart.textContent = 'Uploading...';

        const res = await fetch(API + '/upload', { method: 'POST', body: formData });
        if (!res.ok) {
            const err = await res.json();
            alert(err.detail || 'Upload failed');
            btnStart.disabled = false;
            btnStart.textContent = 'Start OCR';
            return;
        }

        const data = await res.json();
        currentJobId = data.id;
        document.getElementById('job-id-display').textContent = currentJobId;

        // Reset streaming state
        streamText = '';
        streamIdx = 0;
        document.getElementById('stream-text').textContent = '';
        document.getElementById('char-counter').textContent = '0 chars';
        document.getElementById('stream-cursor').classList.remove('hidden');

        // Show document preview
        showDocumentPreview(selectedFile);

        showView('processing');
        startProgressSSE();
        startStreamSSE();
        startJobPolling();
    } catch (e) {
        alert('Upload failed: ' + e.message);
        btnStart.disabled = false;
        btnStart.textContent = 'Start OCR';
    }
});

// Document preview
function showDocumentPreview(file) {
    const container = document.getElementById('doc-preview');
    const ext = file.name.split('.').pop().toLowerCase();

    if (['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'tif', 'webp'].includes(ext)) {
        const reader = new FileReader();
        reader.onload = (e) => {
            container.innerHTML = `<img src="${e.target.result}" alt="Document preview">`;
        };
        reader.readAsDataURL(file);
    } else if (ext === 'pdf') {
        // Show PDF icon placeholder
        container.innerHTML = `
            <div style="text-align:center;padding:2rem;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:64px;height:64px;color:var(--text-muted);margin-bottom:1rem;">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10,9 9,9 8,9"/>
                </svg>
                <p style="color:var(--text-muted);font-size:0.9rem;">${file.name}</p>
                <p style="color:var(--text-muted);font-size:0.8rem;">PDF document</p>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div style="text-align:center;padding:2rem;">
                <p style="color:var(--text-muted);font-size:0.9rem;">${file.name}</p>
                <p style="color:var(--text-muted);font-size:0.8rem;">${ext.toUpperCase()} file</p>
            </div>
        `;
    }
}

// Progress ring update
function updateProgressRing(percent) {
    const circle = document.getElementById('progress-ring-fill');
    const label = document.getElementById('progress-percent');
    if (!circle || !label) return;
    const circumference = 2 * Math.PI * 34;
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDashoffset = offset;
    label.textContent = Math.round(percent) + '%';
}

// SSE: Real-time progress
function startProgressSSE() {
    stopProgressSSE();
    progressSource = new EventSource(API + '/progress/stream');
    progressSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const statusEl = document.getElementById('processing-status');
        const titleEl = document.getElementById('processing-title');
        const stageMap = {
            'idle': 'Waiting...',
            'loading_model': 'Loading Model',
            'model_ready': 'Model Ready',
            'converting': 'Converting Document',
            'inferring': 'Running OCR',
            'decoding': 'Decoding Output',
            'done': 'Complete',
            'error': 'Error',
        };
        const stageName = stageMap[data.stage] || data.stage;
        titleEl.textContent = stageName;
        statusEl.textContent = data.detail || stageName;
        updateProgressRing(data.percent);

        if (data.stage === 'done' || data.stage === 'error') {
            stopProgressSSE();
        }
    };
    progressSource.onerror = () => {
        stopProgressSSE();
    };
}

function stopProgressSSE() {
    if (progressSource) { progressSource.close(); progressSource = null; }
}

// SSE: Streaming text output
function startStreamSSE() {
    stopStreamSSE();
    streamSource = new EventSource(`${API}/jobs/${currentJobId}/stream`);
    streamSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'chunk') {
            streamText += data.text;
            startTypewriter();
        } else if (data.type === 'done') {
            stopStreamSSE();
            // Finish typewriter
            finishTypewriter();
        }
    };
    streamSource.onerror = () => {
        stopStreamSSE();
    };
}

function stopStreamSSE() {
    if (streamSource) { streamSource.close(); streamSource = null; }
}

// Typewriter effect
function startTypewriter() {
    if (typewriterTimer) return;
    typewriterTimer = setInterval(() => {
        if (streamIdx < streamText.length) {
            const chunk = streamText.substring(streamIdx, streamIdx + 3);
            streamIdx += 3;
            const el = document.getElementById('stream-text');
            el.textContent = streamText.substring(0, streamIdx);
            document.getElementById('char-counter').textContent = streamIdx + ' chars';
            // Auto-scroll
            const output = document.getElementById('stream-output');
            output.scrollTop = output.scrollHeight;
        } else {
            clearInterval(typewriterTimer);
            typewriterTimer = null;
        }
    }, 15);
}

function finishTypewriter() {
    if (typewriterTimer) {
        clearInterval(typewriterTimer);
        typewriterTimer = null;
    }
    const el = document.getElementById('stream-text');
    el.textContent = streamText;
    document.getElementById('char-counter').textContent = streamText.length + ' chars';
    document.getElementById('stream-cursor').classList.add('hidden');
}

// Job status polling
function startJobPolling() {
    stopJobPolling();
    pollTimer = setInterval(pollStatus, 2000);
    pollStatus();
}

function stopJobPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function pollStatus() {
    if (!currentJobId) return;
    try {
        const res = await fetch(`${API}/jobs/${currentJobId}/status`);
        if (!res.ok) { stopJobPolling(); return; }
        const data = await res.json();

        if (data.status === 'completed') {
            stopJobPolling();
            stopProgressSSE();
            stopStreamSSE();
            finishTypewriter();
            // Short delay then show final results
            setTimeout(() => loadResults(), 500);
        } else if (data.status === 'failed') {
            stopJobPolling();
            stopProgressSSE();
            stopStreamSSE();
            document.getElementById('error-message').textContent =
                data.error_message || 'Unknown error occurred';
            showView('error');
        }
    } catch (e) { /* retry */ }
}

async function loadResults() {
    if (!currentJobId) return;
    try {
        const res = await fetch(`${API}/jobs/${currentJobId}`);
        const data = await res.json();
        renderResults(data);
        showView('results');
        loadJobHistory();
    } catch (e) {
        alert('Failed to load results: ' + e.message);
    }
}

// Job history
async function loadJobHistory() {
    try {
        const res = await fetch(API + '/jobs?limit=10');
        const data = await res.json();
        renderJobList(data.jobs);
    } catch (e) { /* ignore */ }
}

// Actions
document.getElementById('btn-new').addEventListener('click', () => {
    currentJobId = null;
    selectedFile = null;
    fileInput.value = '';
    filePreview.classList.add('hidden');
    btnStart.disabled = true;
    btnStart.textContent = 'Start OCR';
    stopProgressSSE();
    stopStreamSSE();
    showView('upload');
});

document.getElementById('btn-delete').addEventListener('click', async () => {
    if (!currentJobId) return;
    if (!confirm('Delete this job and all associated files?')) return;
    try {
        await fetch(`${API}/jobs/${currentJobId}`, { method: 'DELETE' });
        currentJobId = null;
        showView('upload');
        document.getElementById('btn-new').click();
    } catch (e) {
        alert('Failed to delete job');
    }
});

document.getElementById('btn-retry').addEventListener('click', () => {
    showView('upload');
});

// Dashboard
document.getElementById('btn-dashboard').addEventListener('click', async () => {
    const dash = document.getElementById('viz-dashboard');
    const btn = document.getElementById('btn-dashboard');
    if (dash.classList.contains('active')) {
        dash.classList.remove('active');
        btn.textContent = 'System Dashboard';
        return;
    }
    btn.textContent = 'Loading...';
    try {
        const [gpuRes, statsRes] = await Promise.all([
            fetch(API + '/gpu-status'),
            fetch(API + '/stats'),
        ]);
        const gpu = await gpuRes.json();
        const stats = await statsRes.json();
        drawDashboard(gpu, stats);
        dash.classList.add('active');
        btn.textContent = 'Hide Dashboard';
    } catch (e) {
        btn.textContent = 'System Dashboard';
    }
});

// Init
checkGpu();
initTabs();
loadJobHistory();
