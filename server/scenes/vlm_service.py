import logging
import os
import random
import time
from io import BytesIO
from pathlib import Path

import httpx
from dotenv import load_dotenv
from google import genai
from google.genai import errors, types
from PIL import Image, ImageOps
from pydantic import BaseModel, ValidationError

from .floor_mapping import FloorMapping
from .geometry_engine import CANONICAL_ROOM
from .schemas import RoomLandmarks, SceneAnalysis, SceneGeometryInput

load_dotenv()
logger = logging.getLogger(__name__)

DEFAULT_GEMINI_MODELS = (
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
)
FALLBACK_STATUS_CODES = {404, 408, 429, 500, 502, 503, 504}
TRANSPORT_ERRORS = (
    httpx.TimeoutException,
    httpx.NetworkError,
    httpx.RemoteProtocolError,
)


class ModelsUnavailableError(RuntimeError):
    """All configured models failed, or the shared analysis time budget expired."""

    def __init__(self, attempts: list[tuple[str, str]]):
        self.attempts = attempts
        super().__init__(
            "AI analysis is temporarily unavailable. Please try again shortly."
        )


def _positive_int_setting(name: str, default: int) -> int:
    value = int(os.getenv(name, str(default)))
    if value <= 0:
        raise ValueError(f"{name} must be a positive integer")
    return value


SCENE_PROMPT = """
Describe the major visible furniture, windows, and floor rugs in this room as a coherent stylized layout.
All image points and bounding boxes use normalized [0,1] coordinates: left/top=0,
right/bottom=1. Never output metric dimensions, room sizes or 3D coordinates.
Allowed object types: table, chair, sofa, bed, desk, cabinet, bookshelf, window, rug, lamp, plant, tv, generic.
Use bookshelf for a visible bookcase or freestanding open shelving unit, including
partially filled or empty bookcases. Use cabinet for storage with closed doors.
Treat the bookshelf and its books as one object; do not list individual books.
Use window for a visible wall window, not a mirror, painting, TV, or doorway.
Include its frame in the bbox and describe each separate window as one object.
For windows, set wall_relation to against_wall and the wall containing the window,
using the named floor edges below. Use support equal to that wall name. Set center
to the image center of the window frame. Set floor_contact to null unless the floor
projection directly beneath its center is reliable. The backend mounts windows
above the floor using their image position; never treat their lower edge as floor.
Use rug for a visible loose floor rug, area rug, carpet mat, or runner, including
rugs partially under furniture. Do not label bare floors, floor tiles, shadows,
or wall-to-wall carpet as separate rugs. Set color to its dominant fabric color
as a six-digit #RRGGBB hex value. For patterns, use the main background/base color;
ignore shadows, highlights, and furniture covering the rug. Use null if uncertain.
For rugs, floor_contact is the image projection of the rug's CENTER on the floor,
not its nearest edge. Set support=floor and wall_relation=null. Furniture standing
on a rug still uses support=floor; rugs may overlap furniture without moving it.
Use unique IDs and exact IDs for relation/support targets. Do not invent hidden objects.

FLOOR LANDMARKS:
Identify ONE rectangular patch of the room floor in perspective. Its four corners
are back_left_corner, back_right_corner, right_front_floor, left_front_floor in
clockwise image order. Back corners are WALL-FLOOR intersections, never ceiling
corners. For a corner view, the far shared wall-floor corner is back_left_corner;
the edge running toward image-right is the back wall, and the edge toward
image-left is the left wall. This defines room axes consistently even in cutaways.
Front corners must correspond to the same near cross-section parallel in WORLD
space to the back edge. They are not arbitrary image-bottom corners. If the
physical front boundary is out of frame, a reliably inferred near floor extent
may be used; set front_boundary=visible_floor_extent. Otherwise use wall.
Occluded corners may only be inferred from clear straight wall-floor edges;
set uncertain/unavailable points to null. Give landmark confidence. A partial
set is better than a made-up quadrilateral. Never use furniture edges as room edges.
For cutaway/isometric views: left_front_floor is the SCREEN-LEFT outer floor
vertex, back_right_corner is the SCREEN-RIGHT outer floor vertex, and
right_front_floor is the nearest/bottom floor vertex. The far shared corner is
back_left_corner. Even when no front walls are built, those floor vertices count.
Set projection_hint=orthographic only when parallel floor edges remain parallel
in the image (typical isometric diagrams), perspective when they converge, or
unknown. This is an image observation, not a camera measurement.

OBJECT ANCHORS:
Provide a tight visible bbox. floor_contact is the image projection of the CENTER
of the object's footprint on the floor beneath it, not its visual/bbox center,
not its nearest leg, and not the bottom of a wall-mounted/elevated object. Infer
this footprint center only if reasonably clear, otherwise null. For a lamp on
a desk, floor_contact would be beneath the lamp on the room floor, not on the
desktop; use null if hidden. Bbox center and coarse region are descriptive only.
The backend uses bbox bottom-center as a lower-confidence fallback.

SEMANTICS:
+X runs from the left wall to the right wall, +Z from the back edge toward the
front edge/camera side, +Y is up. Wall names refer to those FLOOR EDGES, not the
image half containing an object. Object x/y/z and sizes are computed by code.
The back_wall is exactly the segment back_left_corner -> back_right_corner;
left_wall is back_left_corner -> left_front_floor; right_wall is
back_right_corner -> right_front_floor. In a cutaway the visible wall on the
image right is usually back_wall, NOT right_wall. Check wall targets against
these named floor edges before returning them.
Use against_wall only for clear physical attachment; near for loose proximity.
Use centered_on only for clear evidence of wall centering. Otherwise null.
left_of/right_of and in_front_of/behind describe the floor layout in those room
axes. beside/near should preserve observed separation, and facing describes
orientation, not a new location. Do not create redundant contradictory relations.
orientation may be parallel_to_back_wall, parallel_to_left_wall,
parallel_to_right_wall, parallel_to_front_wall, or unknown. This names the wall
behind the object's back: its front faces inward from that wall.
support is floor, a window's wall name, or the exact ID of a supporting object. Avoid unsupported wall
art/ceiling fixtures unless their vertical placement can be represented.
Give object confidence [0,1]. Return only the requested structured JSON.
"""


