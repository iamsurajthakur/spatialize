"""Explicit, billable probes of image input and structured output for each model."""

import json
import os
import time
from io import BytesIO

from django.core.management.base import BaseCommand, CommandError
from google import genai
from google.genai import errors, types
from PIL import Image

from scenes.vlm_service import TRANSPORT_ERRORS, _get_model_candidates


class Command(BaseCommand):
    help = "Send one small image/JSON request per model and report availability (uses API quota)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--model",
            action="append",
            help="Probe only these model IDs; repeat for multiple models.",
        )
        parser.add_argument("--timeout-ms", type=int, default=60000)

    def handle(self, *args, **options):
        if options["timeout_ms"] <= 0:
            raise CommandError("--timeout-ms must be positive")
        key = os.getenv("GEMINI_API_KEY", "").strip()
        if not key:
            raise CommandError("GEMINI_API_KEY is not configured")
        models = options["model"] or _get_model_candidates()
        pixels = BytesIO()
        Image.new("RGB", (16, 16), "blue").save(pixels, format="PNG")
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "object",
                "properties": {"color": {"type": "string"}},
                "required": ["color"],
            },
        )
        passed = 0
        with genai.Client(
            api_key=key,
            http_options=types.HttpOptions(
                timeout=options["timeout_ms"],
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        ) as client:
            for model in models:
                self.stdout.write(f"Checking {model}...")
                started = time.monotonic()
                try:
                    response = client.models.generate_content(
                        model=model,
                        contents=[
                            types.Part.from_bytes(
                                data=pixels.getvalue(), mime_type="image/png"
                            ),
                            "Name the dominant color of this image in the color field.",
                        ],
                        config=config,
                    )
                    result = json.loads(response.text or "")
                    if not isinstance(result, dict) or not isinstance(
                        result.get("color"), str
                    ):
                        raise TypeError("Invalid structured output")
                except errors.APIError as error:
                    self.stdout.write(
                        f"FAIL {model}: HTTP {error.code} ({time.monotonic() - started:.1f}s)"
                    )
                except TRANSPORT_ERRORS as error:
                    self.stdout.write(
                        f"FAIL {model}: {type(error).__name__} ({time.monotonic() - started:.1f}s)"
                    )
                except (ValueError, TypeError):
                    self.stdout.write(f"FAIL {model}: invalid structured output")
                else:
                    passed += 1
                    self.stdout.write(
                        f"OK   {model}: image input and JSON output ({time.monotonic() - started:.1f}s)"
                    )
        if not passed:
            raise CommandError(
                "No model passed. HTTP 503/504 indicates temporary unavailability; 429 indicates quota/rate limits; 404 indicates an unavailable model ID; 400/401/403 requires checking request/account configuration."
            )
        self.stdout.write(
            f"{passed}/{len(models)} models passed. Availability can change; this is a small probe, not a full room analysis."
        )
