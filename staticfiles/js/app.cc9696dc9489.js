const $ = (s) => document.querySelector(s);
const form = $('#searchForm');
const urlInput = $('#urlInput');
const searchBtn = $('#searchBtn');
const result = $('#result');
const loading = $('#loading');
const errorMsg = $('#errorMsg');
const videoPlayer = $('#videoPlayer');
const playerLoading = $('#playerLoading');

let currentVideoId = '';
let currentTitle = '';
let currentPlayProgressUrl = '';

const VIDEO_QUALITIES = [
  { format: '360', label: '360p', note: 'MP4 + صوت' },
  { format: '480', label: '480p', note: 'MP4 + صوت' },
  { format: '720', label: '720p', note: 'HD · MP4 + صوت' },
  { format: '1080', label: '1080p', note: 'Full HD · MP4 + صوت' },
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
    // Request video info (360p for playback under search)
    const res = await fetch('/api/request/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format: '360', audio_quality: 128 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'حدث خطأ غير متوقع');

    currentVideoId = data.video_id || '';
    currentPlayProgressUrl = data.progress_url || '';

    // Poll progress to get the title (don't need download_url here — proxy resolves it)
    let videoTitle = 'فيديو يوتيوب';
    try {
      const progressData = await pollProgress(currentPlayProgressUrl, () => {});
      videoTitle = progressData.title || videoTitle;
    } catch (_) {}
    currentTitle = videoTitle;

    render({ title: currentTitle });
    loading.hidden = true;
    result.hidden = false;

    // Set the video source to our proxy (mode=play -> inline playback)
    playerLoading.hidden = false;
    const streamUrl = `/stream/?p=${encodeURIComponent(currentPlayProgressUrl)}&mode=play&title=${encodeURIComponent(currentTitle)}`;
    videoPlayer.src = streamUrl;
    videoPlayer.load();
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

videoPlayer.addEventListener('loadeddata', () => { playerLoading.hidden = true; });
videoPlayer.addEventListener('playing', () => { playerLoading.hidden = true; });
videoPlayer.addEventListener('error', () => {
  playerLoading.querySelector('p').textContent = 'تعذّر تشغيل الفيديو';
});

function showError(msg) { errorMsg.textContent = msg; errorMsg.hidden = false; }

function render(info) {
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
          <span class="sub">تنزيل مباشر من المتصفح</span>
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
          <span class="sub">تنزيل مباشر من المتصفح</span>
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

/* ===== Download flow: request -> redirect to proxy (mode=download) ===== */
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

    // Step 2: poll progress until download_url is ready (so the proxy doesn't wait)
    await pollProgress(progressUrl, (pct) => {
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جارٍ التحضير... ${pct}%`;
    });

    // Step 3: redirect to our proxy with mode=download -> browser downloads the file
    btn.innerHTML = '<i class="fa-solid fa-check"></i> جارٍ التنزيل...';
    const downloadStreamUrl = `/stream/?p=${encodeURIComponent(progressUrl)}&mode=download&title=${encodeURIComponent(currentTitle)}`;
    window.location.href = downloadStreamUrl;
  } catch (err) {
    showError(err.message || 'فشل التنزيل');
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

function pollProgress(progressUrl, onProgress) {
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
          body: JSON.stringify({ progress_url: progressUrl }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل التحقق من التقدم');

        const pct = data.progress ? Math.min(100, Math.round(data.progress / 10)) : 0;
        onProgress(pct);

        if (data.success === 1 && data.download_url) {
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
