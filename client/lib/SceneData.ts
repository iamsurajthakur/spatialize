export const COORDINATE_CONVENTION = "floor_center_y_up_positive_z_front_v1";

export type RoomDimensions = { width: number; height: number; depth: number };
export type Position = { x: number; y: number; z: number };
export type ImagePoint = { x: number; y: number };

export type SceneObject = Position & RoomDimensions & {
  id: string;
  type: string;
  rotation_y?: number; // Degrees, local front +Z; absent in legacy saved scenes.
};

export type SceneCamera = {
  kind: "perspective" | "orthographic";
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fov?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  image_aspect_ratio: number;
  method: string;
  floor_reprojection_error: number | null;
};

export type ObjectDebug = {
  bbox_normalized: { x_min: number; x_max: number; y_min: number; y_max: number };
  bbox_bottom_center: ImagePoint;
  floor_contact: ImagePoint;
  reprojected_floor_contact?: ImagePoint;
  initial_canonical_position: Position;
  final_position: Position;
  confidence: number;
  contact_method: string;
  wall_selected: string | null;
  warnings: string[];
  [key: string]: unknown;
};

export type SceneData = {
  canonical_room?: RoomDimensions;
  /** Read-only compatibility with saved scenes created before geometry v2. */
  room_size_hint?: RoomDimensions;
  coordinate_convention?: typeof COORDINATE_CONVENTION;
  objects: SceneObject[];
  camera?: SceneCamera | null;
  debug_info?: {
    geometry_version: number;
    floor_mapping: { method: string; image_quad: [number, number][] | null; fallback_reason: string | null };
    objects: Record<string, ObjectDebug>;
  };
};

export function roomDimensions(data: SceneData): RoomDimensions {
  const room = data.canonical_room ?? data.room_size_hint;
  if (!room) throw new Error("Scene has no canonical room dimensions");
  if (data.coordinate_convention && data.coordinate_convention !== COORDINATE_CONVENTION) {
    throw new Error("Unsupported scene coordinate convention");
  }
  return room;
}
