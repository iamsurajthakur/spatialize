"""Planar projective mapping, with an explicit pinhole floor prior fallback."""

import math

from .schemas import CanonicalRoom, Point2D, RoomLandmarks


EPSILON = 1e-9


def solve_linear(matrix, values):
    """Pivoted elimination for the eight homography coefficients."""
    rows = [list(row) + [value] for row, value in zip(matrix, values)]
    n = len(values)
    for col in range(n):
        pivot = max(range(col, n), key=lambda i: abs(rows[i][col]))
        if abs(rows[pivot][col]) < EPSILON:
            raise ValueError("Degenerate floor quadrilateral")
        rows[col], rows[pivot] = rows[pivot], rows[col]
        scale = rows[col][col]
        rows[col] = [v / scale for v in rows[col]]
        for i in range(n):
            if i != col:
                factor = rows[i][col]
                rows[i] = [v - factor * p for v, p in zip(rows[i], rows[col])]
    return [row[-1] for row in rows]


def homography(source, target):
    matrix, values = [], []
    for (x, y), (u, v) in zip(source, target):
        matrix.extend(
            [
                [x, y, 1, 0, 0, 0, -u * x, -u * y],
                [0, 0, 0, x, y, 1, -v * x, -v * y],
            ]
        )
        values.extend([u, v])
    return solve_linear(matrix, values) + [1.0]


def project(h, x, y):
    divisor = h[6] * x + h[7] * y + h[8]
    if abs(divisor) < EPSILON:
        raise ValueError("Point lies on the projective horizon")
    return (
        (h[0] * x + h[1] * y + h[2]) / divisor,
        (h[3] * x + h[4] * y + h[5]) / divisor,
    )


def cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])


def valid_quad(points):
    turns = [
        cross(points[i], points[(i + 1) % 4], points[(i + 2) % 4]) for i in range(4)
    ]
    # Clockwise in image coordinates: BL, BR, FR, FL. Reject reversed labels,
    # folded quads and nearly edge-on planes that amplify tiny VLM errors.
    area = (
        abs(
            sum(
                points[i][0] * points[(i + 1) % 4][1]
                - points[(i + 1) % 4][0] * points[i][1]
                for i in range(4)
            )
        )
        / 2
    )
    return all(turn > EPSILON for turn in turns) and area >= 0.01


def closest_in_quad(point, quad):
    if all(cross(quad[i], quad[(i + 1) % 4], point) >= -EPSILON for i in range(4)):
        return point
    candidates = []
    for i, a in enumerate(quad):
        b = quad[(i + 1) % 4]
        dx, dy = b[0] - a[0], b[1] - a[1]
        t = max(
            0,
            min(
                1,
                ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy),
            ),
        )
        candidates.append((a[0] + t * dx, a[1] + t * dy))
    return min(candidates, key=lambda p: math.dist(point, p))


