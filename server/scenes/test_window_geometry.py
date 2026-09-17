from unittest import TestCase

from .geometry_engine import compute_geometry, footprint
from .schemas import SceneGeometryInput
from .validators import validate_scene_json
from .window_geometry import point_on_wall


def window(**changes):
    return {
        "id": "window_1",
        "type": "window",
        "bbox": {"x_min": 0.3, "x_max": 0.6, "y_min": 0.1, "y_max": 0.4},
        "wall_relation": {"type": "against_wall", "target": "back_wall"},
        **changes,
    }


def scene(*objects):
    return compute_geometry(SceneGeometryInput.model_validate({"objects": objects}))


class WindowGeometryTests(TestCase):
    def test_missing_floor_landmarks_still_mounts_window_on_each_wall(self):
        for wall, axis, sign, rotation in [
            ("back_wall", "z", -1, 0),
            ("front_wall", "z", 1, 180),
            ("left_wall", "x", -1, 90),
            ("right_wall", "x", 1, -90),
        ]:
            with self.subTest(wall=wall):
                result = scene(
                    window(wall_relation={"type": "against_wall", "target": wall})
                )
                obj = result.objects[0]
                self.assertGreater(obj.y - obj.height / 2, 0)
                self.assertLess(obj.y + obj.height / 2, 3)
                self.assertEqual(obj.rotation_y, rotation)
                half_extent = footprint(obj)[0 if axis == "x" else 1]
                self.assertAlmostEqual(sign * getattr(obj, axis) + half_extent, 2.5)
                self.assertEqual(
                    validate_scene_json(result.model_dump()), result.model_dump()
                )
                self.assertEqual(
                    result.debug_info["objects"][obj.id]["contact_method"],
                    "canonical_wall_prior",
                )
                self.assertIsNone(result.debug_info["objects"][obj.id]["floor_contact"])

    def test_wall_can_come_from_support_or_orientation(self):
        for changes in [
            {"support": "left_wall"},
            {"orientation": "parallel_to_left_wall"},
        ]:
            with self.subTest(changes=changes):
                result = scene(window(wall_relation=None, **changes))
                self.assertEqual(result.objects[0].rotation_y, 90)
                self.assertEqual(
                    result.debug_info["objects"]["window_1"]["wall_selected"],
                    "left_wall",
                )

    def test_missing_wall_uses_an_explicit_prior(self):
        result = scene(window(wall_relation=None))
        debug = result.debug_info["objects"]["window_1"]
        self.assertEqual(debug["wall_selected"], "back_wall")
        self.assertTrue(debug["warnings"])

    def test_window_does_not_move_furniture_or_become_supported_by_it(self):
        cabinet = {
            "id": "cabinet_1",
            "type": "cabinet",
            "bbox": {"x_min": 0.4, "x_max": 0.6, "y_min": 0.1, "y_max": 0.4},
            "wall_relation": {"type": "against_wall", "target": "back_wall"},
        }
        expected = scene(cabinet).objects[0]
        result = scene(cabinet, window(support="cabinet_1"))
        self.assertEqual(result.objects[0], expected)
        self.assertEqual(result.objects[1], scene(window()).objects[0])
        self.assertEqual(
            result.debug_info["objects"]["window_1"]["collision_corrections"], []
        )

    def test_image_ray_parallel_to_wall_or_behind_camera_is_rejected(self):
        camera = {
            "kind": "perspective",
            "position": [0, 1.5, 7],
            "target": [0, 1.5, 0],
            "up": [0, 1, 0],
            "fov": 50,
            "image_aspect_ratio": 1,
        }
        self.assertIsNone(point_on_wall(camera, 0.5, 0.5, 0, -2.5))
        self.assertIsNone(point_on_wall(camera, 0.5, 0.5, 2, 8))
