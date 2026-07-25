const VizColors = {
    primary: '#0d6efd',
    success: '#198754',
    danger: '#dc3545',
    warning: '#ffc107',
    info: '#0dcaf0',
    purple: '#6f42c1',
    dark: '#212529',
    muted: '#6c757d',
    surface: '#ffffff',
    bg: '#f8f9fa',
    border: '#dee2e6',
};

function getThemeColors() {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return {
        bg: isDark ? '#1a1a2e' : '#f8f9fa',
        surface: isDark ? '#16213e' : '#ffffff',
        text: isDark ? '#e0e0e0' : '#212529',
        muted: isDark ? '#a0a0a0' : '#6c757d',
        border: isDark ? '#2a2a4a' : '#dee2e6',
        codeBg: isDark ? '#0f1a30' : '#f1f3f5',
        primary: '#0d6efd',
        success: '#198754',
        danger: '#dc3545',
        warning: '#ffc107',
        info: '#0dcaf0',
        purple: '#6f42c1',
    };
}

function drawDashboard(gpu, stats) {
    const c = getThemeColors();
    const container = document.getElementById('viz-dashboard');
    if (!container) return;
    container.innerHTML = '';

    // -- System Overview Row --
    const overview = document.createElement('div');
    overview.className = 'viz-row';
    overview.innerHTML = `
        <div class="viz-card">
            <div class="viz-card-title">GPU</div>
            <div class="viz-card-value" style="color:${gpu.available ? c.success : c.danger}">
                ${gpu.available ? gpu.device_name : 'CPU Only'}
            </div>
            <div class="viz-card-sub">${gpu.torch_version}</div>
        </div>
        <div class="viz-card">
            <div class="viz-card-title">VRAM</div>
            <div class="viz-card-value">${gpu.gpu_mem_total_gb ? gpu.gpu_mem_total_gb + ' GB' : 'N/A'}</div>
            ${gpu.gpu_mem_used_gb != null ? `<div class="viz-bar-track"><div class="viz-bar-fill" style="width:${(gpu.gpu_mem_used_gb / gpu.gpu_mem_total_gb * 100).toFixed(0)}%;background:${c.primary}"></div></div><div class="viz-card-sub">${gpu.gpu_mem_used_gb} / ${gpu.gpu_mem_total_gb} GB used</div>` : '<div class="viz-card-sub">Not allocated</div>'}
        </div>
        <div class="viz-card">
            <div class="viz-card-title">RAM</div>
            <div class="viz-card-value">${gpu.ram_total_gb} GB</div>
            <div class="viz-bar-track"><div class="viz-bar-fill" style="width:${((gpu.ram_total_gb - gpu.ram_available_gb) / gpu.ram_total_gb * 100).toFixed(0)}%;background:${c.warning}"></div></div>
            <div class="viz-card-sub">${(gpu.ram_total_gb - gpu.ram_available_gb).toFixed(1)} / ${gpu.ram_total_gb} GB used</div>
        </div>
        <div class="viz-card">
            <div class="viz-card-title">Model</div>
            <div class="viz-card-value">${gpu.model_loaded ? 'Loaded' : 'Not Loaded'}</div>
            <div class="viz-card-sub">${gpu.model_load_time ? 'Load: ' + gpu.model_load_time + 's' : ''}</div>
        </div>
    `;
    container.appendChild(overview);

    // -- Stats Row --
    const statsRow = document.createElement('div');
    statsRow.className = 'viz-row';
    statsRow.innerHTML = `
        <div class="viz-card">
            <div class="viz-card-title">Total Jobs</div>
            <div class="viz-card-value">${stats.total_jobs}</div>
        </div>
        <div class="viz-card">
            <div class="viz-card-title">Total Chars</div>
            <div class="viz-card-value">${stats.total_chars.toLocaleString()}</div>
        </div>
        <div class="viz-card">
            <div class="viz-card-title">Avg Time</div>
            <div class="viz-card-value">${stats.avg_time}s</div>
        </div>
        <div class="viz-card">
            <div class="viz-card-title">Total Inference</div>
            <div class="viz-card-value">${stats.total_infer_time}s</div>
        </div>
    `;
    container.appendChild(statsRow);

    // -- History Chart --
    if (stats.history.length > 0) {
        const chartCard = document.createElement('div');
        chartCard.className = 'viz-chart-card';
        chartCard.innerHTML = `
            <div class="viz-card-title">Job History (last ${stats.history.length} runs)</div>
            <canvas id="viz-history-canvas" width="800" height="220"></canvas>
        `;
        container.appendChild(chartCard);

        requestAnimationFrame(() => drawHistoryChart(stats.history, c));
    }

    // -- GPU Memory Ring --
    if (gpu.gpu_mem_total_gb) {
        const ringCard = document.createElement('div');
        ringCard.className = 'viz-chart-card';
        ringCard.innerHTML = `
            <div class="viz-card-title">GPU Memory Breakdown</div>
            <canvas id="viz-gpu-ring" width="300" height="300"></canvas>
        `;
        container.appendChild(ringCard);

        requestAnimationFrame(() => drawMemoryRing(gpu, c));
    }
}

