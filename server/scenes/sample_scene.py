"""Offline annotated example using the same canonical geometry pipeline as uploads.

The fixture is a manual diagnostic; it is not a recorded VLM result or a room
measurement. See docs/geometry.md for provenance and live-validation limits.
"""

from pathlib import Path

from .geometry_engine import compute_geometry
from .schemas import SceneGeometryInput

SAMPLE_GEOMETRY_INPUT = SceneGeometryInput.model_validate_json(
    (Path(__file__).with_name("fixtures") / "basic_room_annotated.json").read_text()
)
SAMPLE_SCENE_DATA = compute_geometry(SAMPLE_GEOMETRY_INPUT).model_dump()
