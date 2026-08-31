import os
from pathlib import Path
from dotenv import load_dotenv

from google import genai
from google.genai import types

load_dotenv()

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)


def analyze_image(image_path: str) -> str | None:
    """
    Send an image to Gemini and return its raw text response.
    """

    path = Path(image_path)

    image_bytes = path.read_bytes()

    mime_type = get_mime_type(path)

    prompt = """
Act as a spatial geometry analyst. I need to deconstruct this room's layout to eventually build a 3D environment.

Please provide a highly literal, plain-language description of the space. Do not use aesthetic or flowery language (e.g., skip words like "cozy," "beautiful," or "messy").

Describe the scene using these specific categories:
1. Room Type: What kind of room is this?
2. Structural Inventory: List the major furniture and structural elements (sofa, bed, dining table, doors, windows). Strictly ignore small clutter like books, cups, or plants.
3. Camera-Relative Positions: Assuming the camera is at the front edge of the room looking in, where is each item located? Use terms like "foreground left," "center," or "background right."
4. Orientations & Anchors: How are the items rotated or anchored? (e.g., "The back of the sofa is flush against the left wall," "The TV is facing the sofa," "The coffee table is centered directly in front of the sofa").
5. Relative Scale: Mention if a piece of furniture dominates the room's footprint.

Output plain text only. Do not return JSON or code.
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
    )

    return response.text


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