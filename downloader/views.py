import json
import time
import urllib.parse

import requests
from django.http import HttpResponse, JsonResponse, StreamingHttpResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .rapidapi_client import (
    request_download,
    resolve_video_id,
    sanitize_filename,
    VIDEO_FORMATS,
    AUDIO_FORMATS,
)


def index(request):
    return render(request, 'index.html', {
        'video_formats': VIDEO_FORMATS,
        'audio_formats': AUDIO_FORMATS,
    })


@csrf_exempt
@require_http_methods(['POST'])
def api_request(request):
    try:
        body = json.loads(request.body or b'{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    url = (body.get('url') or '').strip()
    fmt = (body.get('format') or '').strip()
    audio_quality = body.get('audio_quality', 128)

    if not url or not fmt:
        return JsonResponse({'error': 'missing url or format'}, status=400)

    video_id = resolve_video_id(url)
    if not video_id:
        return JsonResponse({'error': 'Invalid YouTube URL'}, status=400)

    video_url = f'https://www.youtube.com/watch?v={video_id}'

    try:
        audio_quality = int(audio_quality)
    except (TypeError, ValueError):
        audio_quality = 128

    try:
        data = request_download(video_url, fmt, audio_quality=audio_quality)
    except Exception:
        return JsonResponse({'error': 'Failed to connect to download service'}, status=502)

    if not data.get('success'):
        return JsonResponse({'error': 'Download request failed'}, status=502)

    progress_url = data.get('progress_url')
    image = data.get('image', '')
    if not progress_url:
        return JsonResponse({'error': 'No progress URL returned'}, status=502)

    return JsonResponse({
        'progress_url': progress_url,
        'video_id': video_id,
        'image': image,
    })


@csrf_exempt
@require_http_methods(['POST'])
def api_progress(request):
    try:
        body = json.loads(request.body or b'{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid request'}, status=400)

    progress_url = (body.get('progress_url') or '').strip()
    if not progress_url:
        return JsonResponse({'error': 'missing progress_url'}, status=400)

    try:
        resp = requests.get(progress_url, timeout=30)
        data = resp.json()
    except Exception:
        return JsonResponse({'error': 'Failed to check progress'}, status=502)

    return JsonResponse(data)


def _fetch_download_url(progress_url: str, timeout: float = 180):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            resp = requests.get(progress_url, timeout=30)
            data = resp.json()
            if data.get('success') == 1 and data.get('download_url'):
                return data
        except Exception:
            pass
        time.sleep(2.5)
    return None


@require_http_methods(['GET', 'OPTIONS'])
def stream_proxy(request):
    if request.method == 'OPTIONS':
        response = HttpResponse()
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Range'
        response['Access-Control-Expose-Headers'] = 'Content-Length, Content-Range, Content-Disposition'
        return response

    progress_url = request.GET.get('p', '').strip()
    title = request.GET.get('title', '').strip()

    if not progress_url:
        return HttpResponse('missing p parameter', status=400)

    data = _fetch_download_url(progress_url)
    if not data or not data.get('download_url'):
        return HttpResponse('Failed to prepare file', status=502)

    download_url = data['download_url']
    resolved_title = title or data.get('title') or 'video'
    filename = sanitize_filename(resolved_title)

    if filename.lower().endswith('.mp3'):
        content_type = 'audio/mpeg'
        ext = 'mp3'
    elif filename.lower().endswith('.m4a'):
        content_type = 'audio/mp4'
        ext = 'm4a'
    else:
        content_type = 'video/mp4'
        ext = 'mp4'
    if not filename.lower().endswith(f'.{ext}'):
        filename = f'{filename}.{ext}'

    try:
        upstream = requests.get(download_url, stream=True, timeout=60)
    except Exception:
        return HttpResponse('Failed to connect to source', status=502)

    if upstream.status_code != 200:
        return HttpResponse(f'Source returned {upstream.status_code}', status=502)

    response = StreamingHttpResponse(
        upstream.iter_content(chunk_size=64 * 1024),
        content_type=content_type,
    )
    response['Access-Control-Allow-Origin'] = '*'
    response['Accept-Ranges'] = 'bytes'
    encoded = urllib.parse.quote(filename)
    response['Content-Disposition'] = f'attachment; filename="{filename}"; filename*=UTF-8\'\'{encoded}'
    cl = upstream.headers.get('Content-Length')
    if cl:
        response['Content-Length'] = cl
    return response


@require_http_methods(['GET'])
def robots(request):
    host = request.build_absolute_uri('/').rstrip('/')
    body = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        "Disallow: /stream/\n"
        f"\nSitemap: {host}/sitemap.xml\n"
    )
    return HttpResponse(body, content_type='text/plain; charset=utf-8')


@require_http_methods(['GET'])
def sitemap(request):
    host = request.build_absolute_uri('/').rstrip('/')
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f'  <url>\n    <loc>{host}/</loc>\n'
        '    <changefreq>daily</changefreq>\n'
        '    <priority>1.0</priority>\n'
        '  </url>\n'
        '</urlset>\n'
    )
    return HttpResponse(body, content_type='application/xml')



from django.http import HttpResponse

def robots_txt(request):
    return HttpResponse(
        """User-agent: *
Allow: /

Sitemap: https://arayoutubedownloader.up.railway.app/sitemap.xml
""",
        content_type="text/plain",
    )



from django.http import HttpResponse

def google_verify(request):
    return HttpResponse(
        "google-site-verification: google55e2cfdb79c0b019.html",
        content_type="text/plain",
    )