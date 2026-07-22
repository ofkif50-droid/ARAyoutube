const $ = (s) => document.querySelector(s);
const form = $('#searchForm');
const urlInput = $('#urlInput');
const searchBtn = $('#searchBtn');
const result = $('#result');
const loading = $('#loading');
const errorMsg = $('#errorMsg');

let currentVideoId = '';

const VIDEO_QUALITIES = [
  { format: '1080', label: '1080p', note: 'Full HD · MP4 + صوت' },
  { format: '720', label: '720p', note: 'HD · MP4 + صوت' },
  { format: '480', label: '480p', note: 'MP4 + صوت' },
  { format: '360', label: '360p', note: 'MP4 + صوت' },
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

/* ===== Search form ===== */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;
  if (url.length > 2048) { showError('الرابط طويل جداً'); return; }

  // Disable search during search
  errorMsg.hidden = true;
  result.hidden = true;
  loading.hidden = false;
  searchBtn.disabled = true;
  urlInput.disabled = true;
  searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>جارٍ البحث...</span>';

  try {
    // Request video info via the download API (mp3 format to get metadata + progress_url)
    const res = await fetch('/api/request/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format: 'mp3', audio_quality: 128 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'حدث خطأ غير متوقع');

    currentVideoId = data.video_id || '';

    // Poll progress to get the title (appears in progress response)
    let videoTitle = 'فيديو يوتيوب';
    try {
      const progressData = await pollProgress(data.progress_url, () => {}, 1);
      if (progressData.title) videoTitle = progressData.title;
    } catch (_) {}

    render({ title: videoTitle });
    loading.hidden = true;
    result.hidden = false;
  } catch (err) {
    showError(err.message || 'تعذّر استخراج البيانات');
    loading.hidden = true;
  } finally {
    // Re-enable search
    searchBtn.disabled = false;
    urlInput.disabled = false;
    searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i><span>استخراج</span>';
  }
});

function showError(msg) { errorMsg.textContent = msg; errorMsg.hidden = false; }

function render(info) {
  // Video plays under search — standard youtube.com/embed with autoplay
  $('#videoEmbed').src = `https://www.youtube.com/embed/${currentVideoId}?autoplay=1&rel=0`;
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

/* ===== Download flow: request -> poll -> redirect to external page ===== */
async function handleDownload(btn) {
  const fmt = btn.dataset.format;
  const bitrate = parseInt(btn.dataset.bitrate || '128', 10);
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جارٍ التحضير...';

  try {
    // Step 1: request download -> get progress_url
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
    const progressUrl = reqData.progress_url;
    if (!progressUrl) throw new Error('لم يتم الحصول على رابط التقدم');

    // Step 2: poll progress until download_url is ready
    const downloadUrl = await pollProgress(progressUrl, (pct) => {
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جارٍ التحضير... ${pct}%`;
    });

    // Step 3: redirect to the external download page — browser starts downloading
    btn.innerHTML = '<i class="fa-solid fa-check"></i> جارٍ التنزيل...';
    window.location.href = downloadUrl;
  } catch (err) {
    showError(err.message || 'فشل التنزيل');
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

function pollProgress(progressUrl, onProgress, maxAttemptsOverride) {
  return new Promise((resolve, reject) => {
    const maxAttempts = maxAttemptsOverride || 60;
    let attempts = 0;
    const interval = 2500;

    const tick = async () => {
      attempts++;
      try {
        const res = await fetch('/api/progress/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ progress_url: progressUrl }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل التحقق من التقدم');

        const pct = data.progress ? Math.min(100, Math.round(data.progress / 10)) : 0;
        onProgress(pct);

        if (data.success === 1 && data.download_url) {
          resolve(data.download_url);
          return;
        }
        if (maxAttemptsOverride && data.title) {
          // For info-only polling, resolve with the data
          resolve(data);
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
