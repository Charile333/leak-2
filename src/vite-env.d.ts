/// <reference types="vite/client" />

declare module '*.glb' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module 'meshline' {
  export const MeshLineGeometry: any;
  export const MeshLineMaterial: any;
}

import { Object3DNode } from '@react-three/fiber';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      meshLineGeometry: Object3DNode<any, typeof import('meshline').MeshLineGeometry>;
      meshLineMaterial: Object3DNode<any, typeof import('meshline').MeshLineMaterial>;
    }
  }
}
