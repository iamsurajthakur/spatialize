export type SceneObject = {
    id: string;
    type: string;
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    depth: number;
};

export type SceneData = {
    room_size_hint: {
        width: number;
        height: number;
        depth: number;
    };

    objects: SceneObject[];
};

export const sceneData: SceneData = {
    room_size_hint: {
        width: 10,
        height: 4,
        depth: 8,
    },

    objects: [
        {
            id: "table-1",
            type: "table",
            x: 0,
            y: 0.5,
            z: 0,
            width: 3,
            height: 1,
            depth: 1.5,
        },
        {
            id: "chair-1",
            type: "chair",
            x: 3,
            y: 0.75,
            z: 1.5,
            width: 1.2,
            height: 1.5,
            depth: 1.2,
        },
    ],
};