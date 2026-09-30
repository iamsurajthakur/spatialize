import base64
import json
import os
import tempfile
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

import httpx
from google.genai import errors, types
from PIL import Image

from .vlm_service import (
    ModelsUnavailableError,
    _generate_content_with_fallback,
    _get_model_candidates,
    analyze_image,
)


class VlmModelFallbackTests(TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {}, clear=True)
        environment.start()
        self.addCleanup(environment.stop)
        sleeper = patch("scenes.vlm_service.time.sleep")
        self.sleep = sleeper.start()
        self.addCleanup(sleeper.stop)
        client = patch("scenes.vlm_service.genai.Client")
        self.client_factory = client.start()
        self.client = self.client_factory.return_value.__enter__.return_value
        self.generate = self.client.models.generate_content
        self.addCleanup(client.stop)
        groq = patch("scenes.groq_provider.Groq")
        self.groq_factory = groq.start()
        self.groq_generate = self.groq_factory.return_value.__enter__.return_value.chat.completions.create
        self.addCleanup(groq.stop)
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
        from .schemas import SceneGeometryInput

        result = self.analyze(self.fixture)
        self.assertEqual(self.attempted_models(), ["gemini-3.8-flash"])
        self.assertEqual(result["analysis_notes"], [])
        expected = SceneGeometryInput.model_validate(self.fixture)
        expected.image_aspect_ratio = 4 / 3
        self.assertEqual(result, expected.model_dump())
        self.groq_factory.assert_not_called()

    def test_gemini_success_with_groq_configured_does_not_initialize_groq(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}):
            self.analyze(self.fixture)
        self.groq_factory.assert_not_called()

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
                "gemini-3.5-flash-lite",
                "gemini-3.7-flash",
                "gemini-3.6-flash",
            ],
        )
        first = self.generate.call_args_list[0].kwargs
        for call in self.generate.call_args_list[1:]:
            self.assertEqual(call.kwargs["contents"], first["contents"])
            self.assertEqual(call.kwargs["config"], first["config"])
        self.assertEqual(result["image_aspect_ratio"], 4 / 3)
        self.groq_factory.assert_not_called()

    def test_detected_rug_keeps_its_color_through_analysis_and_geometry(self):
        from .geometry_engine import compute_geometry
        from .schemas import SceneGeometryInput

        detected = {
            **self.fixture,
            "objects": [
                {
                    **self.fixture["objects"][0],
                    "id": "rug_1",
                    "type": "rug",
                    "color": "#8B4C39",
                }
            ],
        }
        result = self.analyze(detected)
        obj = compute_geometry(SceneGeometryInput.model_validate(result)).objects[0]
        self.assertEqual(obj.type, "rug")
        self.assertEqual(obj.color, "#8B4C39")
        self.assertAlmostEqual(obj.y - obj.height / 2, 0)

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
                    self.attempted_models(),
                    ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
                )

    def test_all_models_unavailable_reports_attempts_after_one_retry_pass(self):
        failures = [errors.ServerError(503, {}) for _ in range(10)]
        with (
            self.assertLogs("scenes.vlm_service", level="WARNING"),
            self.assertRaises(ModelsUnavailableError) as raised,
        ):
            self.analyze(*failures)
        self.assertEqual(len(raised.exception.attempts), 10)
        self.assertEqual(self.attempted_models()[:5], self.attempted_models()[5:])
        self.sleep.assert_called_once()
        self.groq_factory.assert_not_called()

    def test_credentials_bad_requests_and_unexpected_errors_do_not_switch_models(self):
        failures = [errors.ClientError(code, {}) for code in (400, 401, 403)]
        failures.append(RuntimeError("Unexpected failure"))
        for failure in failures:
            with self.subTest(failure=failure):
                with self.assertRaises(type(failure)) as raised:
                    self.analyze(failure)
                self.assertIs(raised.exception, failure)
                self.assertEqual(self.attempted_models(), ["gemini-3.8-flash"])
                self.groq_factory.assert_not_called()

    def test_invalid_response_tries_next_gemini_before_groq(self):
        with self.assertLogs("scenes.vlm_service", level="WARNING"):
            result = self.analyze({"objects": "invalid"}, self.fixture)
        self.assertEqual(
            self.attempted_models(), ["gemini-3.8-flash", "gemini-3.5-flash-lite"]
        )
        self.assertEqual(result["objects"][0]["id"], self.fixture["objects"][0]["id"])
        self.groq_factory.assert_not_called()

    def groq_response(self, text):
        self.groq_generate.return_value = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason="stop", message=SimpleNamespace(content=text)
                )
            ]
        )

    def test_exhausted_gemini_retries_use_groq_and_existing_geometry(self):
        from .geometry_engine import compute_geometry
        from .schemas import SceneAnalysis, SceneGeometryInput
        from .vlm_service import SCENE_PROMPT

        self.groq_response(json.dumps(self.fixture))

        def assert_gemini_exhausted(**kwargs):
            self.assertEqual(self.generate.call_count, 10)
            return self.groq_generate.return_value

        self.groq_generate.side_effect = assert_gemini_exhausted
        with (
            patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}),
            self.assertLogs("scenes", level="INFO") as logs,
        ):
            result = self.analyze(*(errors.ServerError(503, {}) for _ in range(10)))
        self.assertIsInstance(SceneAnalysis.model_validate(result), SceneAnalysis)
        scene = compute_geometry(SceneGeometryInput.model_validate(result))
        self.assertEqual(len(scene.objects), len(self.fixture["objects"]))
        self.assertEqual(result["image_aspect_ratio"], 4 / 3)
        self.assertEqual(result["analysis_notes"], [])
        self.groq_generate.assert_called_once()
        request = self.groq_generate.call_args.kwargs
        self.assertEqual(request["model"], "qwen/qwen3.8-27b")
        self.assertEqual(request["messages"][0]["content"][0]["text"], SCENE_PROMPT)
        self.assertTrue(any("Groq analysis succeeded" in line for line in logs.output))
        self.assertNotIn("test-key", "\n".join(logs.output))

    def test_all_invalid_gemini_outputs_trigger_groq(self):
        self.groq_response(json.dumps(self.fixture))
        for raw in ('not JSON', '{', '{"objects":"invalid"}', '{}', '', 'null'):
            with (
                self.subTest(raw=raw),
                patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}),
                self.assertLogs("scenes.vlm_service", level="WARNING"),
            ):
                self.generate.reset_mock()
                self.groq_generate.reset_mock()
                self.generate.side_effect = [SimpleNamespace(text=raw)] * 5
                result = analyze_image(str(self.path))
                self.assertEqual(self.generate.call_count, 5)
                self.groq_generate.assert_called_once()
                self.assertTrue(result["objects"])

    def test_invalid_groq_output_preserves_service_unavailable_error(self):
        self.groq_response('{"objects":"invalid-private-output"}')
        with (
            patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}),
            self.assertLogs("scenes", level="WARNING") as logs,
            self.assertRaises(ModelsUnavailableError) as raised,
        ):
            self.analyze(*(errors.ClientError(404, {}) for _ in range(5)))
        self.assertEqual(len(raised.exception.attempts), 6)
        self.assertIn("try again", str(raised.exception))
        self.assertNotIn("private-output", str(raised.exception))
        self.assertNotIn("private-output", "\n".join(logs.output))
        self.groq_generate.assert_called_once()

    def test_missing_groq_key_is_logged_only_after_gemini_exhaustion(self):
        with (
            self.assertLogs("scenes", level="WARNING") as logs,
            self.assertRaises(ModelsUnavailableError),
        ):
            self.analyze(*(errors.ClientError(404, {}) for _ in range(5)))
        self.assertTrue(any("GROQ_API_KEY is not configured" in s for s in logs.output))
        self.groq_factory.assert_not_called()

    def test_invalid_local_image_or_configuration_does_not_use_groq(self):
        with self.assertRaises(FileNotFoundError):
            analyze_image(str(self.path.with_name("missing.png")))
        with (
            patch.dict(os.environ, {"GEMINI_TOTAL_TIMEOUT_MS": "bad"}),
            self.assertRaises(ValueError),
        ):
            analyze_image(str(self.path))
        self.groq_factory.assert_not_called()
        self.generate.assert_not_called()

    def test_groq_reuses_prepared_pixels_mime_and_exif_orientation(self):
        self.groq_response(json.dumps(self.fixture))
        for image_format, orientation, expected_mime in (
            ("JPEG", 1, "image/jpeg"),
            ("PNG", 1, "image/png"),
            ("WEBP", 1, "image/webp"),
            ("JPEG", 6, "image/png"),
        ):
            with (
                self.subTest(image_format=image_format, orientation=orientation),
                patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}),
                self.assertLogs("scenes.vlm_service", level="WARNING"),
            ):
                image = Image.new("RGB", (40, 30))
                exif = image.getexif()
                exif[274] = orientation
                image.save(self.path, format=image_format, exif=exif)
                result = self.analyze(*(errors.ClientError(404, {}) for _ in range(5)))
                content = self.groq_generate.call_args.kwargs["messages"][0]["content"]
                header, encoded = content[1]["image_url"]["url"].split(",", 1)
                self.assertEqual(header, f"data:{expected_mime};base64")
                pixels = base64.b64decode(encoded)
                gemini_pixels = self.generate.call_args.kwargs["contents"][
                    0
                ].inline_data
                self.assertEqual(gemini_pixels.data, pixels)
                self.assertEqual(gemini_pixels.mime_type, expected_mime)
                with Image.open(BytesIO(pixels)) as sent:
                    self.assertEqual(
                        sent.size, (30, 40) if orientation == 6 else (40, 30)
                    )
                self.assertEqual(
                    result["image_aspect_ratio"], 0.75 if orientation == 6 else 4 / 3
                )

    def test_gemini_time_budget_exhaustion_still_allows_groq(self):
        self.groq_response(json.dumps(self.fixture))
        with (
            patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}),
            patch(
                "scenes.vlm_service._generate_content_with_fallback",
                side_effect=ModelsUnavailableError([("gemini-3.8-flash", "HTTP 504")]),
            ),
            self.assertLogs("scenes.vlm_service", level="WARNING"),
        ):
            result = analyze_image(str(self.path))
        self.assertTrue(result["objects"])
        self.groq_generate.assert_called_once()

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

    def test_default_fallbacks_include_alternatives_for_configured_primary(self):
        with patch.dict(os.environ, {"GEMINI_MODEL": "gemini-3.6-flash"}):
            self.assertEqual(
                _get_model_candidates(),
                [
                    "gemini-3.6-flash",
                    "gemini-3.8-flash",
                    "gemini-3.5-flash-lite",
                    "gemini-3.7-flash",
                    "gemini-3.5-flash",
                ],
            )

    def test_empty_fallback_setting_disables_switching(self):
        with (
            patch.dict(os.environ, {"GEMINI_FALLBACK_MODELS": " , "}),
            self.assertRaises(ModelsUnavailableError),
            self.assertLogs("scenes.vlm_service", level="WARNING"),
        ):
            self.analyze(errors.ServerError(503, {}), errors.ServerError(503, {}))
        self.assertEqual(self.attempted_models(), ["gemini-3.8-flash"] * 2)

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
                "gemini-3.5-flash-lite",
                "gemini-3.5-flash-lite",
                "gemini-3.7-flash",
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
                initial, *(errors.ServerError(503, {}) for _ in range(10))
            )
        self.assertEqual(self.generate.call_count, 11)
        self.assertIsNone(result["room_landmarks"])
        self.assertEqual(len(result["objects"]), len(initial["objects"]))
        self.assertIn("retained first analysis", result["analysis_notes"][0])
        self.groq_factory.assert_not_called()

    def test_transport_timeouts_and_connection_failures_switch_models(self):
        for error in (
            httpx.ReadTimeout("timeout"),
            httpx.ConnectError("connection"),
            httpx.RemoteProtocolError("closed"),
        ):
            with (
                self.subTest(error=type(error).__name__),
                self.assertLogs("scenes.vlm_service", level="WARNING"),
            ):
                self.analyze(error, self.fixture)
                self.assertEqual(
                    self.attempted_models(),
                    ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
                )

    def test_retry_pass_skips_missing_models_and_can_recover(self):
        with (
            patch.dict(
                os.environ,
                {"GEMINI_MODEL": "missing", "GEMINI_FALLBACK_MODELS": "busy"},
            ),
            self.assertLogs("scenes.vlm_service", level="WARNING"),
        ):
            self.analyze(
                errors.ClientError(404, {}), errors.ServerError(503, {}), self.fixture
            )
        self.assertEqual(self.attempted_models(), ["missing", "busy", "busy"])
        self.sleep.assert_called_once()

    def test_shared_deadline_caps_request_timeout_and_stops_later_attempts(self):
        clock = [0.0]

        def fail(**kwargs):
            clock[0] += 2
            raise errors.ServerError(503, {})

        self.generate.side_effect = fail
        with (
            patch("scenes.vlm_service.time.monotonic", side_effect=lambda: clock[0]),
            self.assertLogs("scenes.vlm_service", level="WARNING"),
            self.assertRaises(ModelsUnavailableError),
        ):
            _generate_content_with_fallback(
                self.client,
                models=["first", "second"],
                contents=["test"],
                config=types.GenerateContentConfig(),
                deadline=1.0,
            )
        self.generate.assert_called_once()
        self.assertEqual(
            self.generate.call_args.kwargs["config"].http_options.timeout, 1000
        )
        self.sleep.assert_not_called()

    def test_sdk_retries_are_disabled_and_model_success_is_logged(self):
        with self.assertLogs("scenes.vlm_service", level="INFO") as logs:
            self.analyze(self.fixture)
        self.assertTrue(
            any(
                "Gemini success: model=gemini-3.8-flash" in line for line in logs.output
            )
        )
        self.assertEqual(
            self.client_factory.call_args.kwargs["http_options"].retry_options.attempts,
            1,
        )
        self.assertEqual(
            self.generate.call_args.kwargs[
                "config"
            ].http_options.retry_options.attempts,
            1,
        )

    def test_custom_primary_does_not_skip_default_primary_as_alternative(self):
        with patch.dict(os.environ, {"GEMINI_MODEL": "custom"}):
            self.assertEqual(
                _get_model_candidates()[:3],
                ["custom", "gemini-3.8-flash", "gemini-3.5-flash-lite"],
            )