function drawHistoryChart(history, c) {
    const canvas = document.getElementById('viz-history-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const pad = { top: 20, right: 20, bottom: 40, left: 60 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    const times = history.map(h => h.time);
    const maxTime = Math.max(...times, 1);

    // Grid lines
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(W - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = c.muted;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText((maxTime * (1 - i / 4)).toFixed(1) + 's', pad.left - 8, y + 4);
    }

    // Bars
    const barW = Math.max(plotW / history.length - 4, 4);
    history.forEach((h, i) => {
        const x = pad.left + (plotW / history.length) * i + 2;
        const barH = (h.time / maxTime) * plotH;
        const y = pad.top + plotH - barH;

        const isPdf = h.file_type === 'pdf';
        ctx.fillStyle = isPdf ? c.primary : c.success;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
        ctx.fill();

        // Label on top
        ctx.fillStyle = c.text;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(h.time + 's', x + barW / 2, y - 4);

        // X-axis label
        ctx.fillStyle = c.muted;
        ctx.font = '9px sans-serif';
        ctx.fillText('#' + h.job_number, x + barW / 2, H - pad.bottom + 14);
    });

    // Legend
    ctx.fillStyle = c.primary;
    ctx.fillRect(pad.left, H - 12, 12, 10);
    ctx.fillStyle = c.text;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PDF', pad.left + 16, H - 3);
    ctx.fillStyle = c.success;
    ctx.fillRect(pad.left + 50, H - 12, 12, 10);
    ctx.fillStyle = c.text;
    ctx.fillText('Image', pad.left + 66, H - 3);
}

function drawMemoryRing(gpu, c) {
    const canvas = document.getElementById('viz-gpu-ring');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = 150, cy = 150, r = 100, lw = 30;

    ctx.clearRect(0, 0, 300, 300);

    const total = gpu.gpu_mem_total_gb;
    const used = gpu.gpu_mem_used_gb || 0;
    const reserved = gpu.gpu_mem_reserved_gb || 0;
    const active = used;
    const cached = reserved - used;
    const free = total - reserved;

    const segments = [
        { value: active, color: c.primary, label: 'Active' },
        { value: Math.max(cached, 0), color: c.warning, label: 'Reserved' },
        { value: Math.max(free, 0), color: c.success, label: 'Free' },
    ].filter(s => s.value > 0);

    let startAngle = -Math.PI / 2;
    segments.forEach(seg => {
        const sweep = (seg.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, startAngle + sweep);
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = lw;
        ctx.lineCap = 'butt';
        ctx.stroke();
        startAngle += sweep;
    });

    // Center text
    ctx.fillStyle = c.text;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(used.toFixed(1), cx, cy - 4);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = c.muted;
    ctx.fillText('GB Active', cx, cy + 18);

    // Legend below
    let ly = cy + r + 30;
    segments.forEach(seg => {
        ctx.fillStyle = seg.color;
        ctx.fillRect(cx - 60, ly - 8, 10, 10);
        ctx.fillStyle = c.text;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${seg.label}: ${seg.value.toFixed(1)} GB`, cx - 44, ly);
        ly += 18;
    });
}
