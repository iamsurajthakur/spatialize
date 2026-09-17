"""Mount windows on walls using the estimated source camera, with explicit priors."""

import math

from .camera_geometry import cross, unit
from .floor_mapping import project
from .schemas import Point2D, SceneObject

WALLS = {
    "back_wall": (2, -1, 0),
    "front_wall": (2, 1, 180),
    "left_wall": (0, -1, 90),
    "right_wall": (0, 1, -90),
}


def point_on_wall(camera, u, v, axis, plane):
    """Intersect an image ray with a wall plane for either source camera kind."""
    forward = unit([t - p for t, p in zip(camera["target"], camera["position"])])
    right = unit(cross(forward, camera["up"]))
    up = cross(right, forward)
    origin = list(camera["position"])
    if camera["kind"] == "orthographic":
        horizontal = camera["left"] + u * (camera["right"] - camera["left"])
        vertical = camera["top"] + v * (camera["bottom"] - camera["top"])
        origin = [
            p + horizontal * r + vertical * q for p, r, q in zip(origin, right, up)
        ]
        direction = forward
    else:
        scale = math.tan(math.radians(camera["fov"]) / 2)
        horizontal = (2 * u - 1) * scale * camera["image_aspect_ratio"]
        vertical = (1 - 2 * v) * scale
        direction = [
            f + horizontal * r + vertical * q for f, r, q in zip(forward, right, up)
        ]
    if abs(direction[axis]) < 1e-7:
        return None
    distance = (plane - origin[axis]) / direction[axis]
    if distance <= 0:
        return None
    return [p + distance * d for p, d in zip(origin, direction)]


def place_window(item, wall_relation, room, mapping, camera, size):
    warnings = []
    wall = wall_relation[0] if wall_relation else None
    if wall is None and item.support in WALLS:
        wall = item.support
    if wall is None:
        wall = next(
            (name for name in WALLS if item.orientation == f"parallel_to_{name}"),
            "back_wall",
        )
        warnings.append("Window wall inferred from orientation or back-wall prior")
    axis, sign, rotation = WALLS[wall]
    along = 2 if axis == 0 else 0
    width, height, depth = size
    span = room.width if axis == 0 else room.depth
    along_span = room.depth if axis == 0 else room.width
    center = item.center or Point2D(
        x=(item.bbox.x_min + item.bbox.x_max) / 2,
        y=(item.bbox.y_min + item.bbox.y_max) / 2,
    )
    plane = sign * (span / 2 - depth / 2)
    point = None
    if camera["method"] in {
        "affine_floor_camera",
        "floor_camera_centered_intrinsics",
        "floor_camera_fov_prior",
    }:
        point = point_on_wall(camera, center.x, center.y, axis, plane)
    if point is not None and not (
        all(math.isfinite(value) for value in point)
        and 0 < point[1] < room.height
        and abs(point[along]) <= along_span / 2
    ):
        point = None
    method = "image_ray_wall_intersection"
    if point is None:
        point = [0, room.height * 0.6, 0]
        if item.floor_contact:
            x, z, _ = mapping.map(item.floor_contact)
            point[along] = x if along == 0 else z
        point[axis] = plane
        method = "canonical_wall_prior"
        warnings.append(
            "Window position uses a canonical height prior; image-to-wall projection unavailable"
        )
    if wall_relation and wall_relation[1] == "centered_on":
        point[along] = 0
    # Keep the entire frame inside the room and leave a sill above floor level.
    point[along] = max(
        -along_span / 2 + width / 2, min(along_span / 2 - width / 2, point[along])
    )
    point[1] = max(height / 2 + 0.15, min(room.height - height / 2 - 0.1, point[1]))
    obj = SceneObject(
        id=item.id,
        type="window",
        x=point[0],
        y=point[1],
        z=point[2],
        rotation_y=rotation,
        width=width,
        height=height,
        depth=depth,
    )
    position = {"x": obj.x, "y": obj.y, "z": obj.z}
    debug = {
        "bbox_normalized": item.bbox.model_dump(),
        "bbox_bottom_center": item.bbox.bottom_center().model_dump(),
        "floor_contact": item.floor_contact.model_dump()
        if item.floor_contact
        else None,
        "window_image_center": center.model_dump(),
        "contact_method": method,
        "initial_canonical_position": position,
        "final_position": position,
        "confidence": item.confidence
        * (mapping.confidence if method == "image_ray_wall_intersection" else 0.25),
        "size_method": "semantic_canonical_prior",
        "wall_selected": wall,
        "constraints": [{"type": "wall_attachment", "target": wall}],
        "collision_corrections": [],
        "warnings": warnings,
    }
    if mapping.to_image:
        u, v = project(mapping.to_image, obj.x, obj.z)
        debug["reprojected_floor_contact"] = {"x": u, "y": v}
    return obj, debug
