"""Image anchors first, exact attachment second, bounded semantic/collision edits.

+X right, +Y up, +Z toward the front. Origin is the floor center. Object
positions are bounding-box centers; dimensions are LOCAL, before Y rotation.
"""

import math

from .floor_mapping import FloorMapping, project
from .schemas import CanonicalRoom, SceneData, SceneGeometryInput, SceneObject


DEFAULT_SIZES = {
    "table": (1.5, 0.75, 0.8),
    "chair": (0.5, 0.9, 0.5),
    "sofa": (2.0, 0.8, 0.9),
    "bed": (1.6, 0.9, 2.0),
    "plant": (0.4, 1.2, 0.4),
    "desk": (1.2, 0.75, 0.6),
    "cabinet": (0.8, 1.8, 0.4),
    "lamp": (0.3, 1.5, 0.3),
    "tv": (1.0, 0.6, 0.1),
    "generic": (0.5, 0.5, 0.5),
}

CANONICAL_ROOM = CanonicalRoom(width=5.0, height=3.0, depth=5.0)

WALLS = {
    "back_wall": ("z", -1, 0),
    "front_wall": ("z", 1, 180),
    "left_wall": ("x", -1, 90),
    "right_wall": ("x", 1, -90),
}

EPSILON = 1e-7

# Explicit maximum displacement policies in fractions of room span. These are
# trust-region limits, not per-object positioning offsets. Unresolved conflicts
# are reported instead of repeatedly pushing furniture across the room.
SEMANTIC_MAX_FRACTION = 0.08
COLLISION_MAX_FRACTION = 0.10


def footprint(obj):
    angle = math.radians(obj.rotation_y)
    c, s = abs(math.cos(angle)), abs(math.sin(angle))
    return (c * obj.width + s * obj.depth) / 2, (s * obj.width + c * obj.depth) / 2


def position(obj):
    return {"x": obj.x, "y": obj.y, "z": obj.z}


def clamp_to_room(obj, room):
    hx, hz = footprint(obj)
    obj.x = max(-room.width / 2 + hx, min(room.width / 2 - hx, obj.x))
    obj.z = max(-room.depth / 2 + hz, min(room.depth / 2 - hz, obj.z))
    obj.y = max(obj.height / 2, min(room.height - obj.height / 2, obj.y))


def wall_for(item):
    if item.wall_relation and item.wall_relation.target in WALLS:
        return item.wall_relation.target, item.wall_relation.type
    for relation in item.relations:
        if relation.target in WALLS and relation.type in {
            "against",
            "against_wall",
            "near",
            "centered_on_wall",
        }:
            return (
                relation.target,
                "centered_on" if relation.type == "centered_on_wall" else relation.type,
            )
    return None


def attach_wall(obj, wall, room):
    axis, sign, _ = WALLS[wall]
    half_extent = footprint(obj)[0 if axis == "x" else 1]
    size = room.width if axis == "x" else room.depth
    setattr(obj, axis, sign * (size / 2 - half_extent))


def bounded_move(obj, dx, dz, anchor, budget, lock, room):
    if lock == "x":
        dx = 0
    if lock == "z":
        dz = 0
    x, z = obj.x + dx, obj.z + dz
    offset_x, offset_z = x - anchor[0], z - anchor[1]
    distance = math.hypot(offset_x, offset_z)
    if distance > budget:
        x = anchor[0] + offset_x * budget / distance
        z = anchor[1] + offset_z * budget / distance
    obj.x, obj.z = x, z
    clamp_to_room(obj, room)


def preserve_order(obj, objects, anchors):
    """Do not cross another image-derived anchor's current ordering on either axis."""
    for other in objects.values():
        if other.id == obj.id:
            continue
        for index, axis in enumerate(("x", "z")):
            difference = anchors[obj.id][index] - anchors[other.id][index]
            value, other_value = getattr(obj, axis), getattr(other, axis)
            if difference > EPSILON:
                setattr(obj, axis, max(value, other_value))
            elif difference < -EPSILON:
                setattr(obj, axis, min(value, other_value))


