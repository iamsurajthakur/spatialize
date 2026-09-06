"""Approximate a Three.js camera from the same floor correspondence.

Affine floor maps admit an orthographic camera. Perspective maps use a centered,
square-pixel pinhole model. If focal length is underdetermined, use a declared
50-degree FOV prior. Reprojection error exposes non-Euclidean/inconsistent quads.
This camera is a view estimate, never a recovered metric camera calibration.
"""

import math

from .floor_mapping import project


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def norm(a):
    return math.sqrt(dot(a, a))


def unit(a):
    size = norm(a)
    if size < 1e-9:
        raise ValueError("Degenerate camera basis")
    return [x / size for x in a]


def camera_from_floor(mapping):
    room, aspect = mapping.room, mapping.aspect
    default = {"kind": "perspective", "position": [0, room.height * 1.2, room.depth * 1.5],
               "target": [0, room.height / 4, 0], "up": [0, 1, 0], "fov": 50,
               "image_aspect_ratio": aspect, "method": "overview_prior", "floor_reprojection_error": None}
    h = mapping.to_image
    if h is None:
        return default
    # VLM rounding can turn an orthographic floor into a tiny perspective skew.
    # Fit an affine map and accept it only within 1% of normalized image extent.
    # This tolerance reflects landmark precision; it never changes floor mapping.
    bl, br, fr, fl = mapping.image_quad
    affine = [(br[0] - bl[0] + fr[0] - fl[0]) / (2 * room.width),
              (fl[0] - bl[0] + fr[0] - br[0]) / (2 * room.depth),
              sum(p[0] for p in mapping.image_quad) / 4,
              (br[1] - bl[1] + fr[1] - fl[1]) / (2 * room.width),
              (fl[1] - bl[1] + fr[1] - br[1]) / (2 * room.depth),
              sum(p[1] for p in mapping.image_quad) / 4, 0, 0, 1]
    world_corners = [(-room.width / 2, -room.depth / 2), (room.width / 2, -room.depth / 2),
                     (room.width / 2, room.depth / 2), (-room.width / 2, room.depth / 2)]
    affine_error = max(math.dist(project(affine, *world), image)
                       for world, image in zip(world_corners, mapping.image_quad))
    if affine_error <= 0.01:
        h = affine
    # Image coordinates measured in image-height units, +vertical upward.
    a = [aspect * (h[0] - 0.5 * h[6]), 0.5 * h[6] - h[3], h[6]]
    b = [aspect * (h[1] - 0.5 * h[7]), 0.5 * h[7] - h[4], h[7]]
    c = [aspect * (h[2] - 0.5), 0.5 - h[5], 1]
    try:
        if max(abs(h[6]) * room.width, abs(h[7]) * room.depth) < 1e-6:
            # Complete the 2x2 affine floor matrix to scaled orthonormal camera
            # rows. Largest singular value gives the image scale; the missing
            # Y column comes from s²I - A Aᵀ (rank one, positive semidefinite).
            aa, bb, ab = a[0] ** 2 + b[0] ** 2, a[1] ** 2 + b[1] ** 2, a[0] * a[1] + b[0] * b[1]
            scale2 = (aa + bb + math.sqrt((aa - bb) ** 2 + 4 * ab * ab)) / 2
            scale = math.sqrt(scale2)
            vy = math.sqrt(max(0, scale2 - bb))
            vx = -ab / vy if vy > 1e-9 else math.sqrt(max(0, scale2 - aa))
            right = unit([a[0] / scale, vx / scale, b[0] / scale])
            up = unit([a[1] / scale, vy / scale, b[1] / scale])
            backward = unit(cross(right, up))
            distance = max(room.width, room.height, room.depth) * 3
            camera = {"kind": "orthographic", "position": [v * distance for v in backward],
                      "target": [0, 0, 0], "up": up,
                      "left": -h[2] * aspect / scale, "right": (1 - h[2]) * aspect / scale,
                      "top": h[5] / scale, "bottom": -(1 - h[5]) / scale,
                      "image_aspect_ratio": aspect, "method": "affine_floor_camera", "floor_reprojection_error": affine_error}
        else:
            focal2 = -(a[0] * b[0] + a[1] * b[1]) / (a[2] * b[2]) if abs(a[2] * b[2]) > 1e-12 else -1
            focal = math.sqrt(focal2) if focal2 > 0 else 0.5 / math.tan(math.radians(50) / 2)
            ax = [a[0] / focal, a[1] / focal, a[2]]
            bz = [b[0] / focal, b[1] / focal, b[2]]
            scale = (norm(ax) + norm(bz)) / 2
            rx = unit(ax)
            rz = unit([v - dot(bz, rx) * u for v, u in zip(bz, rx)])
            ry = cross(rx, rz)  # Camera coordinates here have +depth forward.
            translation = [c[0] / focal / scale, c[1] / focal / scale, 1 / scale]
            position = [-dot(column, translation) for column in (rx, ry, rz)]
            up = [rx[1], ry[1], rz[1]]
            forward = [rx[2], ry[2], rz[2]]
            right = [rx[0], ry[0], rz[0]]
            if position[1] <= 0:
                raise ValueError("Camera would be below the floor")
            errors = []
            for x, z in [(-room.width / 2, -room.depth / 2), (room.width / 2, -room.depth / 2),
                         (room.width / 2, room.depth / 2), (-room.width / 2, room.depth / 2)]:
                relative = [x - position[0], -position[1], z - position[2]]
                depth = dot(relative, forward)
                if depth <= 0:
                    raise ValueError("Floor behind camera")
                uv = (0.5 + focal * dot(relative, right) / depth / aspect,
                      0.5 - focal * dot(relative, up) / depth)
                errors.append(math.dist(uv, project(h, x, z)))
            error = max(errors)
            if error > 0.08:
                return {**default, "method": "inconsistent_floor_camera_prior", "floor_reprojection_error": error}
            camera = {"kind": "perspective", "position": position,
                      "target": [p + v * norm(position) for p, v in zip(position, forward)],
                      "up": up, "fov": math.degrees(2 * math.atan(0.5 / focal)),
                      "image_aspect_ratio": aspect,
                      "method": "floor_camera_centered_intrinsics" if focal2 > 0 else "floor_camera_fov_prior",
                      "floor_reprojection_error": error}
        return camera
    except (ValueError, ZeroDivisionError):
        return {**default, "method": "degenerate_floor_camera_prior"}
