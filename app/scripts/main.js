// we are inserting threejs via bower components
// otherwise there will be some issue if we import threejs library

import * as threeARJs from 'three.ar.js';
import ARBase from './ar.base.js';
import ARReticle from './ar.reticle.js';
import PhysicsBase from './physics.base.js';

class PaperToss {
  constructor() {
    // DOM elements
    this.canvas = document.getElementById('scene_wrapper');
    this.basketLocationButton = document.getElementById('basket_location_button');
    this.messageWrapper = document.getElementById('message_wrapper');

    this.arBase = null;
    this.physicsBase = null;

    this.ballShape = new CANNON.Sphere(0.05);

    this.swipePosition = {
      startX: 0,
      startY: 0,
      startTime: 0,
      endX: 0,
      endY: 0,
      endTime: 0
    };

    // ui state flag
    this.basketPositionLocked = false;
    this.basketPlaced = false;
    this.gameBegin = false;

    // 3d objects
    this.basket = null;
    this.basketHeight = 0.35;
    this.basketScale = .8;

    this.lastFrameData = {
      x: 0,
      y: 0,
      z: 0
    };

    this.lastFrameUpdate = 0;

    // the base width and length value is .2 and .15 respectively
    this.basketWidth = .2 * this.basketScale;
    this.basketLength = .15 * this.basketScale;
    this.basketWall = {};

    this.ballModel = null;

    this.balls = [];
    this.ballsReady = null;
    this.ballsPhysics = [];
    this._world = null;
    this._groundBody = null;

    this.arBase = new ARBase({
      showPoseStatus: true,
      showLastHit: true,
      showPlanes: false
    }, this.canvas);

    this.reticle = null;

    this._scene = null;
    this._vrDisplay = null;
    this._camera = null;

    this.bindEvents();

    this.setBallModel();

    this.showMessage(true);
  }

  initiatePhysics() {
    this.physicsBase = new PhysicsBase(this._scene, {
      debug: false
    });

    this._groundBody = this.physicsBase.groundBody;
    this._world = this.physicsBase.world;
  }

  bindEvents() {
    this.arBase.events.on('arbase-ready', () => {
      this._scene = this.arBase.scene;
      this._vrDisplay = this.arBase.vrDisplay;
      this._camera = this.arBase.camera;
      this.reticle = new ARReticle(this._vrDisplay, this._scene);
      this.reticle.init();

      // add camera into the scene
      this._scene.add(this._camera);

      this.loadBasketModel();

      this.initiatePhysics();
      this.render();
    });

    this.arBase.events.on('arbase-touched-start', (e) => {
      this.hideMessage();

      // to flag that game has begin after first tap
      if (!this.gameBegin) {
        this.gameBegin = true;
        return;
      }

      this.swipePosition.startX = e.touches[0].pageX;
      this.swipePosition.startY = e.touches[0].pageY;
      this.swipePosition.startTime = e.timeStamp;

      this.tossingTouchEvent(e);
    });

    this.arBase.events.on('arbase-touched-end', (e) => {
      this.swipePosition.endX = e.changedTouches[0].pageX;
      this.swipePosition.endY = e.changedTouches[0].pageY;
      this.swipePosition.endTime = e.timeStamp;

      if (this.swipePosition.endY > this.swipePosition.startY || !this.basketPositionLocked) {
        // swipe up shouldn't throw the ball
        // no basket no balls, lol
        if (this.swipePosition.endY > this.swipePosition.startY && this.basketPositionLocked) {
          this.showMessage(false, 'you are trying to be funny by swiping down. get it together ಠ▃ಠ');
        }

        return;
      }

      this.throwBall();
    });

    this.messageWrapper.addEventListener('touchstart', this.hideMessage.bind(this), false);

    this.basketLocationButton.addEventListener('touchstart', this.setBinPositionButtonState.bind(this), false);
  }

