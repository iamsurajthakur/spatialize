import os
from pathlib import Path
from dotenv import load_dotenv

from google import genai
from google.genai import types

from .schemas import SceneData
from .validators import validate_scene_json

load_dotenv()

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)


def analyze_image(image_path: str) -> dict:

    path = Path(image_path)

    image_bytes = path.read_bytes()

    mime_type = get_mime_type(path)

    prompt = """
Analyze this indoor room image and produce a coarse 3D scene description.

Rules:

1. Identify the room type implicitly from the visible scene and estimate
   reasonable room dimensions.

2. Detect the major visible furniture and room objects.

3. Only include objects that are useful for recreating the room as a
   simple stylized 3D scene.

4. Allowed object types are:
   table, chair, sofa, bed, desk, cabinet, lamp, tv, generic.

5. Use this coordinate convention:
   - X = left/right
   - Y = up/down
   - Z = front/back
   - room center is (0, 0, 0)
   - floor is y = 0
   - x, y, z represent the center of each object's bounding box.

6. Coordinates are coarse layout estimates, not real-world measurements.

7. Keep objects inside or near the room bounds.

8. If an object cannot confidently be assigned one of the known types,
   use "generic".

9. Do not invent tiny or irrelevant objects.

10. Return only the requested structured data.
"""

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=[
            types.Part.from_bytes(
                data=image_bytes,
                mime_type=mime_type,
            ),
            prompt,
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=SceneData
        )
    )
    
    raw_data = SceneData.model_validate_json(
        response.text or ""
    ).model_dump()

    validated_data = validate_scene_json(
        raw_data
    )
    
    return validated_data


def get_mime_type(path: Path) -> str:
    suffix = path.suffix.lower()

    mime_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }

    return mime_types.get(
        suffix,
        "application/octet-stream",
    )