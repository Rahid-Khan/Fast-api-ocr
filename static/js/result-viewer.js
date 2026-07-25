function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        });
    });
}

function formatJson(str) {
    try {
        return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
        return str;
    }
}

function renderResults(data) {
    document.getElementById('result-text').textContent = data.result_text || '(no text output)';
    document.getElementById('result-markdown').textContent = data.result_markdown || '(no markdown output)';
    const jsonStr = data.result_json || '{}';
    document.getElementById('result-json').textContent = formatJson(jsonStr);

    document.getElementById('result-filename').textContent = data.filename;
    document.getElementById('result-pages').textContent =
        data.page_count > 1 ? `${data.page_count} pages` : '1 page';
    if (data.completed_at && data.created_at) {
        const elapsed = (new Date(data.completed_at) - new Date(data.created_at)) / 1000;
        document.getElementById('result-time').textContent = `Processed in ${elapsed.toFixed(1)}s`;
    }
}

function copyToClipboard(elementId) {
    const text = document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = event.target;
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = orig, 1500);
    });
}

function downloadResult(format) {
    const el = document.getElementById('result-' + format);
    const text = el.textContent;
    const ext = format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'txt';
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ocr_result.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
}

function renderJobList(jobs) {
    const container = document.getElementById('job-list');
    if (!jobs.length) {
        container.innerHTML = '<p class="muted">No previous jobs</p>';
        return;
    }
    container.innerHTML = jobs.map(j => `
        <div class="job-item">
            <span class="job-name">${escapeHtml(j.filename)}</span>
            <span class="job-status ${j.status}">${j.status}</span>
            <span class="muted">${j.page_count > 1 ? j.page_count + ' pages' : '1 page'}</span>
        </div>
    `).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
