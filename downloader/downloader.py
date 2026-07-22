"""Server-side audio extraction (ffmpeg) — used for audio downloads."""
import os
import subprocess
import tempfile

import requests
import static_ffmpeg
from django.http import StreamingHttpResponse

static_ffmpeg.add_paths()

MAX_SOURCE_BYTES = 1024 * 1024 * 1024


def _cleanup(tmpdir: str):
    try:
        for fn in os.listdir(tmpdir):
            os.remove(os.path.join(tmpdir, fn))
        os.rmdir(tmpdir)
    except OSError:
        pass


def download_audio(video_id: str, abr: int, source_url: str, filename_base: str) -> StreamingHttpResponse:
    if not source_url or not source_url.startswith('https://'):
        raise RuntimeError('لا يوجد رابط مصدر متاح للصوت.')

    from urllib.parse import urlparse
    host = urlparse(source_url).hostname or ''
    if not host.endswith('pictube.app'):
        raise RuntimeError('مصدر الصوت غير موثوق.')

    tmpdir = tempfile.mkdtemp(prefix='ytdl_')
    try:
        video_path = os.path.join(tmpdir, 'input.mp4')
        r = requests.get(source_url, stream=True, timeout=60,
                         headers={'User-Agent': 'Mozilla/5.0'})
        r.raise_for_status()
        downloaded = 0
        with open(video_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=64 * 1024):
                if chunk:
                    downloaded += len(chunk)
                    if downloaded > MAX_SOURCE_BYTES:
                        raise RuntimeError('حجم المصدر أكبر من الحد المسموح.')
                    f.write(chunk)

        audio_ext = 'm4a'
        out_path = os.path.join(tmpdir, f'audio.{audio_ext}')
        cmd = ['ffmpeg', '-y', '-i', video_path, '-vn',
               '-c:a', 'aac', '-b:a', f'{abr}k', out_path]
        r2 = subprocess.run(cmd, capture_output=True, timeout=300)
        if r2.returncode != 0:
            raise RuntimeError(f'ffmpeg failed: {r2.stderr.decode()[-400:]}')

        size = os.path.getsize(out_path)

        def file_iterator():
            try:
                with open(out_path, 'rb') as f:
                    while True:
                        chunk = f.read(64 * 1024)
                        if not chunk:
                            break
                        yield chunk
            finally:
                _cleanup(tmpdir)

        safe_name = filename_base or 'audio'
        resp = StreamingHttpResponse(file_iterator(), content_type=f'audio/{audio_ext}')
        resp['Content-Length'] = str(size)
        resp['Content-Disposition'] = f'attachment; filename="{safe_name}.{audio_ext}"'
        return resp
    except Exception:
        _cleanup(tmpdir)
        raise
