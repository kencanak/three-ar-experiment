// we are inserting threejs via bower components
// otherwise there will be some issue if we import threejs library
// import * as THREE from 'three';

import * as threeARJs from 'three.ar.js';

const EventEmitter = require('events');

class ARBase {
  constructor(debugOpt, wrapper) {
    this._debugOpt = {
      showPoseStatus: true,
      showLastHit: true,
      showPlanes: false,
      disable: false
    };

    // canvas wrapper - DOM elem
    this._wrapper = wrapper || document.body;

    // merge debug option
    this._debugOpt = { ...this._debugOpt, ...debugOpt };

    this._canvas = null;

    // AR related
    this.vrFrameData = null;
    this.vrDisplay = null;
    this._vrControls = null;
    this._arView = null;
    this._reticle = null;

    // three js related
    this.scene = null;
    this.camera = null;
    this._renderer = null;

    // events emitter
    this.events = new EventEmitter();

    /**
     * Use the `getARDisplay()` utility to leverage the WebVR API
     * to see if there are any AR-capable WebVR VRDisplays. Returns
     * a valid display if found. Otherwise, display the unsupported
     * browser message.
     */
    THREE.ARUtils.getARDisplay().then((display) => {
      if (display) {
        this.vrFrameData = new VRFrameData();
        this.vrDisplay = display;

        this.init();
      } else {
        THREE.ARUtils.displayUnsupportedMessage();
      }
    });
  }

  init() {
    // setting up scene
    this.scene = new THREE.Scene();

    // setting up AR debugging mode
    if (!this._debugOpt.disable) {
      const arDebug = new THREE.ARDebug(this.vrDisplay, this.scene, this._debugOpt);

      this._wrapper.appendChild(arDebug.getElement());
    }

    // setting up webGL renderer
    this._renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true
    });

    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setSize(this._wrapper.offsetWidth, this._wrapper.offsetHeight);
    this._renderer.setClearColor( 0x000000, 1 );
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
    this._renderer.autoClear = false;

    this._canvas = this._renderer.domElement;

    this._wrapper.appendChild(this._canvas);

    // Creating the ARView, which is the object that handles
    // the rendering of the camera stream behind the three.js
    // scene
    this._arView = new THREE.ARView(this.vrDisplay, this._renderer);

    // you will need a camera. this is to view the 3d object
    this.camera = new THREE.ARPerspectiveCamera(
      this.vrDisplay,
      this._wrapper.offsetWidth / this._wrapper.offsetHeight,
      this.vrDisplay.depthNear,
      this.vrDisplay.depthFar
    );

    // VRControls is a utility from three.js that applies the device's
    // orientation/position to the perspective camera, keeping our
    // real world and virtual world in sync.
    this._vrControls = new THREE.VRControls(this.camera);

    const ambient = new THREE.AmbientLight(0xffffff, 1); // soft white light
    this.scene.add(ambient);

    this.events.emit('arbase-ready');

    this.bindEventListeners();
  }

  bindEventListeners() {
    /////////////////////////////////////////
    // Window Resizing
    /////////////////////////////////////////
    window.addEventListener('resize', this.onWindowResize.bind(this), false);

    this._canvas.addEventListener('touchstart', this.onTouchEvent.bind(this), false);
  }

  onTouchEvent(e) {
    this.events.emit('arbase-touched', e);
  }

  onWindowResize() {
    this.camera.aspect = this._wrapper.offsetWidth / this._wrapper.offsetHeight;
    this.camera.updateProjectionMatrix();
    this._renderer.setSize(this._wrapper.offsetWidth, this._wrapper.offsetHeight);
  }

  render() {
    // Render the device's camera stream on screen first of all.
    // It allows to get the right pose synchronized with the right frame.
    this._arView.render();

    // Update our camera projection matrix in the event that
    // the near or far planes have updated
    this.camera.updateProjectionMatrix();

    // From the WebVR API, populate `vrFrameData` with
    // updated information for the frame
    this.vrDisplay.getFrameData(this.vrFrameData);

    // Update our perspective camera's positioning
    this._vrControls.update();

    // Render our three.js virtual scene
    this._renderer.clearDepth();
    this._renderer.render(this.scene, this.camera);
  }
}

export default ARBase;