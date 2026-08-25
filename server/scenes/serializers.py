from rest_framework import serializers
from .models import Scene

class SceneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Scene
        fields = ["id", "image", "created_at"]
        read_only_fields = ["id", "created_at"]