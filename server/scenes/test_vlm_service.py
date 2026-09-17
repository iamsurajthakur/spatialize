import json
import os
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from google.genai import errors
from PIL import Image
from pydantic import ValidationError

from .vlm_service import _get_model_candidates, analyze_image


class VlmModelFallbackTests(TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {}, clear=True)
        environment.start()
        self.addCleanup(environment.stop)
        client = patch("scenes.vlm_service.genai.Client")
        self.generate = (
            client.start().return_value.__enter__.return_value.models.generate_content
        )
        self.addCleanup(client.stop)
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = Path(temp.name) / "room.png"
        Image.new("RGB", (40, 30)).save(self.path)
        self.fixture = json.loads(
            (
                Path(__file__).with_name("fixtures") / "basic_room_annotated.json"
            ).read_text()
        )

    def analyze(self, *responses):
        self.generate.reset_mock()
        self.generate.side_effect = [
            value
            if isinstance(value, Exception)
            else SimpleNamespace(text=json.dumps(value))
            for value in responses
        ]
        return analyze_image(str(self.path))

    def attempted_models(self):
        return [call.kwargs["model"] for call in self.generate.call_args_list]

    def test_success_uses_only_primary_model(self):
        result = self.analyze(self.fixture)
        self.assertEqual(self.attempted_models(), ["gemini-3.8-flash"])
        self.assertEqual(result["analysis_notes"], [])

    def test_detected_bookshelf_survives_analysis_and_geometry(self):
        from .geometry_engine import compute_geometry
        from .schemas import SceneGeometryInput

        detected = {
            **self.fixture,
            "objects": [
                {**self.fixture["objects"][0], "id": "bookshelf_1", "type": "bookshelf"}
            ],
        }
        result = self.analyze(detected)
        scene = compute_geometry(SceneGeometryInput.model_validate(result))
        self.assertEqual(scene.objects[0].type, "bookshelf")
        self.assertEqual(scene.objects[0].id, "bookshelf_1")
        self.assertGreater(scene.objects[0].height, scene.objects[0].width)

    def test_unavailable_models_fall_back_in_order(self):
        with self.assertLogs("scenes.vlm_service", level="WARNING"):
            result = self.analyze(
                errors.ServerError(503, {"message": "High demand"}),
                errors.ClientError(429, {"message": "Rate limited"}),
                errors.ClientError(404, {"message": "Model unavailable"}),
                self.fixture,
            )
        self.assertEqual(
            self.attempted_models(),
            [
                "gemini-3.8-flash",
                "gemini-3.7-flash",
                "gemini-3.6-flash",
                "gemini-3.5-flash",
            ],
        )
        first = self.generate.call_args_list[0].kwargs
        for call in self.generate.call_args_list[1:]:
            self.assertEqual(call.kwargs["contents"], first["contents"])
            self.assertEqual(call.kwargs["config"], first["config"])
        self.assertEqual(result["image_aspect_ratio"], 4 / 3)

    def test_detected_window_survives_analysis_and_mounts_above_floor(self):
        from .geometry_engine import compute_geometry
        from .schemas import SceneGeometryInput

        detected = {
            **self.fixture,
            "objects": [
                {
                    "id": "window_1",
                    "type": "window",
                    "support": "back_wall",
                    "bbox": {"x_min": 0.35, "x_max": 0.65, "y_min": 0.1, "y_max": 0.3},
                    "floor_contact": None,
                    "wall_relation": {"type": "against_wall", "target": "back_wall"},
                }
            ],
        }
        result = self.analyze(detected)
        obj = compute_geometry(SceneGeometryInput.model_validate(result)).objects[0]
        self.assertEqual(obj.type, "window")
        self.assertGreater(obj.y - obj.height / 2, 0)

    def test_timeouts_and_transient_server_errors_allow_fallback(self):
        for code in (408, 500, 502, 504):
            with self.subTest(code=code):
                with self.assertLogs("scenes.vlm_service", level="WARNING"):
                    self.analyze(errors.APIError(code, {}), self.fixture)
                self.assertEqual(
                    self.attempted_models(), ["gemini-3.8-flash", "gemini-3.7-flash"]
                )

    def test_all_models_unavailable_raises_last_api_error(self):
        failures = [errors.ServerError(503, {}) for _ in range(4)]
        with (
            self.assertLogs("scenes.vlm_service", level="WARNING"),
            self.assertRaises(errors.ServerError) as raised,
        ):
            self.analyze(*failures)
        self.assertIs(raised.exception, failures[-1])
        self.assertEqual(len(self.attempted_models()), 4)

    def test_credentials_bad_requests_and_unexpected_errors_do_not_switch_models(self):
        failures = [errors.ClientError(code, {}) for code in (400, 401, 403)]
        failures.append(RuntimeError("Unexpected failure"))
        for failure in failures:
            with self.subTest(failure=failure):
                with self.assertRaises(type(failure)) as raised:
                    self.analyze(failure)
                self.assertIs(raised.exception, failure)
                self.assertEqual(self.attempted_models(), ["gemini-3.8-flash"])

    def test_invalid_response_does_not_switch_models(self):
        with self.assertRaises(ValidationError):
            self.analyze({"objects": "invalid"})
        self.assertEqual(self.attempted_models(), ["gemini-3.8-flash"])

    def test_env_overrides_order_and_ignores_empty_or_duplicate_entries(self):
        with (
            patch.dict(
                os.environ,
                {
                    "GEMINI_MODEL": " gemini-3.7-flash ",
                    "GEMINI_FALLBACK_MODELS": "gemini-3.5-flash, ,gemini-3.7-flash,"
                    "gemini-3.5-flash, gemini-3.6-flash,",
                },
            ),
            self.assertLogs("scenes.vlm_service", level="WARNING"),
        ):
            self.analyze(
                errors.ServerError(503, {}),
                errors.ServerError(503, {}),
                self.fixture,
            )
        self.assertEqual(
            self.attempted_models(),
            ["gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.6-flash"],
        )

    def test_default_fallbacks_start_after_configured_primary(self):
        with patch.dict(os.environ, {"GEMINI_MODEL": "gemini-3.6-flash"}):
            self.assertEqual(
                _get_model_candidates(), ["gemini-3.6-flash", "gemini-3.5-flash"]
            )

    def test_empty_fallback_setting_disables_switching(self):
        with (
            patch.dict(os.environ, {"GEMINI_FALLBACK_MODELS": " , "}),
            self.assertRaises(errors.ServerError),
        ):
            self.analyze(errors.ServerError(503, {}))
        self.assertEqual(self.attempted_models(), ["gemini-3.8-flash"])

    def test_refinement_reuses_working_model_and_can_fall_back_further(self):
        initial = {**self.fixture, "room_landmarks": None}
        with self.assertLogs("scenes.vlm_service", level="WARNING"):
            result = self.analyze(
                errors.ServerError(503, {}),
                initial,
                errors.ServerError(503, {}),
                self.fixture["room_landmarks"],
            )
        self.assertEqual(
            self.attempted_models(),
            [
                "gemini-3.8-flash",
                "gemini-3.7-flash",
                "gemini-3.7-flash",
                "gemini-3.6-flash",
            ],
        )
        self.assertIsNotNone(result["room_landmarks"])
        self.assertIn(
            "accepted one focused floor refinement", result["analysis_notes"][0]
        )
        self.analyze(self.fixture)
        self.assertEqual(self.attempted_models(), ["gemini-3.8-flash"])

    def test_exhausted_refinement_fallbacks_preserve_initial_analysis(self):
        initial = {**self.fixture, "room_landmarks": None}
        with self.assertLogs("scenes.vlm_service", level="WARNING"):
            result = self.analyze(
                initial, *(errors.ServerError(503, {}) for _ in range(4))
            )
        self.assertEqual(self.generate.call_count, 5)
        self.assertIsNone(result["room_landmarks"])
        self.assertEqual(len(result["objects"]), len(initial["objects"]))
        self.assertIn("retained first analysis", result["analysis_notes"][0])
