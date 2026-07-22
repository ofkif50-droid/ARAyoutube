const $ = (s) => document.querySelector(s);
const form = $('#searchForm');
const urlInput = $('#urlInput');
const searchBtn = $('#searchBtn');
const result = $('#result');
const loading = $('#loading');
const errorMsg = $('#errorMsg');
const fsBtn = $('#fsBtn');

let currentVideoId = '';
let currentFilename = 'video';

const VIDEO_QUALITIES = [
  { height: 2160, label: '4K', note: '2160p · MP4 + صوت' },
  { height: 1440, label: '2K', note: '1440p · MP4 + صوت' },
  { height: 1080, label: 'FHD', note: '1080p · MP4 + صوت' },
  { height: 720, label: 'HD', note: '720p · MP4 + صوت' },
  { height: 480, label: '480', note: '480p · MP4 + صوت' },
  { height: 360, label: '360', note: '360p · MP4 + صوت' },
  { height: 240, label: '240', note: '240p · MP4 + صوت' },
  { height: 144, label: '144', note: '144p · MP4 + صوت' },
];

const AUDIO_QUALITIES = [
  { abr: 320, label: '320 kbps' },
  { abr: 256, label: '256 kbps' },
  { abr: 128, label: '128 kbps' },
];

let _autoFsTried = false;
function _enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (req) req.call(el).catch(() => {});
}
function _exitFullscreen() {
  const ex = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  if (ex) ex.call(document).catch(() => {});
}
function _isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}
function _tryAutoFullscreen() {
  if (_autoFsTried) return;
  _autoFsTried = true;
  _enterFullscreen();
}
['click', 'touchstart', 'keydown'].forEach((ev) =>
  document.addEventListener(ev, _tryAutoFullscreen, { once: true, passive: true })
);
fsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (_isFullscreen()) {
    _exitFullscreen();
    fsBtn.innerHTML = '<i class="fa-solid fa-expand"></i> <span>ملء الشاشة</span>';
  } else {
    _enterFullscreen();
    fsBtn.innerHTML = '<i class="fa-solid fa-compress"></i> <span>خروج من ملء الشاشة</span>';
  }
});
document.addEventListener('fullscreenchange', () => {
  if (!_isFullscreen()) {
    fsBtn.innerHTML = '<i class="fa-solid fa-expand"></i> <span>ملء الشاشة</span>';
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;
  if (url.length > 2048) { showError('الرابط طويل جداً'); return; }
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
    currentVideoId = data.video_id || '';
    currentFilename = data.filename || 'video';
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
  if (!bytes || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
  if (mb >= 1) return mb.toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function render(info) {
  $('#videoEmbed').src = info.embed_url;
  $('#videoTitle').textContent = info.title || 'بدون عنوان';
  $('#videoAuthor').textContent = info.author || '—';
  $('#videoDuration').textContent = formatDuration(info.duration);
  $('#videoViews').textContent = formatViews(info.view_count);
  renderVideoFormats(info.video_downloads || {});
  renderAudioFormats(info.audio_downloads || {});
}

function renderVideoFormats(videoDownloads) {
  const box = $('#videoFormats');
  box.innerHTML = '';
  let any = false;
  VIDEO_QUALITIES.forEach((q) => {
    const dl = videoDownloads[String(q.height)];
    if (!dl) return;
    any = true;
    const size = dl.size || 0;
    const sizeText = size > 0 ? '~' + formatSize(size) : '—';
    const sizeClass = size > 0 ? 'format-size' : 'format-size unknown';
    const item = document.createElement('div');
    item.className = 'format-item merged-item';
    item.innerHTML = `
      <div class="format-left">
        <div class="format-badge gold">${q.label}</div>
        <div class="format-detail">
          <span class="res">${q.note}</span>
          <span class="sub">تنزيل مباشر · ملف مدمج</span>
        </div>
      </div>
      <div class="format-right">
        <span class="${sizeClass}"><i class="fa-solid fa-weight-hanging"></i> ${sizeText}</span>
        <a class="fmt-btn gold" href="${esc(dl.url)}" download target="_blank" rel="noopener noreferrer">
          <i class="fa-solid fa-download"></i> تنزيل
        </a>
      </div>`;
    box.appendChild(item);
  });
  if (!any) {
    box.innerHTML = '<div class="empty">لا توجد جودات فيديو متاحة لهذا الفيديو.</div>';
  }
}

function renderAudioFormats(audioDownloads) {
  const box = $('#audioFormats');
  box.innerHTML = '';
  let any = false;
  AUDIO_QUALITIES.forEach((q) => {
    const dl = audioDownloads[String(q.abr)];
    if (!dl) return;
    any = true;
    const size = dl.size || 0;
    const sizeText = size > 0 ? '~' + formatSize(size) : '—';
    const sizeClass = size > 0 ? 'format-size' : 'format-size unknown';
    const dlUrl = `/download/audio/${currentVideoId}/?bitrate=${q.abr}&name=${encodeURIComponent(currentFilename)}`;
    const item = document.createElement('div');
    item.className = 'format-item';
    item.innerHTML = `
      <div class="format-left">
        <div class="format-badge audio"><i class="fa-solid fa-music"></i></div>
        <div class="format-detail">
          <span class="res">صوت · M4A ${q.label}</span>
          <span class="sub">استخراج الصوت على السيرفر</span>
        </div>
      </div>
      <div class="format-right">
        <span class="${sizeClass}"><i class="fa-solid fa-weight-hanging"></i> ${sizeText}</span>
        <a class="fmt-btn download" href="${esc(dlUrl)}" download>
          <i class="fa-solid fa-download"></i> تنزيل
        </a>
      </div>`;
    box.appendChild(item);
  });
  if (!any) {
    box.innerHTML = '<div class="empty">لا توجد جودات صوت متاحة لهذا الفيديو.</div>';
  }
}
