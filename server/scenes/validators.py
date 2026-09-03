from .schemas import SceneData


ALLOWED_TYPES = {
    "table",
    "chair",
    "sofa",
    "bed",
    "desk",
    "plant",
    "cabinet",
    "lamp",
    "tv",
    "generic",
}


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(value, maximum))


def validate_scene_json(data: dict) -> dict:
    scene = SceneData.model_validate(data)

    room = scene.room_size_hint

    for obj in scene.objects:

        if obj.type not in ALLOWED_TYPES:
            obj.type = "generic"

        obj.x = clamp(
            obj.x,
            -room.width / 2,
            room.width / 2,
        )

        obj.y = clamp(
            obj.y,
            0,
            room.height,
        )

        obj.z = clamp(
            obj.z,
            -room.depth / 2,
            room.depth / 2,
        )

        obj.width = clamp(
            obj.width,
            0.1,
            room.width,
        )

        obj.height = clamp(
            obj.height,
            0.1,
            room.height,
        )

        obj.depth = clamp(
            obj.depth,
            0.1,
            room.depth,
        )

    return scene.model_dump()