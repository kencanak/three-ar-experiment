// we are inserting threejs via bower components
// otherwise there will be some issue if we import threejs library
// import * as THREE from 'three';

import * as threeARJs from 'three.ar.js';

class ARReticle {
  constructor(vrDisplay, scene, reticleProps) {
    this._reticleProps = {
      innerRadius: 0.03,
      outerRadius: 0.04,
      color: 0xff9800,
      easing: .25
    };

    // merge reticle props
    this._reticleProps = { ...this._reticleProps, ...reticleProps };

    this._vrDisplay = vrDisplay;
    this._scene = scene;
    this._reticle = null;
  }

  init() {
    // Create our ARReticle, which will continuously fire `hitTest` to trace
    // the detected surfaces
    this._reticle = new THREE.ARReticle(this._vrDisplay,
      this._reticleProps.innerRadius,
      this._reticleProps.outerRadius,
      this._reticleProps.color,
      this._reticleProps.easing
    );

    this._scene.add(this._reticle);
  }

  remove() {
    this._scene.remove(this._reticle);
    this._reticle = null;
  }

  render() {
    if (this._reticle) {
      // Update our ARReticle's position, and provide normalized
      // screen coordinates to send the hit test -- in this case, (0.5, 0.5)
      // is the middle of our screen
      this._reticle.update(0.5, 0.5);
    }
  }
}

export default ARReticle;