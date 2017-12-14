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
    this.helperButton = document.getElementById('helper_button');
    this.messageWrapper = document.getElementById('message_wrapper');

    this.arBase = null;
    this.physicsBase = null;

    this.ballShape = new CANNON.Sphere(0.05);
    this.ballHolder = null;
    this.ballHolderDeltaPosition = .08;

    this.shootingVelocity = 6;

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
    this.okToPlay = false;
    this.gameBegin = false;

    // 3d objects
    this.basket = null;
    this.basketRadius = 0.2;
    this.basketHeight = 0.35;
    this.basketWall = {};

    this.balls = [];
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

    this.showMessage(true);
  }

  initiatePhysics() {
    this.physicsBase = new PhysicsBase(this._scene, {
      disable: true
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

      this.paperTossTouchEvent(e);
    });

    this.arBase.events.on('arbase-touched-end', (e) => {
      this.swipePosition.endX = e.changedTouches[0].pageX;
      this.swipePosition.endY = e.changedTouches[0].pageY;
      this.swipePosition.endTime = e.timeStamp;
      this.throwBall();
    });

    this.messageWrapper.addEventListener('touchstart', this.hideMessage.bind(this), false);

    this.basketLocationButton.addEventListener('touchstart', this.setBinPositionButtonState.bind(this), false);
  }

  paperTossTouchEvent(e) {
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
        var hit = hits[0];

        // Use the `placeObjectAtHit` utility to position
        // the cube where the hit occurred
        THREE.ARUtils.placeObjectAtHit(this.basket, hit, true, 1);

        // move the cannonjs groundbody accordingly
        this._groundBody.position.copy(this.basket.position);

        Object.keys(this.basketWall).forEach((key) => {
          if (key !== 'created') {
            let pos = this.basket.position;

            switch(key) {
              case 'right':
                pos = new CANNON.Vec3(pos.x - (this.basketRadius / 2), pos.y, pos.z - (this.basketRadius / 2));
                break;
              case 'left':
                pos = new CANNON.Vec3(pos.x + (this.basketRadius / 2), pos.y, pos.z + (this.basketRadius / 2));
                break;
              case 'top':
                pos = new CANNON.Vec3(pos.x + (this.basketRadius / 2), pos.y, pos.z - (this.basketRadius / 2));
                break;
              case 'bottom':
                pos = new CANNON.Vec3(pos.x - (this.basketRadius / 2), pos.y, pos.z + (this.basketRadius / 2));
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

  showHideBallHolder() {
    if (!this.ballHolder) {
      this.ballHolder = this.createBallObject(null, 0x004d40, this.ballShape.radius * .1 );
      this.ballHolder.castShadow = true;
      this.ballHolder.receiveShadow = true;
      this.ballHolder.translateZ = -2;
      this._scene.add(this.ballHolder);
    }
  }

  throwBall() {
    if (!this.basketPositionLocked) {
      return;
    }

    const shootDirection = this._camera.getWorldDirection();

    let ballMesh = this.createBallObject(null, 0x004d40, this.ballShape.radius );
    ballMesh.castShadow = true;
    ballMesh.receiveShadow = true;

    this.balls.push(ballMesh);

    this._scene.add(ballMesh);

    // let's place the paper ball at touch point
    let ballBody = new CANNON.Body({
      mass: 0.1,
      material: new CANNON.Material()
    });

    ballBody.addShape(this.ballShape);
    ballBody.linearDamping = 0;

    this.ballsPhysics.push(ballBody);

    this._world.addBody(ballBody);

    // compute swipe distance
    const swipeDist = Math.abs(this.swipePosition.endY - this.swipePosition.startY);

    // we use 5% of the total y distance for x and z velocity value
    // we use .3% of the total y distance for y velocity value
    // TODO: refactor this. maybe there is a proper way to set the velocity instead of magic number
    ballBody.velocity.set(  shootDirection.x * (swipeDist * .05),
                            shootDirection.y + (swipeDist * .004),
                            shootDirection.z * (swipeDist * .05));

    ballBody.position.set(this._camera.position.x, this._camera.position.y - this.ballHolderDeltaPosition, this._camera.position.z);
    ballMesh.position.set(this._camera.position.x, this._camera.position.y - this.ballHolderDeltaPosition, this._camera.position.z);

    ballBody.quaternion.copy(this._camera.quaternion);
    ballMesh.quaternion.copy(this._camera.quaternion);
  }

  createBasketObject() {
    const basketObject = new THREE.Object3D();

    // let's create bin's wall
    const binWallMaterial = new THREE.MeshLambertMaterial({
      color: 0xfc1c05,
      opacity: 1,
      wireframe: true
    });

    const binWallGeometry = new THREE.CylinderGeometry(this.basketRadius, this.basketRadius, this.basketHeight, 4, 4, true, 0, 6.3);
    const binWall = new THREE.Mesh(binWallGeometry, binWallMaterial);

    binWall.position.set(0, this.basketHeight / 2, 0);

    // add bin's wall to the bin object group
    basketObject.add(binWall);

    // let's create bin's base
    const binBaseGeometry = new THREE.CircleGeometry(this.basketRadius, 4);

    const binBaseMaterial = new THREE.MeshPhongMaterial({
      color: 0xfc1c05,
      side: THREE.DoubleSide
    });

    const binBase = new THREE.Mesh(binBaseGeometry, binBaseMaterial);

    binBase.receiveShadow = true;

    // let's position bin's base to the correct position
    binBase.position.set(0, 0, 0);
    binBase.rotation.x = Math.PI / 2;

    basketObject.add(binBase);

    this.hideObject(basketObject);

    return basketObject;
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

    // created this so that we can re-align the basket object accordingly
    const basketWallFrame = this.generateBasketPhysicsVertex(this.basketRadius, this.basketRadius, this.basketHeight, 4, true);

    this.basketWall.frame = new CANNON.Body({
      mass: 0,
      shape: new CANNON.ConvexPolyhedron(basketWallFrame.verts, basketWallFrame.faces, basketWallFrame.axes),
      material: new CANNON.Material()
    });

    // we need to rotate the cylinder, as there is a difference between cannon and three js default quaternion
    this.basketWall.frame.quaternion.setFromEuler(-Math.PI/2, 0, 0);
    this.basketWall.frame.linearDamping = 0;
    this._world.add(this.basketWall.frame);

    // 1.8, is to make the wall slightly bigger
    var halfExtents = new CANNON.Vec3(this.basketRadius / 1.8, this.basketHeight, 0.02);

    const boxShape = new CANNON.Box(halfExtents);

    // TODO: this is kinda stupid, will need to refactor this,
    // to compute the angle and position automatically based on number of basket's sides
    const sidesInfo = {
      right: {
        pos: new CANNON.Vec3(0, 1, 0),
        rotation: new CANNON.Vec3(0, 45 * Math.PI / 180, 0)
      },
      left: {
        pos: new CANNON.Vec3(1, 0, 0),
        rotation: new CANNON.Vec3(0, 45 * Math.PI / 180, 0)
      },
      top: {
        pos: new CANNON.Vec3(2, 0, 0),
        rotation: new CANNON.Vec3(0, -(45 * Math.PI / 180), 0)
      },
      bottom: {
        pos: new CANNON.Vec3(0, 2, 0),
        rotation: new CANNON.Vec3(0, -(45 * Math.PI / 180), 0)
      }
    };

    Object.keys(sidesInfo).forEach((side) => {
      this.basketWall[side] = new CANNON.Body({
        mass: 0,
        collisionResponse: true
      });

      this.basketWall[side].addShape(boxShape);

      this.basketWall[side].position.copy(sidesInfo[side].pos);
      this.basketWall[side].quaternion.setFromEuler(sidesInfo[side].rotation.x, sidesInfo[side].rotation.y, sidesInfo[side].rotation.z);
      this._world.add(this.basketWall[side]);
    });

    this.basketWall.created = true;
  }

  generateBasketPhysicsVertex(radiusTop, radiusBottom, height , numSegments, openEndedTop, openEndedBottom) {
    // ref: https://github.com/schteppe/cannon.js/blob/master/src/shapes/Cylinder.js
    // this is a tweak of the original code to support open ended top and bottom

    const N = numSegments;
    const cos = Math.cos;
    const sin = Math.sin;

    let verts = [];
    let axes = [];
    let faces = [];
    let bottomface = [];
    let topface = [];

    // First bottom point
    verts.push(new CANNON.Vec3(
      radiusBottom * cos(0),
      radiusBottom * sin(0),
      -height * 0.5)
    );

    bottomface.push(0);

    // First top point
    verts.push(new CANNON.Vec3(
      radiusTop * cos(0),
      radiusTop * sin(0),
      height * 0.5)
    );

    topface.push(1);

    for(let i=0; i<N; i++){
      const theta = 2 * Math.PI/N * (i+1);
      const thetaN = 2 * Math.PI/N * (i+0.5);

      if(i < N-1){
        // Bottom
        verts.push(new CANNON.Vec3(radiusBottom * cos(theta),
                                  radiusBottom * sin(theta),
                                  -height * 0.5));

        bottomface.push(2 * i + 2);
        // Top
        verts.push(new CANNON.Vec3(radiusTop * cos(theta),
                                  radiusTop * sin(theta),
                                  height * 0.5));
        topface.push(2 * i + 3);

        // Face
        faces.push([2 * i + 2, 2 * i + 3, 2 * i + 1, 2 * i]);
      } else {
        faces.push([0, 1, 2 * i + 1, 2 * i]); // Connect
      }

      // Axis: we can cut off half of them if we have even number of segments
      if(N % 2 === 1 || i < N / 2){
        axes.push(new CANNON.Vec3(cos(thetaN), sin(thetaN), 0));
      }
    }

    axes.push(new CANNON.Vec3(0, 0, 1));

    if (!openEndedTop) {
      faces.push(topface);
    }

    if (!openEndedBottom) {
      // Reorder bottom face
      let temp = [];
      for(let i=0; i<bottomface.length; i++){
        temp.push(bottomface[bottomface.length - i - 1]);
      }
      faces.push(temp);
    }

    return {
      verts,
      faces,
      axes
    };
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

    if (!this.camera && !this.arBase.camera.position.y) {
      // add bin into the world
      this.basket = this.createBasketObject();
      this._scene.add(this.basket);
    }

    if (this.basketWall.frame) {
      this.basket.position.copy(this.basketWall.frame.position);
    }

    // Update ball positions
    for(let i=0; i < this.balls.length; i++){
      if (this.ballsPhysics[i]) {
        this.balls[i].position.copy(this.ballsPhysics[i].position);
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
        this.reticle.hide();
        // this.showHideBallHolder();
      } else {
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