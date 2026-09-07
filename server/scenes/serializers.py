from rest_framework import serializers
from .models import Scene


class SceneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Scene
        fields = ["id", "image", "scene_data", "status", "created_at"]
        read_only_fields = ["id", "scene_data", "status", "created_at"]