  tossingTouchEvent(e) {
    // Inspect the event object and generate normalize screen coordinates
    // (between 0 and 1) for the screen position.
    const xPos = e.touches[0].pageX / window.innerWidth;
    const yPos = e.touches[0].pageY / window.innerHeight;

    if (this.gameBegin && !this.basketPositionLocked) {
      this.basketPlaced = false;

      // Send a ray from the point of click to the real world surface
      // and attempt to find a hit. `hitTest` returns an array of potential
      // hits.
      const hits = this._vrDisplay.hitTest(xPos, yPos);

      // If a hit is found, just use the first one
      if (hits && hits.length) {
        // let's add in basket physics wall
        this.clearAllBalls();
        this.createBasketPhysicsWall();

        this.basketPlaced = true;
        const hit = hits[0];

        // Use the `placeObjectAtHit` utility to position
        // the cube where the hit occurred
        THREE.ARUtils.placeObjectAtHit(this.basket, hit, true, 1);

        // move the cannonjs groundbody accordingly
        this._groundBody.position.copy(this.basket.position);

        Object.keys(this.basketWall).forEach((key) => {
          if (key !== 'created') {
            let pos = this.basket.position;

            // TODO: refactor this
            // too many magic numbers here
            // find a better way to create the physics wall
            switch(key) {
              case 'right':
                pos = new CANNON.Vec3(pos.x - (this.basketWidth + .05), pos.y, pos.z - .025);
                break;
              case 'left':
                pos = new CANNON.Vec3(pos.x + (this.basketWidth - .06), pos.y, pos.z - .025);
                break;
              case 'top':
                pos = new CANNON.Vec3(pos.x + (this.basketLength - .17), pos.y, (pos.z - this.basketLength) + .01);
                break;
              case 'bottom':
                pos = new CANNON.Vec3(pos.x + (this.basketLength - .17), pos.y, (pos.z + this.basketLength) - .06);
                break;
            }

            this.basketWall[key].position.copy(pos);
          }
        });

        this.showMessage(false, 'bin has been placed, you can now lock this position and begin throwing. (⌐■_■)');
        return;
      }

      this.hideObject(this.basket);

      this.showMessage(false, 'invalid bin location, please try again ಠ▃ಠ');
      return;
    }
  }

  clearAllBalls() {
    this.ballsPhysics.forEach((ball, i) => {
      this._world.removeBody(ball);
      this._scene.remove(this.balls[i]);
    });

    this.ballsPhysics = [];
    this.balls = [];
  }

  setBallModel() {
    this.load3DModel('./3D_objects/otter_ball_model.obj', './3D_objects/otter_ball_materials.mtl', .15)
      .then((model) => {
        this.ballModel = model;
      });
  }

  loadBasketModel() {
    this.load3DModel('./3D_objects/bin_model.obj', './3D_objects/bin_materials.mtl', this.basketScale)
      .then((model) => {
        this.basket = model;
        this._scene.add(this.basket);

        this.hideObject(this.basket);
      });
  }

  setBallPosition() {
    this.ballsReady = this.ballModel.clone();

    this.ballsReady.scale.set(.015, .015, .015);

    this.ballsReady.position.set(0, -.013, -.03);

    this._camera.add(this.ballsReady);
  }

  throwBall() {
    if (!this.basketPositionLocked || !this.ballsReady) {
      return;
    }

    this.balls.push(this.ballsReady);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    mouse.x = 0;
    mouse.y = 0;

    raycaster.setFromCamera(mouse, this._camera);

    const shootDirection = raycaster.ray.direction.normalize();

    // compute swipe distance
    const swipeDist = Math.sqrt(Math.pow((this.swipePosition.endX - this.swipePosition.startX), 2) + Math.pow((this.swipePosition.endY - this.swipePosition.startY), 2));

    const timeDelta = this.swipePosition.endTime - this.swipePosition.startTime;

    // compute velocity by dist / time delta
    const velocity = (swipeDist / timeDelta);

    // z and x velocity value are relative to each other.
    // we need to find the ratio of the final z value with origin
    // use the ratio value and multiply it with x value
    // this theory could be wrong. but for now it fix the weird behavior
    const zVel = shootDirection.z - velocity;
    const zRatio = zVel / shootDirection.z;

     // let's place the paper ball at touch point
     let ballBody = new CANNON.Body({
      mass: 0.1,
      material: new CANNON.Material()
    });

    var getCurrentPosition = new THREE.Vector3( );
    getCurrentPosition.setFromMatrixPosition( this.ballsReady.matrixWorld );
    ballBody.position.copy(getCurrentPosition);

    // detach it from camera and add it to the scene
    // credits to Skezo
    THREE.SceneUtils.detach( this.ballsReady, this._camera, this._scene );
    this._camera.updateMatrixWorld();

    ballBody.addShape(this.ballShape);
    ballBody.linearDamping = 0;

    this.ballsPhysics.push(ballBody);

    this._world.addBody(ballBody);

    ballBody.velocity.set(shootDirection.x * zRatio,
      shootDirection.y + velocity,
      shootDirection.z - velocity);

    this.ballsReady = null;

    setTimeout(() => {
      this.setBallPosition();
    }, 1000);
  }

  load3DModel(objPath, mtlPath, scale) {
    return new Promise((resolve, reject) => {
      let model = null;

      THREE.ARUtils.loadModel({
        objPath: objPath,
        mtlPath: mtlPath,
        OBJLoader: undefined, // uses window.THREE.OBJLoader by default
        MTLLoader: undefined, // uses window.THREE.MTLLoader by default
      }).then((group) => {
        model = group;
        // As OBJ models may contain a group with several meshes,
        // we want all of them to cast shadow
        model.children.forEach((mesh) => {
          mesh.castShadow = true;
        });

        model.scale.set(scale, scale, scale);

        resolve(model);
      });
    });
  }

