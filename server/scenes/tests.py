import io
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from .models import Scene


class SceneApiTests(TestCase):
    def test_upload_geometry_serialization_and_retrieval(self):
        fixture = Path(__file__).with_name("fixtures") / "basic_room_annotated.json"
        import json

        input_data = json.loads(fixture.read_text())
        pixels = io.BytesIO()
        Image.new("RGB", (4, 3)).save(pixels, format="PNG")
        upload = SimpleUploadedFile(
            "room.png", pixels.getvalue(), content_type="image/png"
        )
        with (
            tempfile.TemporaryDirectory() as media,
            override_settings(MEDIA_ROOT=media),
        ):
            with patch("scenes.views.analyze_image", return_value=input_data):
                response = self.client.post("/api/scenes/", {"image": upload})
            self.assertEqual(response.status_code, 201, response.content)
            payload = response.json()
            self.assertEqual(payload["status"], "completed")
            self.assertIn("canonical_room", payload["scene_data"])
            self.assertNotIn("room_size_hint", payload["scene_data"])
            saved = Scene.objects.get(pk=payload["id"])
            self.assertEqual(saved.scene_data, payload["scene_data"])
            detail = self.client.get(f'/api/scenes/{payload["id"]}/')
            self.assertEqual(detail.json()["scene_data"], saved.scene_data)
            for obj in saved.scene_data["objects"]:
                debug = saved.scene_data["debug_info"]["objects"][obj["id"]]
                self.assertEqual(
                    debug["final_position"],
                    {axis: obj[axis] for axis in ["x", "y", "z"]},
                )


class VlmPipelineTests(TestCase):
    def _run_analysis(self, responses):
        from types import SimpleNamespace
        from .vlm_service import analyze_image
        import json

        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "room.png"
            Image.new("RGB", (400, 300)).save(path)
            with patch("scenes.vlm_service.genai.Client") as client:
                generate = (
                    client.return_value.__enter__.return_value.models.generate_content
                )
                generate.side_effect = [
                    value
                    if isinstance(value, Exception)
                    else SimpleNamespace(text=json.dumps(value))
                    for value in responses
                ]
                result = analyze_image(str(path))
                return result, generate.call_count

    def test_incomplete_floor_gets_one_focused_refinement(self):
        import json
        from .schemas import SceneGeometryInput

        fixture = json.loads(
            (
                Path(__file__).with_name("fixtures") / "basic_room_annotated.json"
            ).read_text()
        )
        initial = {**fixture, "room_landmarks": None}
        result, calls = self._run_analysis([initial, fixture["room_landmarks"]])
        self.assertEqual(calls, 2)
        self.assertEqual(
            result["room_landmarks"]["back_left_corner"],
            fixture["room_landmarks"]["back_left_corner"],
        )
        self.assertEqual(result["image_aspect_ratio"], 4 / 3)
        self.assertTrue(result["analysis_notes"])
        SceneGeometryInput.model_validate(result)

    def test_refinement_failure_preserves_first_valid_objects(self):
        with self.assertLogs("scenes.vlm_service", level="WARNING"):
            result, calls = self._run_analysis(
                [
                    {"objects": [], "room_landmarks": None},
                    RuntimeError("Temporary service failure"),
                ]
            )
        self.assertEqual(calls, 2)
        self.assertEqual(result["objects"], [])
        self.assertIn("retained first analysis", result["analysis_notes"][0])

    def test_complete_floor_does_not_make_extra_api_call(self):
        import json

        fixture = json.loads(
            (
                Path(__file__).with_name("fixtures") / "basic_room_annotated.json"
            ).read_text()
        )
        result, calls = self._run_analysis([fixture])
        self.assertEqual(calls, 1)
        self.assertEqual(result["analysis_notes"], [])

    def test_exif_orientation_matches_model_pixels_and_renderer_aspect(self):
        import json
        from types import SimpleNamespace
        from .vlm_service import analyze_image

        fixture = json.loads(
            (
                Path(__file__).with_name("fixtures") / "basic_room_annotated.json"
            ).read_text()
        )
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "rotated.jpg"
            image = Image.new("RGB", (400, 300))
            exif = image.getexif()
            exif[274] = 6
            image.save(path, exif=exif)
            with patch("scenes.vlm_service.genai.Client") as client:
                generate = (
                    client.return_value.__enter__.return_value.models.generate_content
                )
                generate.return_value = SimpleNamespace(text=json.dumps(fixture))
                result = analyze_image(str(path))
                encoded = generate.call_args.kwargs["contents"][0].inline_data.data
                with Image.open(io.BytesIO(encoded)) as sent:
                    self.assertEqual(sent.size, (300, 400))
                self.assertEqual(result["image_aspect_ratio"], 0.75)
