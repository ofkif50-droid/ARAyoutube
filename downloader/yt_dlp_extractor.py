"""YouTube extraction using yt-dlp (pure Python, no external API).

ALL imports of yt_dlp are done lazily inside functions so that this module
(and therefore the whole Django WSGI app) imports cleanly even if yt_dlp
fails to install or import on some Python versions.

The extractor tries multiple YouTube player clients to get the widest range
of formats (up to 4K). Each format returns a DIRECT external download URL
that the browser can download directly — no server-side proxying needed.
"""
import re
import tempfile
import os


def sanitize_filename(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', '_', name or 'video')[:80]


YOUTUBE_ID_RE = re.compile(
    r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)'
    r'([A-Za-z0-9_-]{11})'
)


def resolve_video_id(query: str):
    q = (query or '').strip()
    if not q or len(q) > 2048:
        return None
    m = YOUTUBE_ID_RE.search(q)
    if m:
        return m.group(1)
    if re.fullmatch(r'[A-Za-z0-9_-]{11}', q):
        return q
    return None


VIDEO_HEIGHTS = [2160, 1440, 1080, 720, 480, 360, 240, 144]
AUDIO_BITRATES = [320, 256, 128]


def _estimate_size(tbr_kbps: float, duration_sec: int) -> int:
    if not tbr_kbps or not duration_sec:
        return 0
    return int(tbr_kbps * 125 * duration_sec)


def _extract_full(video_id: str) -> dict:
    """Full format extraction using multiple player clients for max quality."""
    import yt_dlp
    url = f'https://www.youtube.com/watch?v={video_id}'
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'noplaylist': True,
        'extractor_args': {'youtube': {'player_client': ['web_safari', 'mweb', 'ios', 'tv']}},
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(url, download=False)


def _extract_flat(video_id: str) -> dict:
    """Fallback: flat extraction gives at least one combined format."""
    import yt_dlp
    url = f'https://www.youtube.com/watch?v={video_id}'
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'noplaylist': True,
        'extract_flat': 'in_playlist',
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(url, download=False)


def _pick_best_video_format(formats, height):
    """Pick the best progressive (video+audio) format for a given height."""
    candidates = []
    for f in formats:
        vcodec = f.get('vcodec', 'none')
        acodec = f.get('acodec', 'none')
        h = f.get('height') or 0
        if vcodec == 'none' or acodec == 'none':
            continue
        if h != height:
            continue
        candidates.append(f)
    if not candidates:
        return None
    candidates.sort(key=lambda f: f.get('tbr', 0), reverse=True)
    return candidates[0]


def _pick_best_audio_format(formats, abr):
    """Pick the best audio-only format for a given bitrate."""
    candidates = []
    for f in formats:
        vcodec = f.get('vcodec', 'none')
        acodec = f.get('acodec', 'none')
        a = f.get('abr') or 0
        if vcodec != 'none' or acodec == 'none':
            continue
        if a == abr:
            candidates.append(f)
    if not candidates:
        return None
    candidates.sort(key=lambda f: f.get('tbr', 0), reverse=True)
    return candidates[0]


def extract_video_info(video_id: str) -> dict:
    """Extract video metadata + direct download URLs for all qualities."""
    title = 'فيديو يوتيوب'
    author = '—'
    duration = 0
    view_count = 0
    thumbnail = f'https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg'
    video_downloads = {}
    audio_downloads = {}

    try:
        info = _extract_full(video_id)
        title = info.get('title', '') or title
        author = info.get('uploader', '') or info.get('channel', '') or author
        duration = info.get('duration', 0) or duration
        view_count = info.get('view_count', 0) or view_count
        thumbnail = info.get('thumbnail', '') or thumbnail

        formats = info.get('formats', [])

        for height in VIDEO_HEIGHTS:
            f = _pick_best_video_format(formats, height)
            if f and f.get('url'):
                filesize = f.get('filesize') or f.get('filesize_approx') or 0
                tbr = f.get('tbr') or 0
                ext = f.get('ext', 'mp4')
                video_downloads[height] = {
                    'url': f['url'],
                    'size': filesize or _estimate_size(tbr, duration),
                    'ext': ext,
                    'filename': f'{sanitize_filename(title)}.{ext}',
                }

        for abr in AUDIO_BITRATES:
            f = _pick_best_audio_format(formats, abr)
            if f and f.get('url'):
                filesize = f.get('filesize') or f.get('filesize_approx') or 0
                ext = f.get('ext', 'm4a')
                audio_downloads[abr] = {
                    'url': f['url'],
                    'size': filesize or _estimate_size(abr, duration),
                    'ext': ext,
                    'abr': abr,
                    'filename': f'{sanitize_filename(title)}.{ext}',
                }
    except Exception:
        pass

    if not video_downloads:
        try:
            info = _extract_flat(video_id)
            title = info.get('title', '') or title
            author = info.get('uploader', '') or info.get('channel', '') or author
            duration = info.get('duration', 0) or duration
            view_count = info.get('view_count', 0) or view_count
            thumbnail = info.get('thumbnail', '') or thumbnail

            url = info.get('url', '')
            height = info.get('height') or 360
            tbr = info.get('tbr') or 0
            ext = info.get('ext', 'mp4')

            if url and height in VIDEO_HEIGHTS:
                video_downloads[height] = {
                    'url': url,
                    'size': _estimate_size(tbr, duration),
                    'ext': ext,
                    'filename': f'{sanitize_filename(title)}.{ext}',
                }
        except Exception:
            pass

    return {
        'video_id': video_id,
        'title': title,
        'filename': sanitize_filename(title),
        'author': author,
        'duration': duration,
        'view_count': view_count,
        'thumbnail': thumbnail,
        'embed_url': f'https://www.youtube.com/embed/{video_id}?rel=0&modestbranding=1',
        'video_downloads': {str(h): video_downloads[h] for h in VIDEO_HEIGHTS if h in video_downloads},
        'audio_downloads': {str(b): audio_downloads[b] for b in AUDIO_BITRATES if b in audio_downloads},
    }


def download_audio_stream(video_id: str, abr: int, filename_base: str):
    """Download audio using yt-dlp to a temp file, return (path, tmpdir, ext)."""
    import yt_dlp

    tmpdir = tempfile.mkdtemp(prefix='ytdl_')
    out_template = os.path.join(tmpdir, 'audio.%(ext)s')

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'format': f'bestaudio[abr<={abr}]/bestaudio/best',
        'outtmpl': out_template,
        'noplaylist': True,
        'extractor_args': {'youtube': {'player_client': ['web_safari', 'mweb', 'ios', 'tv']}},
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'm4a',
            'preferredquality': str(abr),
        }],
    }

    url = f'https://www.youtube.com/watch?v={video_id}'

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    out_path = os.path.join(tmpdir, 'audio.m4a')
    if not os.path.exists(out_path):
        for fn in os.listdir(tmpdir):
            if fn.startswith('audio'):
                out_path = os.path.join(tmpdir, fn)
                break

    if not os.path.exists(out_path):
        raise RuntimeError('فشل تنزيل الصوت.')

    return out_path, tmpdir, 'm4a'
