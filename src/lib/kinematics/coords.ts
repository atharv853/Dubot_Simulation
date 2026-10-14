/**
 * Coordinate conversions between Dobot Robot Frame and Three.js World Frame
 *
 * Robot Frame (mm):
 *  +X: Forward
 *  +Y: Left
 *  +Z: Up (Height above table)
 *
 * Three.js World Frame (mm):
 *  +X: Right (-Y_robot)
 *  +Y: Up (+Z_robot)
 *  +Z: Forward (+X_robot)
 */

export function robotToWorld(rx: number, ry: number, rz: number): [number, number, number] {
  return [-ry, rz, rx];
}

export function worldToRobot(wx: number, wy: number, wz: number): [number, number, number] {
  return [wz, -wx, wy];
}
