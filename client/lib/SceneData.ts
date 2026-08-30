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
    "room_size_hint": {
        "width": 10,
        "height": 4,
        "depth": 8,
    },

    "objects": [

        {
            "id": "bed-1",
            "type": "bed",
            "x": -2.5,
            "y": 0.45,
            "z": -2.5,
            "width": 3.2,
            "height": 0.9,
            "depth": 5,
        },

        {
            "id": "pillow-1",
            "type": "pillow",
            "x": -2.5,
            "y": 1.05,
            "z": -4,
            "width": 2.5,
            "height": 0.25,
            "depth": 0.7,
        },

 
        {
            "id": "bedside-table-1",
            "type": "table",
            "x": 0,
            "y": 0.45,
            "z": -3.2,
            "width": 0.8,
            "height": 0.9,
            "depth": 0.8,
        },

        {
            "id": "lamp-1",
            "type": "lamp",
            "x": 0,
            "y": 1.4,
            "z": -3.2,
            "width": 0.3,
            "height": 0.7,
            "depth": 0.3,
        },


        {
            "id": "desk-1",
            "type": "desk",
            "x": 2.8,
            "y": 0.8,
            "z": -2.8,
            "width": 2.5,
            "height": 1.6,
            "depth": 1,
        },


        {
            "id": "chair-1",
            "type": "chair",
            "x": 2.8,
            "y": 0.8,
            "z": -1.3,
            "width": 1.2,
            "height": 1.5,
            "depth": 1.2,
        },


        {
            "id": "monitor-1",
            "type": "monitor",
            "x": 2.8,
            "y": 1.8,
            "z": -2.8,
            "width": 1.2,
            "height": 0.8,
            "depth": 0.15,
        },

        {
            "id": "laptop-1",
            "type": "laptop",
            "x": 3.5,
            "y": 1.65,
            "z": -2.8,
            "width": 0.8,
            "height": 0.1,
            "depth": 0.6,
        },


        {
            "id": "wardrobe-1",
            "type": "wardrobe",
            "x": 4,
            "y": 1.5,
            "z": 2.5,
            "width": 1.8,
            "height": 3,
            "depth": 1,
        },

        {
            "id": "rug-1",
            "type": "rug",
            "x": 0.5,
            "y": 0.03,
            "z": 1,
            "width": 4,
            "height": 0.05,
            "depth": 2.5,
        },


        {
            "id": "window-1",
            "type": "window",
            "x": -1,
            "y": 2.5,
            "z": -3.95,
            "width": 3,
            "height": 2,
            "depth": 0.15,
        },


        {
            "id": "door-1",
            "type": "door",
            "x": 4.85,
            "y": 1.5,
            "z": -1,
            "width": 0.1,
            "height": 3,
            "depth": 1.8,
        },


        {
            "id": "ceiling-light-1",
            "type": "ceiling_light",
            "x": 0,
            "y": 3.8,
            "z": 0,
            "width": 0.8,
            "height": 0.2,
            "depth": 0.8,
        },

        {
            "id": "painting-1",
            "type": "painting",
            "x": -4.9,
            "y": 2.2,
            "z": 0,
            "width": 0.15,
            "height": 1.5,
            "depth": 2,
        },

        {
            "id": "plant-1",
            "type": "plant",
            "x": 3.8,
            "y": 0.8,
            "z": 0,
            "width": 0.7,
            "height": 1.5,
            "depth": 0.7,
        },


        {
            "id": "book-1",
            "type": "book",
            "x": 2.5,
            "y": 1.65,
            "z": -2.7,
            "width": 0.4,
            "height": 0.08,
            "depth": 0.6,
        },
    ],
};