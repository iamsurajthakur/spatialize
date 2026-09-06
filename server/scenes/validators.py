"""Validate final geometry without silently moving it after debug was recorded."""

from .geometry_engine import footprint
from .schemas import SceneData


def validate_scene_json(data: dict) -> dict:
    scene = SceneData.model_validate(data)
    room = scene.canonical_room
    for obj in scene.objects:
        hx, hz = footprint(obj)
        if (abs(obj.x) + hx > room.width / 2 + 1e-6
                or abs(obj.z) + hz > room.depth / 2 + 1e-6
                or obj.y - obj.height / 2 < -1e-6
                or obj.y + obj.height / 2 > room.height + 1e-6):
            raise ValueError(f"Object {obj.id} exceeds canonical room bounds")
    return scene.model_dump()
