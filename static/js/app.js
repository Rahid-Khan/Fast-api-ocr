let currentJobId = null;
let pollTimer = null;
let progressTimer = null;
let selectedFile = null;

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
        showView('processing');
        startPolling();
        startProgressPolling();
    } catch (e) {
        alert('Upload failed: ' + e.message);
        btnStart.disabled = false;
        btnStart.textContent = 'Start OCR';
    }
});

// Progress polling (real-time engine progress)
function startProgressPolling() {
    stopProgressPolling();
    progressTimer = setInterval(pollProgress, 1000);
    pollProgress();
}

function stopProgressPolling() {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
}

async function pollProgress() {
    try {
        const res = await fetch(API + '/progress');
        const data = await res.json();
        const statusEl = document.getElementById('processing-status');
        const barFill = document.getElementById('progress-bar-fill');
        const stageMap = {
            'idle': 'Waiting...',
            'loading_model': 'Loading model',
            'model_ready': 'Model ready',
            'converting': 'Converting document',
            'inferring': 'Running OCR inference',
            'decoding': 'Decoding results',
            'done': 'Complete',
            'error': 'Error',
        };
        const stageName = stageMap[data.stage] || data.stage;
        if (data.detail) {
            statusEl.textContent = `${stageName}: ${data.detail}`;
        } else {
            statusEl.textContent = stageName;
        }
        if (barFill && data.percent >= 0) {
            barFill.style.width = data.percent + '%';
        }
    } catch (e) { /* ignore */ }
}

// Job status polling
function startPolling() {
    stopPolling();
    pollTimer = setInterval(pollStatus, 2000);
    pollStatus();
}

function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    stopProgressPolling();
}

async function pollStatus() {
    if (!currentJobId) return;
    try {
        const res = await fetch(`${API}/jobs/${currentJobId}/status`);
        if (!res.ok) { stopPolling(); return; }
        const data = await res.json();

        if (data.status === 'completed') {
            stopPolling();
            loadResults();
        } else if (data.status === 'failed') {
            stopPolling();
            document.getElementById('error-message').textContent =
                data.error_message || 'Unknown error occurred';
            showView('error');
        }
    } catch (e) { /* retry on next tick */ }
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
