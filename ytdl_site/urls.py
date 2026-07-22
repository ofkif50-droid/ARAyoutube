from django.urls import path
from downloader import views
from django.urls import path, include
from django.contrib.sitemaps.views import sitemap
from ytdl_site.sitemaps import StaticViewSitemap
from django.http import HttpResponse
from downloader.views import robots_txt
from downloader.views import google_verify


from django.urls import path, include
from django.contrib.sitemaps.views import sitemap
from ytdl_site.sitemaps import StaticViewSitemap

from django.http import HttpResponse

sitemaps = {
    "static": StaticViewSitemap,
}

def robots_txt(request):
    return HttpResponse(
        "User-agent: *\n"
        "Allow: /\n\n"
        "Sitemap: https://arayoutubedownloader.up.railway.app/sitemap.xml",
        content_type="text/plain",
    )

urlpatterns = [ 
     path("sitemap.xml", sitemap, {"sitemaps": sitemaps}),
    path("robots.txt", robots_txt),
    path('', views.index, name='index'),
    path('api/request/', views.api_request, name='api_request'),
    path('api/progress/', views.api_progress, name='api_progress'),
    path('stream/', views.stream_proxy, name='stream_proxy'),
    path('robots.txt', views.robots, name='robots'),
    path('sitemap.xml', views.sitemap, name='sitemap'),
      path(
        "google55e2cfdb79c0b019.html",
        google_verify,
    ),
    

]
