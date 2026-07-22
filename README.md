# Ara Downloader YouTube

YouTube downloader using RapidAPI (youtube-info-download-api).

## Quick deploy to Render

1. Push this repo to GitHub
2. Go to render.com → New → Web Service → connect your repo
3. Set environment variables:
   - `DJANGO_SECRET_KEY` — random 50+ char string
   - `DJANGO_ALLOWED_HOSTS` — `your-app.onrender.com`
   - `DJANGO_CSRF_TRUSTED_ORIGINS` — `https://your-app.onrender.com`
   - `DJANGO_DEBUG` — `false`
   - `DJANGO_SECURE_SSL_REDIRECT` — `true`
   - `RAPIDAPI_KEY` — your RapidAPI key
   - `RAPIDAPI_HOST` — `youtube-info-download-api.p.rapidapi.com`
4. Render auto-detects `render.yaml`

## Local dev

```bash
DJANGO_DEBUG=true python manage.py runserver
```