def _get_model_candidates() -> list[str]:
    primary = os.getenv("GEMINI_MODEL", "").strip() or DEFAULT_GEMINI_MODELS[0]
    # An explicitly empty fallback list disables model switching.
    fallbacks = os.getenv("GEMINI_FALLBACK_MODELS", ",".join(DEFAULT_GEMINI_MODELS))
    return list(
        dict.fromkeys(
            model.strip() for model in [primary, *fallbacks.split(",")] if model.strip()
        )
    )


def _generate_content_with_fallback(
    client: genai.Client,
    *,
    models: list[str],
    contents: list[types.Part | str],
    config: types.GenerateContentConfig,
    deadline: float | None = None,
    response_model: type[BaseModel] | None = None,
) -> tuple[types.GenerateContentResponse, str]:
    if not models:
        raise ValueError("At least one Gemini model must be configured")
    if deadline is None:
        deadline = (
            time.monotonic()
            + _positive_int_setting("GEMINI_TOTAL_TIMEOUT_MS", 180000) / 1000
        )
    timeout_ms = _positive_int_setting("GEMINI_TIMEOUT_MS", 60000)
    attempts: list[tuple[str, str]] = []
    candidates = models
    # Try alternatives before retrying busy models. One delayed second pass is
    # enough; do not multiply this with hidden SDK retries on every request.
    for round_index in range(2):
        retry_models = []
        for model in candidates:
            remaining_ms = int((deadline - time.monotonic()) * 1000)
            if remaining_ms <= 0:
                logger.warning(
                    "Gemini analysis time budget exhausted; attempts=%s", attempts
                )
                raise ModelsUnavailableError(attempts)
            started = time.monotonic()
            logger.info("Gemini attempt: model=%s pass=%s", model, round_index + 1)
            request_config = config.model_copy(
                update={
                    "http_options": types.HttpOptions(
                        timeout=min(timeout_ms, remaining_ms),
                        retry_options=types.HttpRetryOptions(attempts=1),
                    )
                }
            )
            try:
                response = client.models.generate_content(
                    model=model, contents=contents, config=request_config
                )
                if response_model is not None:
                    response_model.model_validate_json(response.text or "")
                logger.info(
                    "Gemini success: model=%s elapsed=%.1fs",
                    model,
                    time.monotonic() - started,
                )
                return response, model
            except errors.APIError as error:
                if error.code not in FALLBACK_STATUS_CODES:
                    # Do not conceal invalid credentials, billing or bad requests.
                    logger.error(
                        "Gemini request rejected: model=%s HTTP=%s", model, error.code
                    )
                    raise
                reason = f"HTTP {error.code}"
                if error.code != 404:
                    retry_models.append(model)
            except TRANSPORT_ERRORS as error:
                reason = type(error).__name__
                retry_models.append(model)
            except ValidationError:
                # Invalid inference output should advance to the next model.
                # Keep the second pass reserved for transient provider failures.
                reason = "invalid structured output"
            attempts.append((model, reason))
            logger.warning(
                "Gemini failed: model=%s reason=%s elapsed=%.1fs; trying remaining fallbacks",
                model,
                reason,
                time.monotonic() - started,
            )
        if round_index == 0 and retry_models:
            delay = 1 + random.random()
            if time.monotonic() + delay >= deadline:
                break
            logger.warning(
                "Gemini fallbacks exhausted; retrying transient failures once after backoff"
            )
            time.sleep(delay)
            candidates = retry_models
        else:
            break
    logger.warning("Gemini models unavailable; attempts=%s", attempts)
    raise ModelsUnavailableError(attempts)


def analyze_image(image_path: str) -> dict:
    """Local-file entry point for the replay CLI."""
    return analyze_image_bytes(Path(image_path).read_bytes())


