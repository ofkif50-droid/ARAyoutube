"""Extract YouTube video metadata via oEmbed (no bot detection issues)."""
import re
import requests


def sanitize_filename(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', '_', name or 'video')[:80]


def extract_video_info(video_id: str) -> dict:
    url = f'https://www.youtube.com/watch?v={video_id}'
    title = ''
    author = ''
    thumbnail = f'https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg'

    try:
        r = requests.get(
            'https://www.youtube.com/oembed',
            params={'url': url, 'format': 'json'},
            timeout=10,
            headers={'User-Agent': 'Mozilla/5.0'},
        )
        if r.status_code == 200:
            data = r.json()
            title = data.get('title', '')
            author = data.get('author_name', '')
            thumbnail = data.get('thumbnail_url') or thumbnail
    except Exception:
        pass

    return {
        'video_id': video_id,
        'title': title or 'فيديو يوتيوب',
        'filename': sanitize_filename(title or 'video'),
        'author': author or '—',
        'duration': 0,
        'thumbnail': thumbnail,
        'view_count': 0,
        'embed_url': f'https://www.youtube.com/embed/{video_id}?rel=0&modestbranding=1',
    }