def overlap(a, b):
    if abs(a.y - b.y) >= (a.height + b.height) / 2 - EPSILON:
        return None
    ax, az = footprint(a)
    bx, bz = footprint(b)
    px, pz = ax + bx - abs(a.x - b.x), az + bz - abs(a.z - b.z)
    return (px, pz) if min(px, pz) > EPSILON else None


def resolve_collisions(objects, inputs, locks, anchors, room, debug):
    budget = min(room.width, room.depth) * COLLISION_MAX_FRACTION
    floor_objects = {
        id: obj for id, obj in objects.items() if inputs[id].support not in objects
    }
    # Furniture dimensions are priors. Prefer a small residual intersection to
    # inventing a radically different layout to accommodate those priors.
    for _ in range(8):
        changed = False
        for i, a in enumerate(floor_objects.values()):
            for b in list(floor_objects.values())[i + 1 :]:
                penetration = overlap(a, b)
                if penetration is None:
                    continue
                candidates = []
                for axis_index, axis in enumerate(("x", "z")):
                    amount = penetration[axis_index]
                    sign = 1 if getattr(a, axis) > getattr(b, axis) else -1
                    if abs(getattr(a, axis) - getattr(b, axis)) < EPSILON:
                        sign = (
                            1
                            if anchors[a.id][axis_index] > anchors[b.id][axis_index]
                            else -1
                        )
                    mobile = [o for o in (a, b) if locks[o.id] != axis]
                    if not mobile:
                        continue
                    trial_a, trial_b = a.model_copy(), b.model_copy()
                    # Try both balanced separation and one-sided separation when
                    # the room boundary or a wall prevents one object from moving.
                    shares = (
                        [(0.5, 0.5), (1, 0), (0, 1)]
                        if len(mobile) == 2
                        else [(1, 0) if mobile[0] is a else (0, 1)]
                    )
                    for share_a, share_b in shares:
                        trial_a, trial_b = a.model_copy(), b.model_copy()
                        for trial, share, direction in (
                            (trial_a, share_a, sign),
                            (trial_b, share_b, -sign),
                        ):
                            delta = amount * share * direction
                            bounded_move(
                                trial,
                                delta if axis == "x" else 0,
                                delta if axis == "z" else 0,
                                anchors[trial.id],
                                budget,
                                locks[trial.id],
                                room,
                            )
                            preserve_order(trial, floor_objects, anchors)
                        residual = overlap(trial_a, trial_b)
                        score = min(residual) if residual else 0
                        movement = math.hypot(
                            trial_a.x - a.x, trial_a.z - a.z
                        ) + math.hypot(trial_b.x - b.x, trial_b.z - b.z)
                        candidates.append((score, movement, trial_a, trial_b))
                if not candidates:
                    continue
                score, movement, next_a, next_b = min(
                    candidates, key=lambda c: (c[0], c[1])
                )
                if score >= min(penetration) - EPSILON or movement < EPSILON:
                    continue
                for obj, trial, other in ((a, next_a, b), (b, next_b, a)):
                    if math.hypot(obj.x - trial.x, obj.z - trial.z) > EPSILON:
                        before = position(obj)
                        obj.x, obj.z = trial.x, trial.z
                        debug[obj.id]["collision_corrections"].append(
                            {
                                "other": other.id,
                                "before": before,
                                "after": position(obj),
                            }
                        )
                        changed = True
        if not changed:
            break
    for i, a in enumerate(floor_objects.values()):
        for b in list(floor_objects.values())[i + 1 :]:
            if overlap(a, b):
                for obj, other in ((a, b), (b, a)):
                    debug[obj.id]["warnings"].append(
                        f"Unresolved overlap with {other.id}; attachment/order/displacement limits retained"
                    )


