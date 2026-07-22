from django.urls import path
from downloader import views

urlpatterns = [
    path('', views.index, name='index'),
    path('api/request/', views.api_request, name='api_request'),
    path('api/progress/', views.api_progress, name='api_progress'),
    path('stream/', views.stream_proxy, name='stream_proxy'),
    path('robots.txt', views.robots, name='robots'),
    path('sitemap.xml', views.sitemap, name='sitemap'),
]
