const VizColors = {
    primary: '#4361ee',
    success: '#2ec4b6',
    danger: '#e63946',
    warning: '#f4a261',
    info: '#4895ef',
    purple: '#7b2cbf',
    text: '#1a1a2e',
    muted: '#8b8fa3',
    surface: '#ffffff',
    bg: '#f0f2f5',
    border: '#e2e5ea',
    borderLight: '#f0f1f3',
};

function drawDashboard(gpu, stats) {
    const c = VizColors;
    const container = document.getElementById('viz-dashboard');
    if (!container) return;
    container.innerHTML = '';

    // -- Section: System --
    const secTitle1 = document.createElement('div');
    secTitle1.className = 'viz-section-title';
    secTitle1.textContent = 'SYSTEM';
    container.appendChild(secTitle1);

    const overview = document.createElement('div');
    overview.className = 'viz-row';
    overview.innerHTML = `
        <div class="viz-card">
            <div class="viz-card-icon">${gpu.available ? '&#9889;' : '&#128187;'}</div>
            <div class="viz-card-title">Compute</div>
            <div class="viz-card-value" style="font-size:1rem;color:${gpu.available ? c.success : c.danger}">
                <span class="status-dot ${gpu.available ? 'green' : 'red'}"></span>
                ${gpu.available ? gpu.device_name : 'CPU Only'}
            </div>
            <div class="viz-card-sub">${gpu.torch_version} ${gpu.cuda_version ? '| CUDA ' + gpu.cuda_version : ''}</div>
        </div>
        <div class="viz-card">
            <div class="viz-card-icon">&#128247;</div>
            <div class="viz-card-title">GPU Memory</div>
            <div class="viz-card-value">${gpu.gpu_mem_total_gb ? gpu.gpu_mem_total_gb + ' GB' : 'N/A'}</div>
            ${gpu.gpu_mem_used_gb != null ? `
                <div class="viz-bar-track">
                    <div class="viz-bar-fill" style="width:${(gpu.gpu_mem_used_gb / gpu.gpu_mem_total_gb * 100).toFixed(0)}%;background:${c.primary}"></div>
                </div>
                <div class="viz-card-sub">${gpu.gpu_mem_used_gb} used / ${gpu.gpu_mem_total_gb} total</div>
            ` : '<div class="viz-card-sub">Not allocated</div>'}
        </div>
        <div class="viz-card">
            <div class="viz-card-icon">&#128190;</div>
            <div class="viz-card-title">System RAM</div>
            <div class="viz-card-value">${gpu.ram_total_gb} GB</div>
            <div class="viz-bar-track">
                <div class="viz-bar-fill" style="width:${((gpu.ram_total_gb - gpu.ram_available_gb) / gpu.ram_total_gb * 100).toFixed(0)}%;background:${c.warning}"></div>
            </div>
            <div class="viz-card-sub">${(gpu.ram_total_gb - gpu.ram_available_gb).toFixed(1)} used / ${gpu.ram_total_gb} total</div>
        </div>
        <div class="viz-card">
            <div class="viz-card-icon">${gpu.model_loaded ? '&#9989;' : '&#9899;'}</div>
            <div class="viz-card-title">Model</div>
            <div class="viz-card-value" style="font-size:1rem;color:${gpu.model_loaded ? c.success : c.muted}">
                <span class="status-dot ${gpu.model_loaded ? 'green' : 'yellow'}"></span>
                ${gpu.model_loaded ? 'Loaded' : 'Not Loaded'}
            </div>
            <div class="viz-card-sub">${gpu.model_load_time ? 'Load: ' + gpu.model_load_time + 's' : ''}</div>
        </div>
    `;
    container.appendChild(overview);

    // -- Section: Statistics --
    if (stats.total_jobs > 0) {
        const secTitle2 = document.createElement('div');
        secTitle2.className = 'viz-section-title';
        secTitle2.textContent = 'STATISTICS';
        container.appendChild(secTitle2);

        const statsRow = document.createElement('div');
        statsRow.className = 'viz-row';
        statsRow.innerHTML = `
            <div class="viz-card">
                <div class="viz-card-title">Total Jobs</div>
                <div class="viz-card-value" style="color:${c.primary}">${stats.total_jobs}</div>
            </div>
            <div class="viz-card">
                <div class="viz-card-title">Characters Extracted</div>
                <div class="viz-card-value" style="color:${c.success}">${stats.total_chars.toLocaleString()}</div>
            </div>
            <div class="viz-card">
                <div class="viz-card-title">Avg Inference Time</div>
                <div class="viz-card-value" style="color:${c.warning}">${stats.avg_time}s</div>
            </div>
            <div class="viz-card">
                <div class="viz-card-title">Total Inference</div>
                <div class="viz-card-value" style="color:${c.info}">${stats.total_infer_time}s</div>
            </div>
        `;
        container.appendChild(statsRow);

        // History Chart
        const chartCard = document.createElement('div');
        chartCard.className = 'viz-chart-card';
        chartCard.innerHTML = `
            <div class="viz-section-title" style="margin-bottom:0.75rem">Job History</div>
            <canvas id="viz-history-canvas" width="900" height="240"></canvas>
        `;
        container.appendChild(chartCard);
        requestAnimationFrame(() => drawHistoryChart(stats.history, c));
    }

    // GPU Memory Ring
    if (gpu.gpu_mem_total_gb) {
        const ringCard = document.createElement('div');
        ringCard.className = 'viz-chart-card';
        ringCard.style.maxWidth = '360px';
        ringCard.innerHTML = `
            <div class="viz-section-title" style="margin-bottom:0.75rem">GPU Memory Breakdown</div>
            <canvas id="viz-gpu-ring" width="320" height="320"></canvas>
        `;
        container.appendChild(ringCard);
        requestAnimationFrame(() => drawMemoryRing(gpu, c));
    }
}