def place_supports(objects, inputs, debug, room):
    done, active = set(), set()

    def visit(obj_id):
        if obj_id in done:
            return True
        if obj_id in active:
            return False
        active.add(obj_id)
        item, obj = inputs[obj_id], objects[obj_id]
        target = objects.get(item.support)
        if target:
            if visit(target.id):
                before = position(obj)
                hx, hz = footprint(target)
                ox, oz = footprint(obj)
                if item.floor_contact:
                    obj.x = max(
                        target.x - max(0, hx - ox),
                        min(target.x + max(0, hx - ox), obj.x),
                    )
                    obj.z = max(
                        target.z - max(0, hz - oz),
                        min(target.z + max(0, hz - oz), obj.z),
                    )
                else:
                    # Elevated bbox bottoms are not on the floor. Without an
                    # explicit floor projection, the support center is safer.
                    obj.x, obj.z = target.x, target.z
                obj.y = target.y + target.height / 2 + obj.height / 2
                clamp_to_room(obj, room)
                debug[obj_id]["constraints"].append(
                    {
                        "type": "support",
                        "target": target.id,
                        "method": "projected_floor_contact"
                        if item.floor_contact
                        else "support_center_prior",
                        "before": before,
                        "after": position(obj),
                    }
                )
                if obj.y < target.y + target.height / 2 + obj.height / 2 - EPSILON:
                    debug[obj_id]["warnings"].append(
                        "Support stack exceeds canonical ceiling"
                    )
                if ox > hx or oz > hz:
                    debug[obj_id]["warnings"].append(
                        "Canonical object footprint exceeds support"
                    )
            else:
                debug[obj_id]["warnings"].append(
                    "Cyclic support; retained floor placement"
                )
                active.remove(obj_id)
                done.add(obj_id)
                return False
        elif item.support != "floor":
            debug[obj_id]["warnings"].append(
                f"Unknown support {item.support}; retained floor placement"
            )
        active.remove(obj_id)
        done.add(obj_id)
        return True

    for obj_id in objects:
        visit(obj_id)


