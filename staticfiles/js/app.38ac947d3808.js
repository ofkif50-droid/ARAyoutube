const $ = (s) => document.querySelector(s);
const form = $('#searchForm');
const urlInput = $('#urlInput');
const searchBtn = $('#searchBtn');
const result = $('#result');
const loading = $('#loading');
const errorMsg = $('#errorMsg');
const videoPlayer = $('#videoPlayer');

let currentVideoId = '';
let currentTitle = '';
let currentPlayProgressUrl = '';

const VIDEO_QUALITIES = [
  { format: '360', label: '360p', note: 'MP4 + Audio' },
  { format: '480', label: '480p', note: 'MP4 + Audio' },
  { format: '720', label: '720p', note: 'HD · MP4 + Audio' },
  { format: '1080', label: '1080p', note: 'Full HD · MP4 + Audio' },
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
  if (url.length > 2048) { showError('URL is too long'); return; }

  errorMsg.hidden = true;
  result.hidden = true;
  loading.hidden = false;
  searchBtn.disabled = true;
  urlInput.disabled = true;
  searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Searching...</span>';

  try {
    const res = await fetch('/api/request/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format: '360', audio_quality: 128 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'An unexpected error occurred');

    currentVideoId = data.video_id || '';
    currentPlayProgressUrl = data.progress_url || '';

    let videoTitle = 'YouTube Video';
    try {
      const progressData = await pollProgress(currentPlayProgressUrl, () => {});
      videoTitle = progressData.title || videoTitle;
    } catch (_) {}
    currentTitle = videoTitle;

    render({ title: currentTitle });
    loading.hidden = true;
    result.hidden = false;

    // Stream video directly from YouTube via iframe embed
    videoPlayer.src = `https://www.youtube.com/embed/${currentVideoId}?autoplay=1&rel=0&modestbranding=1`;
  } catch (err) {
    showError(err.message || 'Failed to extract video data');
    loading.hidden = true;
  } finally {
    searchBtn.disabled = false;
    urlInput.disabled = false;
    searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i><span>Extract</span>';
  }
});

function showError(msg) { errorMsg.textContent = msg; errorMsg.hidden = false; }

function render(info) {
  $('#videoTitle').textContent = info.title || 'Untitled';
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
          <span class="sub">Direct browser download</span>
        </div>
      </div>
      <div class="format-right">
        <button class="fmt-btn gold" data-format="${q.format}">
          <i class="fa-solid fa-download"></i> Download
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
          <span class="sub">Direct browser download</span>
        </div>
      </div>
      <div class="format-right">
        <button class="fmt-btn download" data-format="${q.format}" data-bitrate="${q.bitrate}">
          <i class="fa-solid fa-download"></i> Download
        </button>
      </div>`;
    box.appendChild(item);
  });
  box.querySelectorAll('.fmt-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleDownload(btn));
  });
}

/* ===== Download flow: request -> poll -> open proxy in new tab ===== */
async function handleDownload(btn) {
  const fmt = btn.dataset.format;
  const bitrate = parseInt(btn.dataset.bitrate || '128', 10);
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing...';

  try {
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
    if (!reqRes.ok) throw new Error(reqData.error || 'Download request failed');
    const progressUrl = reqData.progress_url;
    if (!progressUrl) throw new Error('No progress URL returned');

    await pollProgress(progressUrl, (pct) => {
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Preparing... ${pct}%`;
    });

    btn.innerHTML = '<i class="fa-solid fa-check"></i> Downloading...';
    const downloadStreamUrl = `/stream/?p=${encodeURIComponent(progressUrl)}&title=${encodeURIComponent(currentTitle)}`;
    window.open(downloadStreamUrl, '_blank');
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }, 1500);
  } catch (err) {
    showError(err.message || 'Download failed');
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
        if (!res.ok) throw new Error(data.error || 'Failed to check progress');

        const pct = data.progress ? Math.min(100, Math.round(data.progress / 10)) : 0;
        onProgress(pct);

        if (data.success === 1 && data.download_url) {
          resolve(data);
          return;
        }
        if (attempts >= maxAttempts) {
          reject(new Error('Timed out waiting for preparation'));
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