def analyze_image_bytes(image_bytes: bytes) -> dict:
    """Analyze pixels from either local or remote Django storage."""
    with Image.open(BytesIO(image_bytes)) as image:
        mime_type = Image.MIME.get(image.format, "application/octet-stream")
        upright = ImageOps.exif_transpose(image)
        image_aspect = upright.width / upright.height
        if image.getexif().get(274, 1) != 1:
            # Browsers display EXIF orientation. Give the model the same pixels
            # rather than letting two decoders disagree on bbox coordinates.
            encoded = BytesIO()
            upright.save(encoded, format="PNG")
            image_bytes, mime_type = encoded.getvalue(), "image/png"
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
    # Lazy construction keeps offline validation, replay and tests independent of
    # API credentials. The original image is sent only during explicit analysis.
    models = _get_model_candidates()
    deadline = (
        time.monotonic()
        + _positive_int_setting("GEMINI_TOTAL_TIMEOUT_MS", 180000) / 1000
    )
    with genai.Client(
        api_key=os.getenv("GEMINI_API_KEY"),
        http_options=types.HttpOptions(
            timeout=_positive_int_setting("GEMINI_TIMEOUT_MS", 60000),
            retry_options=types.HttpRetryOptions(attempts=1),
        ),
    ) as client:
        try:
            response, selected_model = _generate_content_with_fallback(
                client,
                models=models,
                deadline=deadline,
                contents=[image_part, SCENE_PROMPT],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json", response_schema=SceneAnalysis
                ),
                response_model=SceneGeometryInput,
            )
        except ModelsUnavailableError as gemini_error:
            # Load and initialize Groq only after the Gemini analysis attempts
            # are exhausted. Optional floor refinement never triggers Groq.
            from .groq_provider import GroqUnavailableError, analyze_with_groq

            logger.warning("Gemini models exhausted; falling back to Groq")
            try:
                analysis = analyze_with_groq(image_bytes, mime_type, SCENE_PROMPT)
            except GroqUnavailableError as groq_error:
                raise ModelsUnavailableError(
                    gemini_error.attempts + groq_error.attempts
                ) from None
            return SceneGeometryInput(
                **analysis.model_dump(), image_aspect_ratio=image_aspect
            ).model_dump()
        result = SceneGeometryInput.model_validate_json(response.text or "")
        if FloorMapping(result.room_landmarks, CANONICAL_ROOM, 1).to_floor is None or (
            result.room_landmarks
            and any(
                getattr(result.room_landmarks, name) is None
                for name in (
                    "back_left_corner",
                    "back_right_corner",
                    "left_front_floor",
                    "right_front_floor",
                )
            )
        ):
            # One bounded, focused retry. No invented completion of a partial
            # quadrilateral in code and no silent replacement by metric guesses.
            original = (
                result.room_landmarks.model_dump_json()
                if result.room_landmarks
                else "null"
            )
            try:
                # Start with the working model; skip models that already failed
                # for this image while allowing further fallbacks if needed.
                refinement, _ = _generate_content_with_fallback(
                    client,
                    models=models[models.index(selected_model) :],
                    deadline=deadline,
                    contents=[
                        image_part,
                        "Inspect ONLY the room FLOOR geometry. The previous landmarks could not define a usable rectangular floor patch: "
                        + original
                        + "\n"
                        + SCENE_PROMPT.split("FLOOR LANDMARKS:")[1].split(
                            "OBJECT ANCHORS:"
                        )[0]
                        + "\nFollow the actual floor perimeter. Include visible near endpoints where side wall bases meet the open floor edge. "
                        "An occluded far wall-floor junction must be at FLOOR level, beneath furniture, not on a headboard, mattress or wall top. "
                        "Check that all four points go around one convex floor rectangle projected into the image. "
                        "If a corner cannot be inferred, leave it null. Return only RoomLandmarks.",
                    ],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=RoomLandmarks,
                    ),
                )
                refined = RoomLandmarks.model_validate_json(refinement.text or "")
                if FloorMapping(refined, CANONICAL_ROOM, 1).to_floor is not None:
                    result.room_landmarks = refined
                    result.analysis_notes.append(
                        "Initial floor landmarks incomplete/invalid; accepted one focused floor refinement. Initial: "
                        + original
                    )
                else:
                    result.analysis_notes.append(
                        "Focused floor refinement still incomplete/invalid; retained initial fallback. Refinement: "
                        + refined.model_dump_json()
                    )
            except Exception as error:  # noqa: BLE001 - refinement is optional
                # The first analysis is usable even if optional refinement is
                # unavailable. Preserve it and make that degradation observable.
                logger.warning(
                    "Optional floor refinement failed: %s", type(error).__name__
                )
                result.analysis_notes.append(
                    "Floor refinement failed ("
                    + type(error).__name__
                    + "); retained first analysis"
                )
    result.image_aspect_ratio = image_aspect
    return result.model_dump()