def compute_geometry(input_data: SceneGeometryInput) -> SceneData:
    room = CANONICAL_ROOM
    mapping = FloorMapping(
        input_data.room_landmarks, room, input_data.image_aspect_ratio
    )
    inputs = {
        item.id: item for item in sorted(input_data.objects, key=lambda item: item.id)
    }
    objects, debug, locks, walls = {}, {}, {}, {}
    for item in inputs.values():
        bbox_bottom = item.bbox.bottom_center()
        contact = item.floor_contact or bbox_bottom
        x, z, evidence = mapping.map(contact)
        w, h, d = DEFAULT_SIZES[item.type]
        if item.support in inputs and item.type in {"lamp", "plant"}:
            w, h, d = (
                0.25,
                0.5,
                0.25,
            )  # Semantic tabletop role, not bbox-to-size conversion.
        wall = wall_for(item)
        rotation = {f"parallel_to_{name}": spec[2] for name, spec in WALLS.items()}.get(
            item.orientation, 0
        )
        if wall and wall[1] != "near":
            rotation = WALLS[wall[0]][2]
        obj = SceneObject(
            id=item.id,
            type=item.type,
            x=x,
            y=h / 2,
            z=z,
            rotation_y=rotation,
            width=w,
            height=h,
            depth=d,
        )
        wall_conflict = False
        requested_wall = wall
        if (
            wall
            and wall[1] != "near"
            and mapping.to_floor
            and not evidence["clipped_to_floor"]
        ):
            candidate = obj.model_copy()
            attach_wall(candidate, wall[0], room)
            axis = WALLS[wall[0]][0]
            span = room.width if axis == "x" else room.depth
            # An attachment that crosses more than half the room is incompatible
            # with the observed floor anchor. Do not guess a replacement wall.
            if abs(getattr(candidate, axis) - getattr(obj, axis)) > span / 2:
                wall_conflict = True
                wall = None
        objects[item.id] = obj
        walls[item.id] = wall
        locks[item.id] = WALLS[wall[0]][0] if wall and wall[1] != "near" else None
        debug[item.id] = {
            "bbox_normalized": item.bbox.model_dump(),
            "bbox_bottom_center": bbox_bottom.model_dump(),
            "floor_contact": contact.model_dump(),
            "contact_method": "footprint_center"
            if item.floor_contact
            else "bbox_bottom_proxy",
            "inferred_floor_position": {"x": x, "z": z},
            "initial_canonical_position": position(obj),
            "mapping": evidence,
            "confidence": item.confidence
            * evidence["confidence"]
            * (1 if item.floor_contact else 0.6),
            "size_method": "semantic_canonical_prior",
            "wall_selected": wall[0] if wall else None,
            "wall_requested": requested_wall[0] if requested_wall else None,
            "constraints": [],
            "collision_corrections": [],
            "warnings": [],
        }
        if wall_conflict:
            debug[item.id]["warnings"].append(
                "Rejected wall attachment across more than half the room; floor evidence retained, wall label needs review"
            )
        if not item.floor_contact:
            debug[item.id]["warnings"].append(
                "BBox bottom is only a footprint proxy; occlusion and nearest edge can bias depth"
            )
        if item.bbox.y_max == 1 and not item.floor_contact:
            debug[item.id]["warnings"].append(
                "Object cropped at image bottom; floor contact uncertain"
            )

    # Resolve attachment targets on a snapshot so facing does not depend on
    # whether its target ID happened to be processed before or after this ID.
    orientation_targets = {id: obj.model_copy() for id, obj in objects.items()}
    for id, target in orientation_targets.items():
        if locks[id]:
            attach_wall(target, walls[id][0], room)
        clamp_to_room(target, room)
    # Facing changes orientation only. Resolve before footprint bounds/walls.
    for item in inputs.values():
        obj = objects[item.id]
        for relation in item.relations:
            if relation.type == "facing" and relation.target in objects:
                target = orientation_targets[relation.target]
                if not locks[obj.id]:
                    obj.rotation_y = math.degrees(
                        math.atan2(target.x - obj.x, target.z - obj.z)
                    )
                debug[obj.id]["constraints"].append(
                    {
                        "type": "facing",
                        "target": target.id,
                        "rotation_y": obj.rotation_y,
                        "status": "wall_orientation_retained"
                        if locks[obj.id]
                        else "orientation_only",
                    }
                )
        before = position(obj)
        if locks[obj.id]:
            attach_wall(obj, walls[obj.id][0], room)
        debug[obj.id]["before_wall_constraint"] = before
        debug[obj.id]["after_wall_constraint"] = position(obj)
        if locks[obj.id]:
            debug[obj.id]["constraints"].append(
                {
                    "type": "wall_attachment",
                    "target": walls[obj.id][0],
                    "axis": locks[obj.id],
                    "before": before,
                    "after": position(obj),
                }
            )
            if (
                math.hypot(obj.x - before["x"], obj.z - before["z"])
                > min(room.width, room.depth) / 4
            ):
                debug[obj.id]["warnings"].append(
                    "Wall attachment disagrees strongly with floor anchor; verify wall label/contact"
                )
        before_bounds = position(obj)
        clamp_to_room(obj, room)
        debug[obj.id]["bounds_correction"] = {
            "before": before_bounds,
            "after": position(obj),
        }

    anchors = {key: (obj.x, obj.z) for key, obj in objects.items()}
    snapshot = {key: obj.model_copy() for key, obj in objects.items()}
    floor_snapshot = {
        id: obj for id, obj in snapshot.items() if inputs[id].support not in objects
    }
    for item in inputs.values():
        obj = objects[item.id]
        proposals = []
        wall = walls[obj.id]
        if wall and wall[1] in {"near", "centered_on"}:
            candidate = obj.model_copy()
            if wall[1] == "near":
                attach_wall(candidate, wall[0], room)
            else:
                setattr(candidate, "z" if WALLS[wall[0]][0] == "x" else "x", 0)
            proposals.append((candidate.x - obj.x, candidate.z - obj.z))
            debug[obj.id]["constraints"].append(
                {
                    "type": wall[1],
                    "target": wall[0],
                    "requested_delta": {
                        "x": candidate.x - obj.x,
                        "z": candidate.z - obj.z,
                    },
                    "status": "soft_request",
                }
            )
        for relation in item.relations:
            if relation.target in WALLS or relation.type == "facing":
                continue
            target = snapshot.get(relation.target)
            if target is None or target.id == obj.id:
                debug[obj.id]["warnings"].append(
                    f"Ignored relation to missing/self target {relation.target}"
                )
                continue
            dx = dz = 0.0
            hx, hz = footprint(obj)
            tx, tz = footprint(target)
            # Directional relations are inequalities. Satisfied relations do not
            # align the unrelated axis or increase separation to fit guessed sizes.
            if relation.type == "left_of" and obj.x > target.x:
                dx = target.x - obj.x
            elif relation.type == "right_of" and obj.x < target.x:
                dx = target.x - obj.x
            elif relation.type == "in_front_of" and obj.z < target.z:
                dz = target.z - obj.z
            elif relation.type == "behind" and obj.z > target.z:
                dz = target.z - obj.z
            elif relation.type in {"near", "beside", "against", "against_wall"}:
                vx, vz = target.x - obj.x, target.z - obj.z
                distance = math.hypot(vx, vz)
                preferred = math.hypot(hx + tx, hz + tz)
                if distance > preferred:
                    dx, dz = (
                        vx * (1 - preferred / distance),
                        vz * (1 - preferred / distance),
                    )
            proposals.append((dx, dz))
            debug[obj.id]["constraints"].append(
                {
                    "type": relation.type,
                    "target": target.id,
                    "requested_delta": {"x": dx, "z": dz},
                    "status": "satisfied" if dx == dz == 0 else "soft_request",
                }
            )
        before = position(obj)
        confidence = debug[obj.id]["confidence"]
        budget = min(room.width, room.depth) * SEMANTIC_MAX_FRACTION * (1 - confidence)
        if proposals and item.support not in objects:
            dx = sum(p[0] for p in proposals) / len(proposals)
            dz = sum(p[1] for p in proposals) / len(proposals)
            bounded_move(obj, dx, dz, anchors[obj.id], budget, locks[obj.id], room)
            preserve_order(obj, floor_snapshot, anchors)
        debug[obj.id]["semantic_correction"] = {
            "before": before,
            "after": position(obj),
            "max_displacement": budget,
        }

    collision_anchors = {key: (obj.x, obj.z) for key, obj in objects.items()}
    resolve_collisions(objects, inputs, locks, collision_anchors, room, debug)
    place_supports(objects, inputs, debug, room)
    for obj in objects.values():
        debug[obj.id]["final_position"] = position(obj)
        debug[obj.id]["collision_max_displacement"] = (
            min(room.width, room.depth) * COLLISION_MAX_FRACTION
        )
        if mapping.to_image:
            u, v = project(mapping.to_image, obj.x, obj.z)
            debug[obj.id]["reprojected_floor_contact"] = {"x": u, "y": v}
            contact = debug[obj.id]["floor_contact"]
            debug[obj.id]["floor_reprojection_error"] = math.hypot(
                u - contact["x"], v - contact["y"]
            )

    from .camera_geometry import camera_from_floor

    return SceneData(
        canonical_room=room,
        objects=list(objects.values()),
        camera=camera_from_floor(mapping),
        debug_info={
            "geometry_version": 2,
            "floor_mapping": mapping.debug(),
            "input": input_data.model_dump(),
            "objects": debug,
        },
    )