class FloorMapping:
    def __init__(
        self, landmarks: RoomLandmarks | None, room: CanonicalRoom, aspect: float
    ):
        self.room = room
        self.aspect = aspect
        self.method = "pinhole_prior"
        self.confidence = 0.25
        self.reason = "Missing floor corners; assumed centered camera and floor horizon"
        self.image_quad = None
        self.to_image = None
        self.to_floor = None
        completed_corner = None
        if landmarks:
            corners = [
                landmarks.back_left_corner,
                landmarks.back_right_corner,
                landmarks.right_front_floor,
                landmarks.left_front_floor,
            ]
            # Three correspondences determine an affine plane ONLY with an
            # explicit parallel-projection observation. Never assume the missing
            # fourth point of a perspective quadrilateral forms a parallelogram.
            if (
                landmarks.projection_hint == "orthographic"
                and sum(p is not None for p in corners) == 3
            ):
                missing = corners.index(None)
                a, b, opposite = (
                    corners[(missing + 1) % 4],
                    corners[(missing - 1) % 4],
                    corners[(missing + 2) % 4],
                )
                x, y = a.x + b.x - opposite.x, a.y + b.y - opposite.y
                if 0 <= x <= 1 and 0 <= y <= 1:
                    corners[missing] = Point2D(x=x, y=y)
                    completed_corner = missing
            if all(p is not None for p in corners):
                quad = [(p.x, p.y) for p in corners]
                if valid_quad(quad):
                    world = [
                        (-room.width / 2, -room.depth / 2),
                        (room.width / 2, -room.depth / 2),
                        (room.width / 2, room.depth / 2),
                        (-room.width / 2, room.depth / 2),
                    ]
                    try:
                        self.to_floor = homography(quad, world)
                        self.to_image = homography(world, quad)
                        denominators = [
                            self.to_image[6] * x + self.to_image[7] * z + 1
                            for x, z in world
                        ]
                        if min(denominators) <= EPSILON:
                            raise ValueError("Horizon crosses floor patch")
                        self.image_quad = quad
                        self.method = (
                            "floor_homography"
                            if completed_corner is None
                            else "affine_three_corners"
                        )
                        self.confidence = (
                            landmarks.confidence
                            if completed_corner is None
                            else min(landmarks.confidence, 0.5)
                        )
                        self.reason = (
                            None
                            if completed_corner is None
                            else "One floor corner inferred using explicit orthographic projection hint"
                        )
                        return
                    except ValueError as error:
                        self.reason = str(error)
                else:
                    self.reason = (
                        "Invalid, reversed or nearly degenerate floor quadrilateral"
                    )
                self.to_floor = self.to_image = None

        # Level pinhole geometry: distance = focal_length * eye_height / (v-horizon).
        # FOV and eye height below are declared camera priors, not measurements.
        self.focal = 0.5 / math.tan(math.radians(50) / 2)
        self.eye_height = room.height / 2
        self.back_y = 0.4
        self.back_edge_slope = 0.0
        self.back_center = 0.5
        self.back_span = None
        if landmarks and landmarks.back_left_corner and landmarks.back_right_corner:
            left, right = landmarks.back_left_corner, landmarks.back_right_corner
            if right.x - left.x > 0.05:
                self.back_center = (left.x + right.x) / 2
                self.back_y = (left.y + right.y) / 2
                self.back_span = right.x - left.x
                self.back_edge_slope = (right.y - left.y) / self.back_span
                self.method = "back_edge_pinhole_prior"
                self.confidence = min(landmarks.confidence, 0.4)
                self.reason = "Incomplete floor; back edge observed, camera height and near extent assumed"
        # Fit the floor interval [back edge, image bottom] to one canonical depth
        # using the reciprocal pinhole equation, rather than saturating the lower
        # half of the image at an arbitrary near distance.
        delta = max(1 - self.back_y, EPSILON)
        k = self.focal * self.eye_height
        t = (math.sqrt(delta * delta + 4 * k * delta / room.depth) - delta) / 2
        self.horizon = self.back_y - t
        self.back_distance = k / t
        if self.back_span is None:
            self.back_span = self.focal * room.width / (self.back_distance * aspect)

    def map(self, point: Point2D):
        if self.to_floor:
            used = closest_in_quad((point.x, point.y), self.image_quad)
            x, z = project(self.to_floor, *used)
            clipped = math.dist(used, (point.x, point.y)) > EPSILON
        else:
            v = point.y - self.back_edge_slope * (point.x - self.back_center)
            distance = self.focal * self.eye_height / max(v - self.horizon, EPSILON)
            bounded_distance = max(
                self.back_distance - self.room.depth, min(self.back_distance, distance)
            )
            z = self.room.depth / 2 - (
                bounded_distance - (self.back_distance - self.room.depth)
            )
            span = self.back_span * self.back_distance / bounded_distance
            x = (point.x - self.back_center) * self.room.width / span
            clipped = (
                abs(distance - bounded_distance) > EPSILON
                or abs(x) > self.room.width / 2
            )
            x = max(-self.room.width / 2, min(self.room.width / 2, x))
            used = (point.x, point.y)
        return (
            x,
            z,
            {
                "method": self.method,
                "confidence": self.confidence * (0.5 if clipped else 1),
                "point_used": {"x": used[0], "y": used[1]},
                "clipped_to_floor": clipped,
            },
        )

    def debug(self):
        return {
            "method": self.method,
            "confidence": self.confidence,
            "fallback_reason": self.reason,
            "image_quad": self.image_quad,
            "floor_to_image": self.to_image,
            "image_to_floor": self.to_floor,
        }
