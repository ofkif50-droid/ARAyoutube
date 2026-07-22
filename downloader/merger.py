"""Server-side video+audio merging using ffmpeg.

Downloads the video and audio streams from YouTube (via yt-dlp fresh URLs),
muxes them with ffmpeg (-c copy, no re-encode), and streams the result back
to the browser as a downloadable file.
"""
import io
import os
import re
import subprocess
import tempfile
import threading
import urllib.request

import static_ffmpeg

_FFMPEG_READY = False
_LOCK = threading.Lock()


def _ensure_ffmpeg():
    global _FFMPEG_READY
    with _LOCK:
        if not _FFMPEG_READY:
            static_ffmpeg.add_paths()
            _FFMPEG_READY = True


def _download(url: str, dest: str, timeout: int = 120) -> int:
    """Stream-download a URL to a file. Returns bytes written."""
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    total = 0
    with urllib.request.urlopen(req, timeout=timeout) as resp, open(dest, 'wb') as f:
        while True:
            chunk = resp.read(64 * 1024)
            if not chunk:
                break
            f.write(chunk)
            total += len(chunk)
    return total


def merge_streams(video_url: str, audio_url: str | None, ext: str = 'mp4') -> bytes:
    """Download video (+audio) from YouTube and mux into a single file.

    Returns the merged file contents as bytes.
    """
    _ensure_ffmpeg()

    tmpdir = tempfile.mkdtemp(prefix='ytmux_')
    try:
        video_path = os.path.join(tmpdir, f'video.{ext}')
        audio_path = os.path.join(tmpdir, 'audio.m4a') if audio_url else None
        out_path = os.path.join(tmpdir, f'output.{ext}')

        _download(video_url, video_path)
        if audio_path:
            _download(audio_url, audio_path)

        cmd = ['ffmpeg', '-y', '-i', video_path]
        if audio_path:
            cmd += ['-i', audio_path]
        cmd += ['-c', 'copy', '-movflags', '+faststart', out_path]

        result = subprocess.run(
            cmd, capture_output=True, timeout=300,
        )
        if result.returncode != 0:
            err = result.stderr.decode('utf-8', errors='replace')[-500:]
            raise RuntimeError(f'ffmpeg failed (code {result.returncode}): {err}')

        with open(out_path, 'rb') as f:
            return f.read()
    finally:
        for p in [os.path.join(tmpdir, x) for x in os.listdir(tmpdir)]:
            try: os.remove(p)
            except OSError: pass
        try: os.rmdir(tmpdir)
        except OSError: pass
