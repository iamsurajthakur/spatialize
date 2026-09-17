from unittest import TestCase

from pydantic import ValidationError

from .geometry_engine import compute_geometry
from .schemas import SceneData, SceneGeometryInput, SceneGeometryInputObject
from .validators import validate_scene_json


def rug(**changes):
    return {
        "id": "rug_1",
        "type": "rug",
        "color": "#8b4c39",
        "bbox": {"x_min": 0.2, "x_max": 0.8, "y_min": 0.35, "y_max": 0.9},
        "floor_contact": {"x": 0.5, "y": 0.65},
        **changes,
    }


def scene(*objects):
    return compute_geometry(SceneGeometryInput.model_validate({"objects": objects}))


class RugGeometryTests(TestCase):
    def test_color_survives_serialization_and_rug_stays_flat_inside_room(self):
        for orientation in ("parallel_to_back_wall", "parallel_to_left_wall"):
            with self.subTest(orientation=orientation):
                result = scene(
                    rug(orientation=orientation, floor_contact={"x": 0.95, "y": 0.95})
                )
                obj = result.objects[0]
                self.assertAlmostEqual(obj.y - obj.height / 2, 0)
                self.assertLess(obj.height, 0.03)
                self.assertEqual(obj.color, "#8b4c39")
                self.assertEqual(
                    SceneData.model_validate_json(result.model_dump_json())
                    .objects[0]
                    .color,
                    obj.color,
                )
                self.assertEqual(
                    validate_scene_json(result.model_dump()), result.model_dump()
                )

    def test_rug_does_not_move_overlapping_furniture_or_its_supports(self):
        table = {**rug(id="table_1", type="table"), "color": None}
        chair = {**rug(id="chair_1", type="chair"), "color": None}
        expected = scene(table, chair)
        result = scene(table, chair, rug())
        self.assertEqual(
            [obj for obj in result.objects if obj.type != "rug"], expected.objects
        )
        self.assertEqual(
            next(obj for obj in result.objects if obj.type == "rug"),
            scene(rug()).objects[0],
        )
        self.assertEqual(
            result.debug_info["objects"]["rug_1"]["collision_corrections"], []
        )
        supported = scene({**table, "support": "rug_1"}, rug())
        self.assertEqual(
            next(obj for obj in supported.objects if obj.type == "table"),
            scene(table).objects[0],
        )

    def test_rug_ignores_erroneous_wall_and_furniture_support_annotations(self):
        table = rug(id="table_1", type="table", color=None)
        result = scene(
            table,
            rug(
                support="table_1",
                wall_relation={"type": "against_wall", "target": "back_wall"},
            ),
        )
        actual = next(obj for obj in result.objects if obj.type == "rug")
        self.assertEqual(actual, scene(rug()).objects[0])

    def test_missing_floor_contact_uses_rug_center_instead_of_near_edge(self):
        center = {"x": 0.5, "y": 0.65}
        bbox = {"x_min": 0.3, "x_max": 0.7, "y_min": 0.5, "y_max": 0.8}
        expected = scene(rug(floor_contact=center, bbox=bbox)).objects[0]
        self.assertEqual(scene(rug(floor_contact=None, bbox=bbox)).objects[0], expected)
        self.assertEqual(
            scene(rug(floor_contact=None, center=center)).objects[0], expected
        )

    def test_color_is_optional_and_rejects_invalid_hex_values(self):
        item = rug()
        del item["color"]
        self.assertIsNone(scene(item).objects[0].color)
        for color in ("#123456", "#ABCDEF", "#000000", "#ffffff", None):
            with self.subTest(color=color):
                self.assertEqual(
                    SceneGeometryInputObject.model_validate(rug(color=color)).color,
                    color,
                )
        for color in ("red", "#123", "123456", "#12345g", 123456):
            with self.subTest(color=color), self.assertRaises(ValidationError):
                SceneGeometryInputObject.model_validate(rug(color=color))
