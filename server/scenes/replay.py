"""Replay geometry without modifying saved Django scenes.

python -B -m scenes.replay --input analysis.json --output scene.json
python -B -m scenes.replay --image room.jpg --output scene.json
The --image form calls the configured VLM and also saves scene.analysis.json.
"""

import argparse
from pathlib import Path

from .geometry_engine import compute_geometry
from .schemas import SceneGeometryInput
from .validators import validate_scene_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", type=Path)
    source.add_argument("--image", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.image:
        from .vlm_service import analyze_image

        data = SceneGeometryInput.model_validate(analyze_image(str(args.image)))
        args.output.with_suffix(".analysis.json").write_text(
            data.model_dump_json(indent=2)
        )
    else:
        data = SceneGeometryInput.model_validate_json(args.input.read_text())
    result = compute_geometry(data)
    validate_scene_json(result.model_dump())
    args.output.write_text(result.model_dump_json(indent=2))
    print(
        f"{len(result.objects)} objects; mapping={result.debug_info['floor_mapping']['method']}; camera={result.camera['method']}"
    )
    print(args.output)


if __name__ == "__main__":
    main()
