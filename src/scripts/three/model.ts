import * as THREE from 'three';
import type { CarId } from '../../data/cars';
import type { EngineRig } from './components';
import { Part, type MatKey } from './kit';

export interface CarModel {
  id: CarId;
  root: THREE.Group;
  parts: Part[];
  groupOffsets: Record<string, THREE.Vector3>;
  engine: EngineRig;
  gearbox: { inSpin: THREE.Object3D; outSpin: THREE.Object3D; ratios: number[] };
  wheels: { spin: THREE.Object3D; radius: number }[];
  motors: THREE.Object3D[];
  /** 0..1 aero actuator (DRS flap / active wing) */
  setAero(t: number): void;
  lib: Record<MatKey, THREE.Material>;
}

export function assemble(
  id: CarId,
  lib: Record<MatKey, THREE.Material>,
  parts: Part[],
  groupOffsets: Record<string, [number, number, number]>,
  rest: Omit<CarModel, 'id' | 'root' | 'parts' | 'groupOffsets' | 'lib'>,
): CarModel {
  const root = new THREE.Group();
  root.name = id;
  for (const p of parts) root.add(p.root);
  const go: Record<string, THREE.Vector3> = {};
  for (const [k, v] of Object.entries(groupOffsets)) go[k] = new THREE.Vector3(...v);
  return { id, root, parts, groupOffsets: go, lib, ...rest };
}
