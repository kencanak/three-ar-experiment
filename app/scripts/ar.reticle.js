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
    const geom = new THREE.RingGeometry(this._reticleProps.innerRadius, this._reticleProps.outerRadius, 36, 64);
    const material = new THREE.MeshBasicMaterial({
      color: this._reticleProps.color
    });

    // Orient the geometry so it's position is flat on a horizontal surface
    geom.applyMatrix(new THREE.Matrix4().makeRotationX(THREE.Math.degToRad(-90)));

    this._reticle = new THREE.Mesh(geom, material);

    // set some where far away
    this._reticle.position.set(10000, 10000, 10000);

    this._scene.add(this._reticle);
  }

  hide() {
    this._reticle.visible = false;
  }

  show() {
    this._reticle.visible = true;
  }

  remove() {
    this._scene.remove(this._reticle);
    this._reticle = null;
  }

  render() {
    if (this._reticle && this._reticle.visible) {
      // Update our ARReticle's position, and provide normalized
      // screen coordinates to send the hit test -- in this case, (0.5, 0.5)
      // is the middle of our screen
      if (!this._vrDisplay || !this._vrDisplay.hitTest) {
        return;
      }

      const hit = this._vrDisplay.hitTest(0.5, 0.5);
      if (hit && hit.length > 0) {
        THREE.ARUtils.placeObjectAtHit(this._reticle, hit[0], true, this._reticleProps.easing);
      }
    }
  }
}

export default ARReticle;