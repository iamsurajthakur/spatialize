import base64
import json
import os
from io import BytesIO
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

import httpx
from groq import Groq
from PIL import Image

from .groq_provider import GROQ_MODEL, GroqUnavailableError, analyze_with_groq
from .schemas import SceneAnalysis
from .vlm_service import SCENE_PROMPT


class GroqProviderTests(TestCase):
    """Exercise the real SDK against a local mock transport, never the network."""

    def setUp(self):
        environment = patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}, clear=True)
        environment.start()
        self.addCleanup(environment.stop)
        sleeper = patch("scenes.groq_provider.time.sleep")
        self.sleep = sleeper.start()
        self.addCleanup(sleeper.stop)
        jitter = patch("scenes.groq_provider.random.random", return_value=0.0)
        jitter.start()
        self.addCleanup(jitter.stop)
        fixture = Path(__file__).with_name("fixtures") / "basic_room_annotated.json"
        self.fixture = json.loads(fixture.read_text())
        pixels = BytesIO()
        Image.new("RGB", (40, 30)).save(pixels, format="PNG")
        self.pixels = pixels.getvalue()
        self.requests = []
        self.responses = []
        self.clock = None

        def handle(request):
            self.requests.append(request)
            if self.clock is not None:
                self.clock[0] += 16
            response = self.responses.pop(0)
            if isinstance(response, Exception):
                raise response
            status, body = response
            return httpx.Response(status, json=body)

        factory = patch(
            "scenes.groq_provider.Groq",
            side_effect=lambda **kwargs: Groq(
                http_client=httpx.Client(transport=httpx.MockTransport(handle)),
                **kwargs,
            ),
        )
        self.factory = factory.start()
        self.addCleanup(factory.stop)

    def completion(self, content=None, finish_reason="stop"):
        return (
            200,
            {
                "id": "test-completion",
                "created": 1,
                "model": GROQ_MODEL,
                "object": "chat.completion",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": finish_reason,
                        "message": {
                            "role": "assistant",
                            "content": json.dumps(self.fixture)
                            if content is None
                            else content,
                        },
                    }
                ],
            },
        )

    def analyze(self):
        return analyze_with_groq(self.pixels, "image/png", SCENE_PROMPT)

    def test_real_sdk_sends_same_prompt_image_and_strict_scene_schema(self):
        original_schema = SceneAnalysis.model_json_schema()
        self.responses = [self.completion()]
        result = self.analyze()
        self.assertIsInstance(result, SceneAnalysis)
        self.assertEqual(result, SceneAnalysis.model_validate(self.fixture))
        self.assertEqual(len(self.requests), 1)
        payload = json.loads(self.requests[0].content)
        self.assertEqual(payload["model"], "qwen/qwen3.8-27b")
        self.assertEqual(len(payload["messages"]), 1)
        content = payload["messages"][0]["content"]
        self.assertEqual(len(content), 2)
        self.assertEqual(content[0], {"type": "text", "text": SCENE_PROMPT})
        url = content[1]["image_url"]["url"]
        self.assertEqual(url.split(",")[0], "data:image/png;base64")
        self.assertEqual(base64.b64decode(url.split(",")[1]), self.pixels)
        response_format = payload["response_format"]
        self.assertEqual(response_format["type"], "json_schema")
        self.assertIs(response_format["json_schema"]["strict"], True)
        schema = response_format["json_schema"]["schema"]

        def check(node):
            if isinstance(node, dict):
                self.assertNotIn("default", node)
                if node.get("type") == "object":
                    self.assertIs(node["additionalProperties"], False)
                    self.assertEqual(set(node["required"]), set(node["properties"]))
                for value in node.values():
                    check(value)
            elif isinstance(node, list):
                for value in node:
                    check(value)

        check(schema)
        self.assertEqual(
            schema["properties"]["room_landmarks"]["anyOf"][-1], {"type": "null"}
        )
        self.assertEqual(schema["$defs"]["Point2D"]["properties"]["x"]["minimum"], 0)
        self.assertEqual(schema["$defs"]["Point2D"]["properties"]["x"]["maximum"], 1)
        self.assertNotIn("image_aspect_ratio", schema["properties"])
        self.assertEqual(SceneAnalysis.model_json_schema(), original_schema)
        self.assertEqual(self.factory.call_args.kwargs["max_retries"], 0)
        self.assertLessEqual(self.requests[0].extensions["timeout"]["read"], 15)

    def test_temporary_statuses_and_network_errors_retry_with_bounded_backoff(self):
        failures = [
            (status, {"error": {"message": "private-provider-details"}})
            for status in (408, 429, 500, 502, 503, 504)
        ]
        failures += [
            httpx.ReadTimeout("private-timeout"),
            httpx.ConnectError("private-network"),
        ]
        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                self.requests.clear()
                self.sleep.reset_mock()
                self.responses = [failure, failure, self.completion()]
                with self.assertLogs("scenes.groq_provider", level="WARNING") as logs:
                    self.analyze()
                self.assertEqual(len(self.requests), 3)
                self.assertEqual(
                    [call.args[0] for call in self.sleep.call_args_list], [1, 2]
                )
                self.assertNotIn("private-", "\n".join(logs.output))

    def test_retries_stop_after_three_attempts(self):
        self.responses = [(503, {})] * 3
        with (
            self.assertLogs("scenes.groq_provider"),
            self.assertRaises(GroqUnavailableError) as raised,
        ):
            self.analyze()
        self.assertEqual(len(self.requests), 3)
        self.assertEqual(raised.exception.attempts, [(GROQ_MODEL, "HTTP 503")] * 3)
        self.assertEqual(self.sleep.call_count, 2)

    def test_total_budget_caps_timeout_and_stops_later_attempts(self):
        self.clock = [0.0]
        self.responses = [(503, {})] * 3
        with (
            patch(
                "scenes.groq_provider.time.monotonic", side_effect=lambda: self.clock[0]
            ),
            self.assertLogs("scenes.groq_provider"),
            self.assertRaises(GroqUnavailableError),
        ):
            self.analyze()
        self.assertEqual(len(self.requests), 2)
        self.assertEqual(self.requests[1].extensions["timeout"]["read"], 14)
        self.sleep.assert_called_once()

    def test_non_transient_statuses_are_not_retried(self):
        for status in (400, 401, 403, 404, 422):
            with self.subTest(status=status):
                self.requests.clear()
                self.responses = [(status, {"error": {"message": "secret"}})]
                with (
                    self.assertLogs("scenes.groq_provider"),
                    self.assertRaises(GroqUnavailableError),
                ):
                    self.analyze()
                self.assertEqual(len(self.requests), 1)
        self.sleep.assert_not_called()

    def test_pydantic_rejects_invalid_json_and_scene_semantics(self):
        obj = self.fixture["objects"][0]
        invalid = [
            "not JSON",
            "",
            "null",
            "{}",
            '{"objects":"invalid"}',
            json.dumps({"objects": [obj, obj]}),
            json.dumps(
                {
                    "objects": [
                        {
                            **obj,
                            "bbox": {
                                "x_min": 0.8,
                                "x_max": 0.2,
                                "y_min": 0.1,
                                "y_max": 0.9,
                            },
                        }
                    ]
                }
            ),
            json.dumps({"objects": [{**obj, "confidence": 2}]}),
            json.dumps({"objects": [{**obj, "color": "red"}]}),
        ]
        for content in invalid:
            with self.subTest(content=content):
                self.requests.clear()
                self.responses = [self.completion(content)]
                with (
                    self.assertLogs("scenes.groq_provider"),
                    self.assertRaises(GroqUnavailableError) as raised,
                ):
                    self.analyze()
                self.assertEqual(len(self.requests), 1)
                self.assertEqual(
                    raised.exception.attempts[-1][1], "invalid structured output"
                )
        self.sleep.assert_not_called()

    def test_empty_refused_truncated_and_malformed_envelopes_are_rejected(self):
        empty = self.completion()
        empty[1]["choices"] = []
        null_content = self.completion()
        null_content[1]["choices"][0]["message"]["content"] = None
        cases = [
            empty,
            null_content,
            (200, {}),
            self.completion(finish_reason="length"),
            self.completion(finish_reason="content_filter"),
        ]
        for response in cases:
            with self.subTest(response=response):
                self.requests.clear()
                self.responses = [response]
                with (
                    self.assertLogs("scenes.groq_provider"),
                    self.assertRaises(GroqUnavailableError),
                ):
                    self.analyze()
                self.assertEqual(len(self.requests), 1)
        self.sleep.assert_not_called()

    def test_missing_key_does_not_initialize_sdk(self):
        with (
            patch.dict(os.environ, {"GROQ_API_KEY": "  "}),
            self.assertLogs("scenes.groq_provider"),
            self.assertRaises(GroqUnavailableError),
        ):
            self.analyze()
        self.factory.assert_not_called()

    def test_programming_errors_are_not_converted_into_provider_failures(self):
        with (
            patch(
                "scenes.groq_provider._scene_response_format",
                side_effect=TypeError("bug"),
            ),
            self.assertRaisesRegex(TypeError, "bug"),
        ):
            self.analyze()
        self.factory.assert_not_called()
