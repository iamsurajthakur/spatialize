import math
from pathlib import Path
from unittest import TestCase

from pydantic import ValidationError

from scenes.floor_mapping import FloorMapping
from scenes.geometry_engine import CANONICAL_ROOM, compute_geometry, footprint
from scenes.schemas import (
    BoundingBox2D,
    Point2D,
    RoomLandmarks,
    SceneGeometryInput,
    SceneGeometryInputObject,
)
from scenes.validators import validate_scene_json


# Independent forward pinhole camera: at (0, 3, 7), aimed at the floor center.
# These observations test the inverse mapping against geometry, not coefficients.
def image_point(x, z):
    distance = math.sqrt(58)
    depth = distance - 7 * z / distance
    vertical = -3 * z / distance
    focal = 1.0
    return {"x": 0.5 + focal * x / depth, "y": 0.5 - focal * vertical / depth}


def room_landmarks():
    return RoomLandmarks(
        back_left_corner=image_point(-2.5, -2.5),
        back_right_corner=image_point(2.5, -2.5),
        left_front_floor=image_point(-2.5, 2.5),
        right_front_floor=image_point(2.5, 2.5),
        confidence=1,
    )


def make_object(id="chair", type="chair", x=0, z=0, **kwargs):
    point = image_point(x, z)
    return SceneGeometryInputObject(
        id=id,
        type=type,
        bbox={
            "x_min": max(0, point["x"] - 0.025),
            "x_max": min(1, point["x"] + 0.025),
            "y_min": max(0, point["y"] - 0.2),
            "y_max": point["y"],
        },
        floor_contact=point,
        confidence=1,
        **kwargs,
    )


def place(*objects, landmarks=None):
    return compute_geometry(
        SceneGeometryInput(
            objects=list(objects), room_landmarks=landmarks or room_landmarks()
        )
    )


