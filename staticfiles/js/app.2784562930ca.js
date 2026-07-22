const $ = (s) => document.querySelector(s);
const form = $('#searchForm');
const urlInput = $('#urlInput');
const searchBtn = $('#searchBtn');
const result = $('#result');
const loading = $('#loading');
const errorMsg = $('#errorMsg');
const fsBtn = $('#fsBtn');

let currentVideoId = '';

const VIDEO_QUALITIES = [
  { format: '1080', label: 'FHD', note: '1080p · MP4 + صوت' },
  { format: '720', label: 'HD', note: '720p · MP4 + صوت' },
  { format: '480', label: '480', note: '480p · MP4 + صوت' },
  { format: '360', label: '360', note: '360p · MP4 + صوت' },
];

const AUDIO_QUALITIES = [
  { format: 'mp3', bitrate: 320, label: '320 kbps', note: 'MP3 · 320 kbps' },
  { format: 'mp3', bitrate: 256, label: '256 kbps', note: 'MP3 · 256 kbps' },
  { format: 'mp3', bitrate: 128, label: '128 kbps', note: 'MP3 · 128 kbps' },
  { format: 'm4a', bitrate: 256, label: '256 kbps', note: 'M4A · 256 kbps' },
  { format: 'm4a', bitrate: 128, label: '128 kbps', note: 'M4A · 128 kbps' },
];

/* ===== Hero background slideshow ===== */
(function heroSlideshow() {
  const imgs = document.querySelectorAll('.hero-bg-img');
  if (!imgs.length) return;
  let idx = 0;
  setInterval(() => {
    imgs[idx].classList.remove('active');
    idx = (idx + 1) % imgs.length;
    imgs[idx].classList.add('active');
  }, 4500);
})();

/* ===== Scroll reveal animations ===== */
(function scrollReveal() {
  const items = document.querySelectorAll('.reveal-up');
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('visible'));
    return;
  }
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });
  items.forEach((el) => obs.observe(el));
})();

/* ===== Fullscreen button ===== */
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
    fsBtn.innerHTML = '<i class="fa-solid fa-expand"></i><span>ملء الشاشة</span>';
  } else {
    _enterFullscreen();
    fsBtn.innerHTML = '<i class="fa-solid fa-compress"></i><span>خروج من ملء الشاشة</span>';
  }
});
document.addEventListener('fullscreenchange', () => {
  if (!_isFullscreen()) {
    fsBtn.innerHTML = '<i class="fa-solid fa-expand"></i><span>ملء الشاشة</span>';
  }
});

/* ===== Search form ===== */
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

function render(info) {
  $('#videoEmbed').src = info.embed_url;
  $('#videoTitle').textContent = info.title || 'بدون عنوان';
  renderVideoFormats();
  renderAudioFormats();
}

function renderVideoFormats() {
  const box = $('#videoFormats');
  box.innerHTML = '';
  VIDEO_QUALITIES.forEach((q) => {
    const item = document.createElement('div');
    item.className = 'format-item merged-item';
    item.innerHTML = `
      <div class="format-left">
        <div class="format-badge gold">${q.label}</div>
        <div class="format-detail">
          <span class="res">${q.note}</span>
          <span class="sub">تنزيل خارجي مباشر</span>
        </div>
      </div>
      <div class="format-right">
        <button class="fmt-btn gold" data-format="${q.format}">
          <i class="fa-solid fa-download"></i> تنزيل
        </button>
      </div>`;
    box.appendChild(item);
  });
  box.querySelectorAll('.fmt-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleDownload(btn));
  });
}

function renderAudioFormats() {
  const box = $('#audioFormats');
  box.innerHTML = '';
  AUDIO_QUALITIES.forEach((q) => {
    const item = document.createElement('div');
    item.className = 'format-item';
    item.innerHTML = `
      <div class="format-left">
        <div class="format-badge audio"><i class="fa-solid fa-music"></i></div>
        <div class="format-detail">
          <span class="res">${q.note}</span>
          <span class="sub">تنزيل خارجي مباشر</span>
        </div>
      </div>
      <div class="format-right">
        <button class="fmt-btn download" data-format="${q.format}" data-bitrate="${q.bitrate}">
          <i class="fa-solid fa-download"></i> تنزيل
        </button>
      </div>`;
    box.appendChild(item);
  });
  box.querySelectorAll('.fmt-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleDownload(btn));
  });
}

/* ===== Download flow (client-side polling) ===== */
async function handleDownload(btn) {
  const fmt = btn.dataset.format;
  const bitrate = parseInt(btn.dataset.bitrate || '128', 10);
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جارٍ التحضير...';

  try {
    // Step 1: request download -> get progressId immediately
    const reqRes = await fetch('/api/request/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${currentVideoId}`,
        format: fmt,
        audio_quality: bitrate,
      }),
    });
    const reqData = await reqRes.json();
    if (!reqRes.ok) throw new Error(reqData.error || 'فشل طلب التنزيل');
    const progressId = reqData.progress_id;
    if (!progressId) throw new Error('لم يتم الحصول على معرّف التقدم');

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جارٍ التحضير...';

    // Step 2: poll progress until downloadUrl is ready, then open immediately
    const downloadUrl = await pollProgress(progressId, (pct) => {
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${pct}%`;
    });

    // Step 3: open the download URL immediately (it expires quickly)
    window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    btn.innerHTML = '<i class="fa-solid fa-check"></i> تم التنزيل';
  } catch (err) {
    showError(err.message || 'فشل التنزيل');
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

function pollProgress(progressId, onProgress) {
  return new Promise((resolve, reject) => {
    const maxAttempts = 60;
    let attempts = 0;
    const interval = 2500;

    const tick = async () => {
      attempts++;
      try {
        const res = await fetch('/api/progress/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ progress_id: progressId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل التحقق من التقدم');

        const pct = data.progress ? Math.min(100, Math.round(data.progress / 10)) : 0;
        onProgress(pct);

        if (data.finished && data.downloadUrl) {
          resolve(data.downloadUrl);
          return;
        }
        if (attempts >= maxAttempts) {
          reject(new Error('انتهت المهلة قبل اكتمال التحضير'));
          return;
        }
        setTimeout(tick, interval);
      } catch (err) {
        reject(err);
      }
    };
    setTimeout(tick, interval);
  });
}
