const $ = (s) => document.querySelector(s);
const form = $('#searchForm');
const urlInput = $('#urlInput');
const searchBtn = $('#searchBtn');
const result = $('#result');
const loading = $('#loading');
const errorMsg = $('#errorMsg');

let currentTitle = 'video';
let currentVideoId = '';

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;
  errorMsg.hidden = true;
  result.hidden = true;
  loading.hidden = false;
  searchBtn.disabled = true;

  try {
    const res = await fetch('/api/info/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'حدث خطأ غير متوقع');
    currentTitle = data.title || 'video';
    currentVideoId = data.video_id || '';
    console.log('[app.js] currentVideoId=', JSON.stringify(currentVideoId));
    render(data);
    loading.hidden = true;
    result.hidden = false;
  } catch (err) {
    showError(err.message || 'تعذّر استخراج البيانات');
    loading.hidden = true;
  } finally {
    searchBtn.disabled = false;
  }
});

function showError(msg) { errorMsg.textContent = msg; errorMsg.hidden = false; }

function formatDuration(sec) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
function formatViews(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
function formatSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
  if (mb >= 1) return mb.toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

function qualityLabel(h) {
  if (h >= 4320) return '8K';
  if (h >= 2160) return '4K';
  if (h >= 1440) return '2K';
  return h + 'p';
}

// video_id goes in the URL PATH so it cannot be lost.
function buildDownloadUrl(params) {
  const vid = encodeURIComponent(currentVideoId);
  const q = new URLSearchParams();
  q.set('type', params.type);
  q.set('title', currentTitle);
  if (params.height) q.set('height', params.height);
  if (params.ext) q.set('ext', params.ext);
  if (params.resolution) q.set('resolution', params.resolution);
  if (params.fps) q.set('fps', params.fps);
  const url = `/download/${vid}/?` + q.toString();
  console.log('[app.js] buildDownloadUrl:', url);
  return url;
}

function render(info) {
  $('#videoEmbed').src = info.embed_url;
  $('#videoTitle').textContent = info.title || 'بدون عنوان';
  $('#videoAuthor').textContent = info.author || '—';
  $('#videoDuration').textContent = formatDuration(info.duration);
  $('#videoViews').textContent = formatViews(info.view_count);
  renderMerged(info.merged || []);
  renderProgressive(info.progressive || []);
  renderAudio(info.audio_only || []);
}

function renderMerged(merged) {
  const box = $('#mergedFormats');
  box.innerHTML = '';
  if (!merged.length) { box.innerHTML = '<div class="empty">لا توجد جودات مدمجة متاحة لهذا الفيديو.</div>'; return; }
  merged.forEach((f) => {
    const item = document.createElement('div');
    item.className = 'format-item merged-item';
    const label = f.height + 'p' + (f.fps ? ' ' + f.fps + 'fps' : '');
    item.innerHTML = `
      <div class="format-left">
        <div class="format-badge gold">${qualityLabel(f.height)}</div>
        <div class="format-detail">
          <span class="res">${label} · ${f.ext.toUpperCase()} + صوت</span>
          <span class="sub">${formatSize(f.filesize) || 'حجم غير معروف'} · مدمج بالصوت</span>
        </div>
      </div>
      <div class="format-actions">
        <a class="fmt-btn gold" href="${buildDownloadUrl({type:'merged', height:f.height, ext:f.ext, resolution:f.resolution, fps:f.fps})}">
          <i class="fa-solid fa-download"></i> تنزيل
        </a>
      </div>`;
    box.appendChild(item);
  });
}

function renderProgressive(progressive) {
  const box = $('#videoFormats');
  box.innerHTML = '';
  if (!progressive.length) { box.innerHTML = '<div class="empty">لا توجد صيغ فيديو+صوت متاحة للتحميل المباشر.</div>'; return; }
  progressive.forEach((f) => {
    const item = document.createElement('div');
    item.className = 'format-item';
    item.innerHTML = `
      <div class="format-left">
        <div class="format-badge">${f.height ? f.height + 'p' : 'MP4'}</div>
        <div class="format-detail">
          <span class="res">${f.resolution || (f.height ? f.height + 'p' : 'فيديو')} · ${f.ext.toUpperCase()}</span>
          <span class="sub">${f.fps ? f.fps + 'fps · ' : ''}${formatSize(f.filesize) || 'حجم غير معروف'}</span>
        </div>
      </div>
      <div class="format-actions">
        <a class="fmt-btn download" href="${buildDownloadUrl({type:'progressive', height:f.height, ext:f.ext, resolution:f.resolution, fps:f.fps})}">
          <i class="fa-solid fa-download"></i> تنزيل
        </a>
      </div>`;
    box.appendChild(item);
  });
}

function renderAudio(audio) {
  const box = $('#audioFormats');
  box.innerHTML = '';
  if (!audio.length) { box.innerHTML = '<div class="empty">لا توجد صيغ صوت متاحة.</div>'; return; }
  audio.forEach((f) => {
    const item = document.createElement('div');
    item.className = 'format-item';
    item.innerHTML = `
      <div class="format-left">
        <div class="format-badge audio"><i class="fa-solid fa-music"></i></div>
        <div class="format-detail">
          <span class="res">صوت · ${f.ext.toUpperCase()}${f.abr ? ' ' + Math.round(f.abr) + 'kbps' : ''}</span>
          <span class="sub">${formatSize(f.filesize) || 'حجم غير معروف'}</span>
        </div>
      </div>
      <div class="format-actions">
        <a class="fmt-btn download" href="${buildDownloadUrl({type:'audio', ext:f.ext})}">
          <i class="fa-solid fa-download"></i> تنزيل
        </a>
      </div>`;
    box.appendChild(item);
  });
}
