from django.contrib.sitemaps import Sitemap
from django.urls import reverse

class StaticViewSitemap(Sitemap):
    changefreq = "daily"
    priority = 1.0

    def items(self):
        return ["index"]  # أو اسم الصفحة الرئيسية عندك

    def location(self, item):
        return reverse(item)