class GeometryEngineTests(TestCase):
    def test_horizontal_image_movement(self):
        left, right = (
            place(make_object(x=-1.2)).objects[0],
            place(make_object(x=1.2)).objects[0],
        )
        self.assertLess(left.x, right.x)
        self.assertAlmostEqual(left.x, -1.2)
        self.assertAlmostEqual(right.x, 1.2)
        self.assertAlmostEqual(left.z, right.z)

    def test_perspective_inverse_recovers_floor_depth(self):
        for depth in [-2, -1, 0, 1, 2]:
            with self.subTest(depth=depth):
                obj = place(make_object(x=0.4, z=depth)).objects[0]
                self.assertAlmostEqual(obj.x, 0.4)
                self.assertAlmostEqual(obj.z, depth)
        mapping = FloorMapping(room_landmarks(), CANONICAL_ROOM, 1)
        # Equal image-Y intervals are not equal world-depth intervals.
        zs = [mapping.map(Point2D(x=0.5, y=y))[1] for y in [0.44, 0.5, 0.56]]
        self.assertNotAlmostEqual(zs[1] - zs[0], zs[2] - zs[1], places=3)

    def test_bbox_bottom_not_center_or_object_height_controls_depth(self):
        item = make_object()
        item.floor_contact = None
        first = place(item).objects[0]
        item.bbox.y_min = 0.01
        item.center = Point2D(x=0.8, y=0.1)
        item.region = "front_right"
        second = place(item).objects[0]
        self.assertAlmostEqual(first.x, second.x)
        self.assertAlmostEqual(first.z, second.z)

    def test_back_wall_preserves_x(self):
        result = place(
            make_object(
                type="sofa",
                x=0.8,
                z=-1,
                wall_relation={"type": "against_wall", "target": "back_wall"},
            )
        )
        obj = result.objects[0]
        self.assertAlmostEqual(obj.x, 0.8)
        self.assertAlmostEqual(obj.z - footprint(obj)[1], -2.5)
        debug = result.debug_info["objects"][obj.id]
        self.assertEqual(
            debug["before_wall_constraint"]["x"], debug["after_wall_constraint"]["x"]
        )

    def test_side_walls_preserve_depth_with_rotated_extents(self):
        for wall, sign in [("left_wall", -1), ("right_wall", 1)]:
            depths = []
            for z in [-1, 1]:
                obj = place(
                    make_object(
                        type="desk",
                        x=sign * 1.8,
                        z=z,
                        wall_relation={"type": "against", "target": wall},
                    )
                ).objects[0]
                self.assertAlmostEqual(obj.z, z)
                self.assertAlmostEqual(abs(obj.x) + footprint(obj)[0], 2.5)
                self.assertAlmostEqual(footprint(obj)[0], obj.depth / 2)
                depths.append(obj.z)
            self.assertLess(depths[0], depths[1])

    def test_satisfied_directional_relations_leave_both_coordinates_alone(self):
        a = make_object("a", x=-1, z=1, relations=[{"type": "left_of", "target": "b"}])
        b = make_object("b", x=1, z=-1)
        obj = place(a, b).objects[0]
        self.assertAlmostEqual(obj.x, -1)
        self.assertAlmostEqual(obj.z, 1)

    def test_conflicting_relations_do_not_swap_image_order_or_teleport(self):
        a = make_object(
            "a",
            x=-1.4,
            z=1,
            relations=[
                {"type": "right_of", "target": "b"},
                {"type": "near", "target": "b"},
            ],
        )
        b = make_object("b", x=1.4, z=-1)
        result = place(a, b)
        self.assertLess(result.objects[0].x, result.objects[1].x)
        self.assertLess(
            math.dist((result.objects[0].x, result.objects[0].z), (-1.4, 1)), 0.5
        )

    def test_facing_only_rotates(self):
        a = make_object("a", x=-1, z=1, relations=[{"type": "facing", "target": "b"}])
        b = make_object("b", x=1, z=-1)
        obj = place(a, b).objects[0]
        self.assertAlmostEqual(obj.x, -1)
        self.assertAlmostEqual(obj.z, 1)
        angle = math.radians(obj.rotation_y)
        self.assertAlmostEqual(math.sin(angle), 1 / math.sqrt(2))
        self.assertAlmostEqual(math.cos(angle), -1 / math.sqrt(2))

    def test_wall_priority_survives_facing_orientation_and_collision(self):
        items = [
            make_object(
                str(i),
                type="desk",
                x=-2,
                z=0.1 * i,
                orientation="parallel_to_right_wall",
                wall_relation={"type": "against", "target": "left_wall"},
                relations=[{"type": "facing", "target": str(1 - i)}],
            )
            for i in range(2)
        ]
        result = place(*items)
        for obj in result.objects:
            self.assertAlmostEqual(obj.x - footprint(obj)[0], -2.5)
            self.assertAlmostEqual(obj.rotation_y, 90)

    def test_centered_on_is_bounded_along_wall(self):
        obj = place(
            make_object(
                x=1.6,
                z=-2,
                wall_relation={"type": "centered_on", "target": "back_wall"},
            )
        ).objects[0]
        self.assertGreater(obj.x, 1.2)
        self.assertAlmostEqual(obj.z - footprint(obj)[1], -2.5)

    def test_bbox_and_confidence_validation(self):
        for change in [
            {"x_min": -0.1},
            {"x_max": 1.1},
            {"y_min": float("nan")},
            {"x_min": 0.8, "x_max": 0.2},
        ]:
            with self.subTest(change=change), self.assertRaises(ValidationError):
                BoundingBox2D.model_validate(
                    {"x_min": 0.2, "x_max": 0.8, "y_min": 0.2, "y_max": 0.8, **change}
                )
        with self.assertRaises(ValidationError):
            Point2D(x=float("inf"), y=0.5)
        item = make_object().model_dump()
        item["confidence"] = 2
        with self.assertRaises(ValidationError):
            SceneGeometryInputObject.model_validate(item)

    def test_duplicate_ids_rejected(self):
        with self.assertRaises(ValidationError):
            place(make_object(), make_object())

    def test_all_types_and_rotations_inside_room(self):
        for type in [
            "table",
            "chair",
            "sofa",
            "bed",
            "plant",
            "desk",
            "cabinet",
            "bookshelf",
            "window",
            "rug",
            "lamp",
            "tv",
            "generic",
        ]:
            for wall in ["back_wall", "left_wall", "right_wall", "front_wall"]:
                with self.subTest(type=type, wall=wall):
                    result = place(
                        make_object(
                            type=type,
                            x=2.4,
                            z=2.4,
                            wall_relation={"type": "against", "target": wall},
                        )
                    )
                    self.assertEqual(
                        validate_scene_json(result.model_dump()), result.model_dump()
                    )

    def test_collisions_separate_when_space_available(self):
        result = place(make_object("a"), make_object("b"))
        a, b = result.objects
        ax, az = footprint(a)
        bx, bz = footprint(b)
        self.assertTrue(
            abs(a.x - b.x) >= ax + bx - 1e-6 or abs(a.z - b.z) >= az + bz - 1e-6
        )
        for obj in result.objects:
            self.assertLessEqual(math.hypot(obj.x, obj.z), 0.5 + 1e-6)

    def test_crowded_scene_limits_drift_and_reports_remaining_overlap(self):
        result = place(*(make_object(str(i), type="sofa") for i in range(6)))
        for obj in result.objects:
            self.assertLessEqual(math.hypot(obj.x, obj.z), 0.5 + 1e-6)
        self.assertTrue(
            any(
                "Unresolved overlap" in warning
                for d in result.debug_info["objects"].values()
                for warning in d["warnings"]
            )
        )

    def test_output_independent_of_detection_order(self):
        items = [
            make_object("a", x=-0.2),
            make_object("b", x=0.1),
            make_object("c", x=0.5),
        ]
        self.assertEqual(place(*items).objects, place(*reversed(items)).objects)

    def test_supported_object_follows_final_support(self):
        desk = make_object("desk", type="desk", x=-1, z=0.4)
        lamp = make_object("lamp", type="lamp", x=1.5, z=-1, support="desk")
        lamp.floor_contact = None
        result = place(desk, lamp)
        d, l = result.objects
        self.assertEqual(l.x, d.x)
        self.assertEqual(l.z, d.z)
        self.assertAlmostEqual(l.y - l.height / 2, d.y + d.height / 2)

    def test_elevated_bbox_cannot_constrain_floor_collision_positions(self):
        a, b = make_object("a", x=-0.1), make_object("b", x=0.1)
        baseline = place(a, b)
        lamp = make_object("lamp", type="lamp", x=0.12, support="a")
        lamp.floor_contact = None
        with_lamp = place(a, b, lamp)
        self.assertEqual(baseline.objects, with_lamp.objects[:2])

    def test_missing_and_cyclic_supports_are_reported(self):
        result = place(
            make_object("a", support="b"),
            make_object("b", support="a"),
            make_object("c", support="missing"),
        )
        self.assertTrue(
            all(d["warnings"] for d in result.debug_info["objects"].values())
        )
        validate_scene_json(result.model_dump())

    def test_missing_partial_and_degenerate_landmarks_fallback(self):
        cases = [
            None,
            RoomLandmarks(back_left_corner={"x": 0.2, "y": 0.4}),
            RoomLandmarks(
                back_left_corner={"x": 0.2, "y": 0.4},
                back_right_corner={"x": 0.8, "y": 0.4},
            ),
            RoomLandmarks(
                back_left_corner={"x": 0.2, "y": 0.4},
                back_right_corner={"x": 0.8, "y": 0.4},
                left_front_floor={"x": 0.2, "y": 0.4},
                right_front_floor={"x": 0.8, "y": 0.4},
            ),
        ]
        for landmarks in cases:
            with self.subTest(landmarks=landmarks):
                mapping = FloorMapping(landmarks, CANONICAL_ROOM, 1)
                far = mapping.map(Point2D(x=0.5, y=0.55))[1]
                near = mapping.map(Point2D(x=0.5, y=0.85))[1]
                self.assertLess(far, near)
                self.assertNotEqual(mapping.method, "floor_homography")
                self.assertIsNotNone(mapping.reason)

    def test_floor_points_outside_quad_are_flagged_and_bounded(self):
        mapping = FloorMapping(room_landmarks(), CANONICAL_ROOM, 1)
        x, z, debug = mapping.map(Point2D(x=0.01, y=0.05))
        self.assertTrue(debug["clipped_to_floor"])
        self.assertLessEqual(abs(x), 2.5 + 1e-6)
        self.assertLessEqual(abs(z), 2.5 + 1e-6)

    def test_three_corners_need_an_explicit_affine_observation(self):
        corners = RoomLandmarks(
            back_left_corner={"x": 0.5, "y": 0.3},
            back_right_corner={"x": 0.8, "y": 0.6},
            right_front_floor={"x": 0.5, "y": 0.9},
            projection_hint="orthographic",
            confidence=0.8,
        )
        mapping = FloorMapping(corners, CANONICAL_ROOM, 1)
        self.assertEqual(mapping.method, "affine_three_corners")
        self.assertAlmostEqual(mapping.map(Point2D(x=0.5, y=0.6))[0], 0)
        self.assertAlmostEqual(mapping.map(Point2D(x=0.5, y=0.6))[1], 0)
        self.assertLess(mapping.confidence, corners.confidence)
        corners.projection_hint = "perspective"
        self.assertIsNone(FloorMapping(corners, CANONICAL_ROOM, 1).to_floor)

    def test_opposite_wall_label_cannot_teleport_across_observed_floor(self):
        result = place(
            make_object(
                x=-1.8, z=-1, wall_relation={"type": "against", "target": "right_wall"}
            )
        )
        self.assertLess(result.objects[0].x, -1.5)
        self.assertIsNone(result.debug_info["objects"]["chair"]["wall_selected"])
        self.assertTrue(
            any(
                "Rejected wall" in warning
                for warning in result.debug_info["objects"]["chair"]["warnings"]
            )
        )

    def test_canonical_contract_and_no_vlm_metric_fields(self):
        result = place(make_object()).model_dump()
        self.assertEqual(
            result["coordinate_convention"], "floor_center_y_up_positive_z_front_v1"
        )
        self.assertEqual(
            result["canonical_room"], {"width": 5, "height": 3, "depth": 5}
        )
        self.assertNotIn("room_size_hint", result)
        props = SceneGeometryInputObject.model_json_schema()["properties"]
        for key in ["x", "y", "z", "width", "height", "depth"]:
            self.assertNotIn(key, props)

    def test_final_validator_does_not_hide_position_changes(self):
        result = place(make_object()).model_dump()
        result["objects"][0]["x"] = 10
        with self.assertRaises(ValueError):
            validate_scene_json(result)

    def test_replay_debug_is_complete(self):
        result = place(make_object())
        data = result.debug_info["objects"]["chair"]
        for key in [
            "bbox_normalized",
            "bbox_bottom_center",
            "floor_contact",
            "inferred_floor_position",
            "initial_canonical_position",
            "constraints",
            "wall_selected",
            "before_wall_constraint",
            "after_wall_constraint",
            "collision_corrections",
            "final_position",
            "confidence",
            "mapping",
        ]:
            self.assertIn(key, data)
        replay = compute_geometry(
            SceneGeometryInput.model_validate(result.debug_info["input"])
        )
        self.assertEqual(replay, result)

    def test_annotated_room_reprojects_left_right_and_depth_layout(self):
        # Manually annotated geometry diagnostic, NOT claimed to be VLM output.
        fixture = Path(__file__).with_name("fixtures") / "basic_room_annotated.json"
        result = compute_geometry(
            SceneGeometryInput.model_validate_json(fixture.read_text())
        )
        debug = result.debug_info["objects"]
        self.assertLess(
            debug["desk_1"]["reprojected_floor_contact"]["x"],
            debug["bed_1"]["reprojected_floor_contact"]["x"],
        )
        self.assertLess(
            debug["bed_1"]["reprojected_floor_contact"]["x"],
            debug["sofa_1"]["reprojected_floor_contact"]["x"],
        )
        self.assertLess(
            debug["bed_1"]["reprojected_floor_contact"]["y"],
            debug["sofa_1"]["reprojected_floor_contact"]["y"],
        )
        self.assertEqual(result.camera["kind"], "orthographic")
        validate_scene_json(result.model_dump())

    def test_uncorrected_live_analysis_keeps_main_projected_layout(self):
        fixture = Path(__file__).with_name("fixtures") / "basic_room_vlm.json"
        result = compute_geometry(
            SceneGeometryInput.model_validate_json(fixture.read_text())
        )
        debug = result.debug_info["objects"]
        points = {id: item["reprojected_floor_contact"] for id, item in debug.items()}
        self.assertLess(points["desk_1"]["x"], points["bed_1"]["x"])
        self.assertLess(points["chair_1"]["x"], points["bed_1"]["x"])
        self.assertLess(points["bed_1"]["x"], points["sofa_1"]["x"])
        self.assertLess(points["sofa_1"]["x"], points["plant_1"]["x"])
        self.assertGreater(points["sofa_1"]["y"], points["bed_1"]["y"])
        self.assertEqual(debug["desk_1"]["wall_selected"], "left_wall")
        self.assertEqual(debug["bed_1"]["wall_selected"], "back_wall")
        self.assertLessEqual(result.debug_info["floor_mapping"]["confidence"], 0.5)
        validate_scene_json(result.model_dump())
