"""Optional Groq vision fallback; downstream consumers only see SceneAnalysis."""

import base64
import logging
import os
import random
import time

from groq import APIConnectionError, APIResponseValidationError, APIStatusError, Groq
from pydantic import ValidationError

from .schemas import SceneAnalysis

logger = logging.getLogger(__name__)
GROQ_MODEL = "qwen/qwen3.8-27b"
RETRY_STATUS_CODES = {408, 429, 500, 502, 503, 504}
MAX_ATTEMPTS = 3
TOTAL_TIMEOUT_SECONDS = 30.0
REQUEST_TIMEOUT_SECONDS = 15.0


class GroqUnavailableError(RuntimeError):
    def __init__(self, attempts: list[tuple[str, str]]):
        self.attempts = attempts
        super().__init__("Groq analysis unavailable")


def _scene_response_format() -> dict:
    """Adapt a fresh schema for Groq strict mode without changing our models.

    Require every property (nullable fields retain their anyOf/null), close all
    objects including $defs, and remove default/title annotations. References,
    enums, numeric bounds, and string constraints stay intact. Cross-field
    rules such as bbox ordering and unique IDs still require Pydantic validation.
    """
    schema = SceneAnalysis.model_json_schema()

    def normalize(node):
        if isinstance(node, dict):
            node.pop("default", None)
            node.pop("title", None)
            if node.get("type") == "object":
                node["required"] = list(node["properties"])
                node["additionalProperties"] = False
            for value in node.values():
                normalize(value)
        elif isinstance(node, list):
            for value in node:
                normalize(value)

    normalize(schema)
    return {
        "type": "json_schema",
        "json_schema": {"name": "SceneAnalysis", "strict": True, "schema": schema},
    }


def analyze_with_groq(image_bytes: bytes, mime_type: str, prompt: str) -> SceneAnalysis:
    """Use the prepared image and unchanged semantic prompt, with bounded retries."""
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        logger.warning("Groq fallback unavailable: GROQ_API_KEY is not configured")
        raise GroqUnavailableError([])

    encoded = base64.b64encode(image_bytes).decode("ascii")
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{encoded}"},
                },
            ],
        }
    ]
    response_format = _scene_response_format()
    attempts = []
    deadline = time.monotonic() + TOTAL_TIMEOUT_SECONDS
    # Disable SDK retries so these three attempts are the only retry loop.
    with Groq(
        api_key=api_key,
        max_retries=0,
        timeout=REQUEST_TIMEOUT_SECONDS,
        _strict_response_validation=True,
    ) as client:
        for attempt in range(MAX_ATTEMPTS):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            logger.info("Groq attempt: model=%s attempt=%s", GROQ_MODEL, attempt + 1)
            retryable = False
            try:
                response = client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=messages,
                    response_format=response_format,
                    timeout=min(REQUEST_TIMEOUT_SECONDS, remaining),
                )
            except APIStatusError as error:
                reason = f"HTTP {error.status_code}"
                retryable = error.status_code in RETRY_STATUS_CODES
            except APIConnectionError as error:
                # Includes APITimeoutError; never log request URLs or bodies.
                reason = type(error).__name__
                retryable = True
            except APIResponseValidationError:
                reason = "invalid response envelope"
            else:
                if not response.choices or response.choices[0].finish_reason != "stop":
                    reason = "empty, refused, or incomplete output"
                else:
                    try:
                        result = SceneAnalysis.model_validate_json(
                            response.choices[0].message.content or ""
                        )
                    except ValidationError:
                        reason = "invalid structured output"
                    else:
                        logger.info("Groq analysis succeeded: model=%s", GROQ_MODEL)
                        return result

            attempts.append((GROQ_MODEL, reason))
            logger.warning(
                "Groq attempt failed: model=%s attempt=%s reason=%s",
                GROQ_MODEL,
                attempt + 1,
                reason,
            )
            if not retryable or attempt == MAX_ATTEMPTS - 1:
                break
            delay = 2**attempt + random.random() * 0.25
            if time.monotonic() + delay >= deadline:
                break
            time.sleep(delay)

    raise GroqUnavailableError(attempts) from None
