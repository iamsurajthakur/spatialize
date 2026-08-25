from django.urls import path
from .views import SceneCreateView, ping

urlpatterns = [
    path("ping/", ping),
    path("scenes/", SceneCreateView.as_view()),
]