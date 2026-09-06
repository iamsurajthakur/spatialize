from typing import Annotated, Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator


UnitFloat = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
PositiveFloat = Annotated[float, Field(gt=0, allow_inf_nan=False)]
ALLOWED_OBJECT_TYPES = Literal[
    "table", "chair", "sofa", "bed", "plant", "desk", "cabinet", "lamp", "tv", "generic"
]
COORDINATE_CONVENTION = "floor_center_y_up_positive_z_front_v1"


class CanonicalRoom(BaseModel):
    """Arbitrary layout units, never a measurement inferred by the VLM."""

    model_config = ConfigDict(frozen=True)
    width: PositiveFloat
    height: PositiveFloat
    depth: PositiveFloat


class SceneObject(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    id: str = Field(min_length=1)
    type: ALLOWED_OBJECT_TYPES
    x: float
    y: float
    z: float
    rotation_y: float = 0.0  # Degrees; unrotated object's front faces +Z.
    width: PositiveFloat
    height: PositiveFloat
    depth: PositiveFloat


class SceneData(BaseModel):
    # Read old payloads, but only emit the explicit canonical name.
    canonical_room: CanonicalRoom = Field(
        validation_alias=AliasChoices("canonical_room", "room_size_hint")
    )
    coordinate_convention: Literal["floor_center_y_up_positive_z_front_v1"] = COORDINATE_CONVENTION
    objects: list[SceneObject]
    camera: dict[str, Any] | None = None
    debug_info: dict[str, Any] = Field(default_factory=dict)


class Point2D(BaseModel):
    x: UnitFloat
    y: UnitFloat


class BoundingBox2D(BaseModel):
    x_min: UnitFloat
    y_min: UnitFloat
    x_max: UnitFloat
    y_max: UnitFloat

    @model_validator(mode="after")
    def ordered(self):
        if self.x_min >= self.x_max or self.y_min >= self.y_max:
            raise ValueError("bbox must have positive width and height")
        return self

    def bottom_center(self) -> Point2D:
        return Point2D(x=(self.x_min + self.x_max) / 2, y=self.y_max)


class WallRelation(BaseModel):
    type: Literal["against", "against_wall", "centered_on", "near"]
    target: Literal["back_wall", "front_wall", "left_wall", "right_wall", "floor"]


class SpatialRelation(BaseModel):
    type: Literal[
        "beside", "left_of", "right_of", "in_front_of", "behind", "near",
        "against", "against_wall", "facing", "centered_on_wall"
    ]
    target: str


class RoomLandmarks(BaseModel):
    """Corners of ONE rectangular floor patch, not four arbitrary floor pixels.

    Front corners may define an inferred near cross-section of the room. In that
    case the canonical front boundary is that cross-section, not a measured wall.
    """

    back_left_corner: Point2D | None = None
    back_right_corner: Point2D | None = None
    left_front_floor: Point2D | None = None
    right_front_floor: Point2D | None = None
    confidence: UnitFloat = 0.5
    front_boundary: Literal["wall", "visible_floor_extent"] = "visible_floor_extent"
    projection_hint: Literal["orthographic", "perspective", "unknown"] = "unknown"


class SceneGeometryInputObject(BaseModel):
    id: str = Field(min_length=1)
    type: ALLOWED_OBJECT_TYPES
    bbox: BoundingBox2D
    center: Point2D | None = None  # Legacy descriptive field; never a depth anchor.
    floor_contact: Point2D | None = Field(
        default=None,
        description="Image projection of the CENTER of the footprint on the floor, including occluded floor. Null if unreliable.",
    )
    region: Literal[
        "back_left", "back_center", "back_right", "center_left", "center",
        "center_right", "front_left", "front_center", "front_right"
    ] = "center"
    wall_relation: WallRelation | None = None
    relations: list[SpatialRelation] = Field(default_factory=list)
    orientation: str = "unknown"
    support: str = "floor"
    confidence: UnitFloat = 0.5


class SceneAnalysis(BaseModel):
    room_landmarks: RoomLandmarks | None = None
    objects: list[SceneGeometryInputObject]

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [obj.id for obj in self.objects]
        if len(ids) != len(set(ids)):
            raise ValueError("Object IDs must be unique")
        return self


class SceneGeometryInput(SceneAnalysis):
    # Supplied from image pixels by the server, not requested from the VLM.
    image_aspect_ratio: PositiveFloat = 1.0
    analysis_notes: list[str] = Field(default_factory=list)
