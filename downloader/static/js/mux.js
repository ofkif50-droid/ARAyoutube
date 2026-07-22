(function () {
  const cfgEl = document.getElementById('dl-config');
  if (!cfgEl) { console.error('[mux.js] no #dl-config element'); return; }

  let D;
  try { D = JSON.parse(cfgEl.textContent || '{}'); }
  catch (e) { console.error('[mux.js] failed to parse config JSON:', e); return; }

  const videoId = (D.video_id || '').trim();
  const fmtType = (D.fmt_type || 'progressive').trim();
  const vExt = (D.ext || 'mp4').toLowerCase();
  const height = parseInt(D.height) || 0;

  console.log('[mux.js] config:', { videoId, height, vExt, fmtType });

  const CORS_PROXY = 'https://proxy.cors.sh/';

  // ALL ffmpeg assets served locally (same-origin) — no CORS issues.
  const ORIGIN = window.location.origin;
  const FFMPEG_LIB_URL = ORIGIN + '/static/js/ffmpeg.js';
  const WORKER_URL = ORIGIN + '/static/js/814.ffmpeg.js';
  const CORE_URL = ORIGIN + '/static/js/ffmpeg-core.js';
  const WASM_URL = ORIGIN + '/static/js/ffmpeg-core.wasm';

  const muxBtn = document.getElementById('muxBtn');
  const directBtn = document.getElementById('directBtn');
  const prog = document.getElementById('muxProgress');
  const bar = prog ? prog.querySelector('.mux-bar') : null;
  const pctEl = prog ? prog.querySelector('.mux-pct') : null;
  const stageLabel = prog ? prog.querySelector('.mux-stage-label') : null;
  const stages = prog ? prog.querySelectorAll('.mux-stage') : [];

  let ffmpeg = null;

  function setStage(name) {
    stages.forEach((s) => {
      const i = s.querySelector('i');
      if (s.dataset.stage === name) {
        i.className = 'fa-solid fa-circle-notch fa-spin';
        s.classList.add('active');
      } else if (s.classList.contains('active') && s.dataset.stage !== name) {
        i.className = 'fa-solid fa-circle-check';
        s.classList.add('done');
        s.classList.remove('active');
      }
    });
  }
  function setDone() {
    stages.forEach((s) => {
      s.querySelector('i').className = 'fa-solid fa-circle-check';
      s.classList.add('done');
      s.classList.remove('active');
    });
  }
  function setErr(msg) {
    stages.forEach((s) => {
      if (!s.classList.contains('done')) {
        s.querySelector('i').className = 'fa-solid fa-circle-xmark';
        s.classList.add('err');
      }
    });
    if (stageLabel) {
      stageLabel.classList.add('err');
      stageLabel.textContent = 'فشل: ' + msg;
    }
  }
  function setPct(p, msg) {
    if (bar) bar.style.width = p + '%';
    if (pctEl) pctEl.textContent = Math.round(p) + '%';
    if (msg && stageLabel) stageLabel.textContent = msg;
  }

  function errMsg(e) {
    if (!e) return 'خطأ غير معروف';
    if (typeof e === 'string') return e;
    if (e.message) return e.message;
    return String(e);
  }

  async function fetchProxied(url, estSize, onPct) {
    const proxied = CORS_PROXY + url;
    const res = await fetch(proxied);
    if (!res.ok) throw new Error('فشل التنزيل من يوتيوب (' + res.status + ')');
    if (!res.body) return new Uint8Array(await res.arrayBuffer());
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (estSize > 0) onPct(Math.min(99, (received / estSize) * 100));
      else onPct(Math.min(99, received / (5 * 1024 * 1024) * 100));
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) { merged.set(c, offset); offset += c.length; }
    onPct(100);
    return merged;
  }

  function sanitize(s) {
    return (s || 'video').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
  }
  function triggerDownload(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  async function loadFFmpegLib() {
    if (window.FFmpegWASM) return window.FFmpegWASM;
    console.log('[mux.js] loading FFmpeg lib from:', FFMPEG_LIB_URL);
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = FFMPEG_LIB_URL;
      s.onload = resolve;
      s.onerror = () => reject(new Error('تعذّر تحميل مكتبة FFmpeg'));
      document.head.appendChild(s);
    });
    if (!window.FFmpegWASM) throw new Error('مكتبة FFmpeg غير متاحة بعد التحميل');
    return window.FFmpegWASM;
  }

  async function loadFFmpeg() {
    if (ffmpeg) return ffmpeg;
    const { FFmpeg } = await loadFFmpegLib();
    const ff = new FFmpeg();
    ff.on('log', ({ message }) => console.log('[ffmpeg log]', message));
    console.log('[mux.js] loading worker:', WORKER_URL);
    console.log('[mux.js] loading core:', CORE_URL);
    console.log('[mux.js] loading wasm:', WASM_URL);
    await ff.load({
      coreURL: CORE_URL,
      wasmURL: WASM_URL,
      classWorkerURL: WORKER_URL,
    });
    ffmpeg = ff;
    return ff;
  }

  async function getFreshUrls() {
    if (!videoId || videoId.length !== 11) {
      throw new Error('معرّف الفيديو غير صالح');
    }
    const res = await fetch('/api/fresh_urls/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: videoId, height, ext: vExt }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل استخراج الروابط');
    return data;
  }

  if (muxBtn) {
    muxBtn.addEventListener('click', async () => {
      muxBtn.disabled = true;
      prog.hidden = false;
      const original = muxBtn.querySelector('.dl-btn-title').textContent;
      muxBtn.querySelector('.dl-btn-title').textContent = 'جارٍ المعالجة…';

      try {
        setStage('fresh');
        setPct(2, 'استخراج روابط حديثة من يوتيوب…');
        const fresh = await getFreshUrls();
        const videoUrl = fresh.video_url;
        const audioUrl = fresh.audio_url;
        const title = fresh.title || D.title;
        if (!videoUrl) throw new Error('لم يتم العثور على رابط الفيديو');
        setPct(5, 'تم استخراج الروابط الحديثة');

        setStage('engine');
        setPct(6, 'تحميل محرك الدمج…');
        const ff = await loadFFmpeg();

        setStage('video');
        setPct(8, 'تنزيل ملف الفيديو من يوتيوب…');
        const estVideo = 25 * 1024 * 1024;
        const videoData = await fetchProxied(videoUrl, estVideo, (p) => setPct(8 + p * 0.4, 'تنزيل ملف الفيديو…'));
        await ff.writeFile(`video.${vExt}`, videoData);
        setPct(48, 'اكتمل تنزيل الفيديو');

        if (audioUrl) {
          setStage('audio');
          setPct(50, 'تنزيل ملف الصوت من يوتيوب…');
          const estAudio = 4 * 1024 * 1024;
          const audioData = await fetchProxied(audioUrl, estAudio, (p) => setPct(50 + p * 0.3, 'تنزيل ملف الصوت…'));
          await ff.writeFile('audio.m4a', audioData);
          setPct(80, 'اكتمل تنزيل الصوت');
        }

        setStage('mux');
        setPct(82, 'دمج الفيديو والصوت…');
        const outName = `output.${vExt}`;
        const args = ['-i', `video.${vExt}`];
        if (audioUrl) args.push('-i', 'audio.m4a');
        args.push('-c', 'copy', '-movflags', '+faststart', outName);
        await ff.exec(args);

        setStage('done');
        setPct(94, 'إعداد الملف النهائي…');
        const data = await ff.readFile(outName);
        const blob = new Blob([data.buffer], { type: `video/${vExt}` });
        triggerDownload(blob, `${sanitize(title)}_${D.height}p.${vExt}`);

        setDone();
        setPct(100, 'تم! الملف المدمج يُنزّل الآن');
        stageLabel.classList.add('ok');
      } catch (err) {
        console.error('[mux.js] mux error:', err);
        setErr(errMsg(err));
      } finally {
        muxBtn.disabled = false;
        muxBtn.querySelector('.dl-btn-title').textContent = original;
      }
    });
  }

  if (directBtn) {
    directBtn.addEventListener('click', async () => {
      directBtn.disabled = true;
      const original = directBtn.querySelector('.dl-btn-title').textContent;
      directBtn.querySelector('.dl-btn-title').textContent = 'جارٍ التحضير…';

      try {
        const fresh = await getFreshUrls();
        const url = fresh.video_url;
        const title = fresh.title || D.title;
        if (!url) throw new Error('لم يتم العثور على رابط التنزيل');

        directBtn.querySelector('.dl-btn-title').textContent = 'تنزيل من يوتيوب…';
        const data = await fetchProxied(url, 25 * 1024 * 1024, () => {});
        const mime = fmtType === 'audio' ? `audio/${vExt}` : `video/${vExt}`;
        const blob = new Blob([data.buffer], { type: mime });
        const suffix = fmtType === 'audio' ? '' : `_${D.height}p`;
        triggerDownload(blob, `${sanitize(title)}${suffix}.${vExt}`);
      } catch (err) {
        console.error('[mux.js] download error:', err);
        alert('فشل التنزيل: ' + errMsg(err));
      } finally {
        directBtn.disabled = false;
        directBtn.querySelector('.dl-btn-title').textContent = original;
      }
    });
  }
})();
