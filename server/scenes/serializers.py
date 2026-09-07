import math

from rest_framework import serializers

from .models import Scene


class SceneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Scene
        fields = [
            "id",
            "image",
            "scene_data",
            "manual_overrides",
            "status",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "scene_data",
            "manual_overrides",
            "status",
            "created_at",
        ]


class ManualOverridesSerializer(serializers.Serializer):
    """Replace only the override map; generated geometry is always read-only."""

    manual_overrides = serializers.JSONField()

    def validate(self, attrs):
        if set(self.initial_data) != {"manual_overrides"}:
            raise serializers.ValidationError("Only manual_overrides may be updated.")
        return attrs

    def validate_manual_overrides(self, overrides):
        if not isinstance(overrides, dict):
            raise serializers.ValidationError(
                "Expected an object keyed by scene object ID."
            )
        scene = self.instance
        if scene.status != "completed":
            raise serializers.ValidationError("Only completed scenes can be edited.")
        objects = {obj["id"]: obj for obj in scene.scene_data.get("objects", [])}
        room = scene.scene_data.get("canonical_room") or scene.scene_data.get(
            "room_size_hint"
        )
        if not room:
            raise serializers.ValidationError("Scene has no room dimensions.")
        for object_id, transform in overrides.items():
            if object_id not in objects:
                raise serializers.ValidationError(f"Unknown object: {object_id}.")
            if not isinstance(transform, dict) or set(transform) != {
                "x",
                "z",
                "rotation_y",
            }:
                raise serializers.ValidationError(
                    f"{object_id}: expected x, z and rotation_y only."
                )
            for value in transform.values():
                try:
                    valid = type(value) in (int, float) and math.isfinite(value)
                except OverflowError:
                    valid = False
                if not valid:
                    raise serializers.ValidationError(
                        f"{object_id}: transforms must be finite numbers."
                    )
            obj = objects[object_id]
            angle = math.radians(transform["rotation_y"] % 360)
            c, s = abs(math.cos(angle)), abs(math.sin(angle))
            hx = (c * obj["width"] + s * obj["depth"]) / 2
            hz = (s * obj["width"] + c * obj["depth"]) / 2
            if (
                abs(transform["x"]) + hx > room["width"] / 2 + 1e-7
                or abs(transform["z"]) + hz > room["depth"] / 2 + 1e-7
            ):
                raise serializers.ValidationError(
                    f"{object_id}: rotated footprint must remain inside the room."
                )
        return overrides

    def update(self, instance, validated_data):
        instance.manual_overrides = validated_data["manual_overrides"]
        instance.save(update_fields=["manual_overrides"])
        return instance