  createBallObject(pos, color, radius) {
    const paperBallGeometry = new THREE.SphereGeometry(radius);
    const paperBallMaterial = new THREE.MeshBasicMaterial({
      color: color || 0xffffff,
      opacity: 1,
      wireframe: true
    });

    const paperBall = new THREE.Mesh(paperBallGeometry, paperBallMaterial);

    paperBall.castShadow = true;
    paperBall.receiveShadow = true;

    if (pos) {
      paperBall.position.copy(pos);
    }

    return paperBall;
  }

  createBasketPhysicsWall() {
    if (this.basketWall.created) {
      Object.keys(this.basketWall).forEach((key) => {
        if (key !== 'created') {
          this._world.removeBody(this.basketWall[key]);
          console.log('removing');
        }
      });

      this.basketWall = {};
    }

    const sideHalfExtents = new CANNON.Vec3(this.basketLength, this.basketHeight, 0.02);
    const topBottomHalfExtents = new CANNON.Vec3(this.basketWidth, this.basketHeight, 0.02);

    const boxShape = {
      side: new CANNON.Box(sideHalfExtents),
      topBottom: new CANNON.Box(topBottomHalfExtents)
    };

    // TODO: this is kinda stupid, will need to refactor this,
    // to compute the angle and position automatically based on number of basket's sides
    const sidesInfo = {
      right: {
        pos: new CANNON.Vec3(0, 1, 0),
        rotation: new CANNON.Vec3(0, 90 * Math.PI / 180, 0)
      },
      left: {
        pos: new CANNON.Vec3(1, 0, 0),
        rotation: new CANNON.Vec3(0, 90 * Math.PI / 180, 0)
      },
      top: {
        pos: new CANNON.Vec3(2, 0, 0),
        rotation: new CANNON.Vec3(-(10 * Math.PI / 180), 0, 0)
      },
      bottom: {
        pos: new CANNON.Vec3(0, 2, 0),
        rotation: new CANNON.Vec3((10 * Math.PI / 180), 0, 0)
      }
    };

    Object.keys(sidesInfo).forEach((side) => {
      this.basketWall[side] = new CANNON.Body({
        mass: 0,
        collisionResponse: true
      });

      this.basketWall[side].addShape(side === 'right' || side === 'left' ? boxShape.side : boxShape.topBottom);

      this.basketWall[side].position.copy(sidesInfo[side].pos);
      this.basketWall[side].quaternion.setFromEuler(sidesInfo[side].rotation.x, sidesInfo[side].rotation.y, sidesInfo[side].rotation.z);
      this._world.add(this.basketWall[side]);
    });

    this.basketWall.created = true;
  }

  hideObject(obj) {
    // Place the object very far to initialize
    obj.position.set(10000, 10000, 10000);
  }

  render() {
    this.arBase.render();
    this.physicsBase.render();

    if (this.reticle) {
      this.reticle.render();
    }

    // Update ball positions
    for(let i=0; i < this.balls.length; i++){
      if (this.ballsPhysics[i]) {
        this.balls[i].position.copy(this.ballsPhysics[i].position);
        this.balls[i].scale.set(.25, .25, .25);
        this.balls[i].quaternion.copy(this.ballsPhysics[i].quaternion);
      }
    }

    requestAnimationFrame(() => {
      this.render();
    });
  }

  setBinPositionButtonState() {
    if (!this.basketPlaced) {
      this.showMessage(false, 'where is your basket dude ಠ▃ಠ');
      return;
    }

    this.basketPositionLocked = !this.basketPositionLocked;

    if (this.reticle) {
      if (this.basketPositionLocked) {
        // set ball shooting position
        this.setBallPosition();
        this.reticle.hide();
        // this.showHideBallHolder();
      } else {
        // remove the ball from the ready
        if (this.ballsReady) {
          this._camera.remove(this.ballsReady);
        }

        this.reticle.show();
      }
    }

    this.changeButtonState(this.basketPositionLocked, this.basketLocationButton);
  }

  changeButtonState(isActive, elem) {
    // if it's locked change button icon and label
    const iconState = isActive ? 'data-inactive' : 'data-active';
    elem.querySelector('.button i').innerHTML = elem.querySelector('.button i').getAttribute(iconState);
    elem.querySelector('.button--label').innerHTML = elem.querySelector('.button--label').getAttribute(iconState);
  }

  showMessage(isIntro, msg) {
    this.messageWrapper.style.display = 'block';

    if (!isIntro) {
      this.messageWrapper.innerHTML = msg;
      setTimeout(() => {
        this.hideMessage();
      }, 5000);
    }
  }

  hideMessage() {
    this.messageWrapper.innerHTML = '';
    this.messageWrapper.style.display = 'none';
  }
}

const paperToss = new PaperToss();