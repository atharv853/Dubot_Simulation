export interface ObjectDimension {
  width: number;  // mm (X dimension when unrotated)
  depth: number;  // mm (Y dimension when unrotated)
  height: number; // mm (Z dimension)
}

export interface RegisteredObjectDef {
  typeId: string;
  name: string;
  category: string;
  dimensions: ObjectDimension;
  color: string;
  description: string;
  // Offset from base (table contact) to top-center pickup point
  topSurfaceZOffset: number;
}

export interface PlacedObjectInstance {
  id: string;
  typeId: string;
  name: string;
  // Position in robot frame (mm): [X, Y, Z] where Z is the bottom contact point
  position: [number, number, number];
  rotationY: number; // Yaw angle in radians (around Z in robot frame, Three.js Y)
  attachedToTool: boolean;
  attachedRelativeOffset?: [number, number, number]; // [dx, dy, dz] relative to tool tip
}

export const OBJECT_REGISTRY: Record<string, RegisteredObjectDef> = {
  box: {
    typeId: 'box',
    name: 'Cube Block',
    category: 'Workpiece',
    dimensions: {
      width: 35,
      depth: 35,
      height: 35,
    },
    color: '#e67e22', // Industrial orange/wood
    description: '35mm cubic workpiece for pick-and-place tasks',
    topSurfaceZOffset: 35,
  },
  scale: {
    typeId: 'scale',
    name: 'Weighing Scale',
    category: 'Station',
    dimensions: {
      width: 70,
      depth: 70,
      height: 18,
    },
    color: '#34495e', // Slate metallic
    description: 'Precision scale platform with digital readout display',
    topSurfaceZOffset: 18,
  },
};