function drawHistoryChart(history, c) {
    const canvas = document.getElementById('viz-history-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;
    const pad = { top: 20, right: 20, bottom: 40, left: 55 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    const times = history.map(h => h.time);
    const maxTime = Math.max(...times, 1);

    // Grid
    ctx.strokeStyle = c.borderLight;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH / 4) * i;
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(pad.left, y);
        ctx.lineTo(W - pad.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = c.muted;
        ctx.font = '11px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText((maxTime * (1 - i / 4)).toFixed(1) + 's', pad.left - 8, y + 4);
    }

    // Bars
    const barW = Math.max(Math.min(plotW / history.length - 4, 40), 6);
    history.forEach((h, i) => {
        const x = pad.left + (plotW / history.length) * i + 2;
        const barH = (h.time / maxTime) * plotH;
        const y = pad.top + plotH - barH;

        const isPdf = h.file_type === 'pdf';
        const color = isPdf ? c.primary : c.success;

        // Bar shadow
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, barW, barH, [4, 4, 0, 0]);
        ctx.fill();

        // Bar
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
        ctx.fill();

        // Value label
        ctx.fillStyle = c.text;
        ctx.font = 'bold 10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(h.time + 's', x + barW / 2, y - 6);

        // X label
        ctx.fillStyle = c.muted;
        ctx.font = '9px -apple-system, sans-serif';
        ctx.fillText('#' + h.job_number, x + barW / 2, H - pad.bottom + 14);
    });

    // Legend
    let lx = pad.left;
    ctx.fillStyle = c.primary;
    ctx.beginPath();
    ctx.roundRect(lx, H - 10, 12, 10, 2);
    ctx.fill();
    ctx.fillStyle = c.text;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PDF', lx + 16, H - 2);

    lx += 50;
    ctx.fillStyle = c.success;
    ctx.beginPath();
    ctx.roundRect(lx, H - 10, 12, 10, 2);
    ctx.fill();
    ctx.fillStyle = c.text;
    ctx.fillText('Image', lx + 16, H - 2);
}

function drawMemoryRing(gpu, c) {
    const canvas = document.getElementById('viz-gpu-ring');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 320 * dpr;
    canvas.height = 320 * dpr;
    ctx.scale(dpr, dpr);

    const cx = 160, cy = 140, r = 90, lw = 28;

    ctx.clearRect(0, 0, 320, 320);

    const total = gpu.gpu_mem_total_gb;
    const used = gpu.gpu_mem_used_gb || 0;
    const reserved = gpu.gpu_mem_reserved_gb || 0;
    const active = used;
    const cached = Math.max(reserved - used, 0);
    const free = Math.max(total - reserved, 0);

    const segments = [
        { value: active, color: c.primary, label: 'Active' },
        { value: cached, color: c.warning, label: 'Cached' },
        { value: free, color: '#d4e7df', label: 'Free' },
    ].filter(s => s.value > 0.01);

    // Background ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = c.borderLight;
    ctx.lineWidth = lw;
    ctx.stroke();

    // Segments
    let startAngle = -Math.PI / 2;
    segments.forEach(seg => {
        const sweep = (seg.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, startAngle + sweep);
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.stroke();
        startAngle += sweep;
    });

    // Center
    ctx.fillStyle = c.text;
    ctx.font = 'bold 28px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(used.toFixed(1), cx, cy - 2);
    ctx.font = '13px -apple-system, sans-serif';
    ctx.fillStyle = c.muted;
    ctx.fillText('GB Active', cx, cy + 18);

    // Legend
    let ly = cy + r + 28;
    segments.forEach(seg => {
        ctx.fillStyle = seg.color;
        ctx.beginPath();
        ctx.roundRect(cx - 70, ly - 7, 12, 12, 2);
        ctx.fill();
        ctx.fillStyle = c.text;
        ctx.font = '12px -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${seg.label}: ${seg.value.toFixed(1)} GB`, cx - 52, ly + 3);
        ly += 20;
    });
}
