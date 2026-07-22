"""RapidAPI YouTube download client (youtube-download-info-api)."""
import re

import requests
from django.conf import settings


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


def sanitize_filename(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', '_', name or 'video')[:80]


VIDEO_FORMATS = [
    {'format': '1080', 'label': '1080p', 'ext': 'mp4', 'note': 'Full HD · MP4 + Audio'},
    {'format': '720', 'label': '720p', 'ext': 'mp4', 'note': 'HD · MP4 + Audio'},
    {'format': '480', 'label': '480p', 'ext': 'mp4', 'note': 'MP4 + Audio'},
    {'format': '360', 'label': '360p', 'ext': 'mp4', 'note': 'MP4 + Audio'},
]

AUDIO_FORMATS = [
    {'format': 'mp3', 'label': 'MP3', 'ext': 'mp3', 'bitrate': 320, 'note': 'MP3 · 320 kbps'},
    {'format': 'mp3', 'label': 'MP3', 'ext': 'mp3', 'bitrate': 256, 'note': 'MP3 · 256 kbps'},
    {'format': 'mp3', 'label': 'MP3', 'ext': 'mp3', 'bitrate': 128, 'note': 'MP3 · 128 kbps'},
    {'format': 'm4a', 'label': 'M4A', 'ext': 'm4a', 'bitrate': 256, 'note': 'M4A · 256 kbps'},
    {'format': 'm4a', 'label': 'M4A', 'ext': 'm4a', 'bitrate': 128, 'note': 'M4A · 128 kbps'},
]


def _headers():
    return {
        'Content-Type': 'application/json',
        'x-rapidapi-host': settings.RAPIDAPI_HOST,
        'x-rapidapi-key': settings.RAPIDAPI_KEY,
    }


def request_download(video_url: str, fmt: str, audio_quality: int = 128):
    params = {
        'format': fmt,
        'url': video_url,
        'audio_quality': str(audio_quality),
        'audio_language': 'en',
    }
    resp = requests.get(
        f'https://{settings.RAPIDAPI_HOST}/api/download',
        headers=_headers(), params=params, timeout=30,
    )
    return resp.json()
