from typing import Literal

from pydantic import BaseModel, Field

ALLOWED_OBJECT_TYPES = Literal[
    "table",
    "chair",
    "sofa",
    "bed",
    "plant",
    "desk",
    "cabinet",
    "lamp",
    "tv",
    "generic",
]

class RoomSizeHint(BaseModel):
    width: float
    height: float
    depth: float
    

class SceneObject(BaseModel):
    id: str = Field(min_length=1)
    type: ALLOWED_OBJECT_TYPES
    
    x: float
    y: float
    z: float
    
    width: float
    height: float
    depth: float

class SceneData(BaseModel):
    room_size_hint: RoomSizeHint
    objects: list[SceneObject]
    
