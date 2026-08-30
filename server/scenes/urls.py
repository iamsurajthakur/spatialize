from django.urls import path
from .views import SceneCreateView, SceneDetailView, ping

urlpatterns = [
    path("ping/", ping),
    path("scenes/", SceneCreateView.as_view()),
    path("scenes/<int:pk>/", SceneDetailView.as_view())
]