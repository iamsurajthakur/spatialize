import type { ManualTransform, RoomDimensions, SceneObject } from "./SceneData";

export function generatedTransform(object: SceneObject): ManualTransform {
  return { x: object.x, z: object.z, rotation_y: object.rotation_y ?? 0 };
}

// Dimensions describe the local box, before Y rotation, just as in clamp_to_room().
// An orientation too large to fit is rejected; furniture is never scaled to fit.
export function clampTransform(
  object: SceneObject,
  room: RoomDimensions,
  transform: ManualTransform,
): ManualTransform | null {
  if (!Object.values(transform).every(Number.isFinite)) return null;
  const rotation_y = ((transform.rotation_y % 360) + 360) % 360;
  const angle = (rotation_y * Math.PI) / 180;
  const c = Math.abs(Math.cos(angle)),
    s = Math.abs(Math.sin(angle));
  const maxX = room.width / 2 - (c * object.width + s * object.depth) / 2;
  const maxZ = room.depth / 2 - (s * object.width + c * object.depth) / 2;
  if (maxX < -1e-7 || maxZ < -1e-7) return null;
  const xLimit = Math.max(0, maxX),
    zLimit = Math.max(0, maxZ);
  return {
    x: Math.max(-xLimit, Math.min(xLimit, transform.x)),
    z: Math.max(-zLimit, Math.min(zLimit, transform.z)),
    rotation_y,
  };
}
