from copy import deepcopy
from unittest.mock import patch

from django.test import TestCase

from .models import Scene
from .serializers import ManualOverridesSerializer


class ManualOverrideTests(TestCase):
    def setUp(self):
        self.generated = {
            "canonical_room": {"width": 5, "height": 3, "depth": 5},
            "objects": [
                {
                    "id": "sofa_1",
                    "type": "sofa",
                    "x": 0,
                    "y": 0.4,
                    "z": 0,
                    "width": 2,
                    "height": 0.8,
                    "depth": 1,
                    "rotation_y": 0,
                },
                {
                    "id": "chair_1",
                    "type": "chair",
                    "x": 1,
                    "y": 0.5,
                    "z": 1,
                    "width": 0.5,
                    "height": 1,
                    "depth": 0.5,
                },
            ],
            "debug_info": {"input": {"relations": ["original"]}},
        }
        self.scene = Scene.objects.create(
            image="scenes/example.png",
            status="completed",
            scene_data=deepcopy(self.generated),
        )
        self.url = f"/api/scenes/{self.scene.pk}/"

    def save(self, overrides):
        return self.client.patch(
            self.url, {"manual_overrides": overrides}, content_type="application/json"
        )

    def test_save_retrieve_and_reset_preserve_generated_scene(self):
        overrides = {
            "sofa_1": {"x": 2, "z": -1.5, "rotation_y": 90},
            "chair_1": {"x": 1, "z": 1, "rotation_y": -45},
        }
        with (
            patch("scenes.views.analyze_image_bytes") as vlm,
            patch("scenes.views.compute_geometry") as geometry,
        ):
            self.assertEqual(self.save(overrides).status_code, 200)
            detail = self.client.get(self.url).json()
            self.assertEqual(detail["manual_overrides"], overrides)
            self.assertEqual(detail["scene_data"], self.generated)
            del overrides["sofa_1"]
            self.assertEqual(self.save(overrides).status_code, 200)
            self.scene.refresh_from_db()
            self.assertEqual(self.scene.manual_overrides, overrides)
            self.assertEqual(self.scene.scene_data, self.generated)
            self.assertEqual(self.save({}).status_code, 200)
            vlm.assert_not_called()
            geometry.assert_not_called()

    def test_invalid_maps_are_atomic(self):
        valid = {"chair_1": {"x": 0, "z": 0, "rotation_y": 0}}
        self.save(valid)
        for overrides in [
            [],
            None,
            {"missing": {"x": 0, "z": 0, "rotation_y": 0}},
            {"sofa_1": {"x": "1", "z": 0, "rotation_y": 0}},
            {"sofa_1": {"x": True, "z": 0, "rotation_y": 0}},
            {"sofa_1": {"x": 0, "z": 0}},
            {"sofa_1": {"x": 0, "y": 2, "z": 0, "rotation_y": 0}},
            {"sofa_1": {"x": 1.6, "z": 0, "rotation_y": 0}},
            {"sofa_1": {"x": 0, "z": -1.6, "rotation_y": 90}},
            {"sofa_1": {"x": 1.5, "z": 0, "rotation_y": 45}},
        ]:
            with self.subTest(overrides=overrides):
                self.assertEqual(self.save(overrides).status_code, 400)
                self.scene.refresh_from_db()
                self.assertEqual(self.scene.manual_overrides, valid)
                self.assertEqual(self.scene.scene_data, self.generated)

    def test_nonfinite_and_oversized_numbers_rejected(self):
        for value in [float("nan"), float("inf"), -float("inf"), 10**400]:
            serializer = ManualOverridesSerializer(
                self.scene,
                data={
                    "manual_overrides": {
                        "sofa_1": {"x": value, "z": 0, "rotation_y": 0},
                    }
                },
            )
            self.assertFalse(serializer.is_valid())

    def test_only_override_field_can_be_patched(self):
        for field in ["image", "scene_data", "status", "unexpected"]:
            response = self.client.patch(
                self.url,
                {"manual_overrides": {}, field: {}},
                content_type="application/json",
            )
            self.assertEqual(response.status_code, 400)
        self.assertEqual(
            self.client.put(self.url, {}, content_type="application/json").status_code,
            405,
        )

    def test_legacy_room_and_rotation_supported(self):
        self.scene.scene_data["room_size_hint"] = self.scene.scene_data.pop(
            "canonical_room"
        )
        self.scene.save()
        self.assertEqual(
            self.save({"chair_1": {"x": 0, "z": 0, "rotation_y": 30}}).status_code, 200
        )

    def test_unfinished_scene_cannot_be_edited(self):
        self.scene.status = "processing"
        self.scene.save()
        self.assertEqual(self.save({}).status_code, 400)

    def test_impossible_footprint_rejected(self):
        self.scene.scene_data["objects"][0]["width"] = 6
        self.scene.save()
        self.assertEqual(
            self.save({"sofa_1": {"x": 0, "z": 0, "rotation_y": 0}}).status_code, 400
        )
