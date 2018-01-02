// we are inserting threejs via bower components
// otherwise there will be some issue if we import threejs library

import * as threeARJs from 'three.ar.js';
import ARBase from './ar.base.js';
import ARReticle from './ar.reticle.js';
import PhysicsBase from './physics.base.js';
import SoundsBase from './sounds.base.js';

class PaperToss {
  constructor() {
    // DOM elements
    this.canvas = document.getElementById('scene_wrapper');
    this.basketLocationButton = document.getElementById('basket_location_button');
    this.messageWrapper = document.getElementById('message_wrapper');
    this.scoreBoard = document.getElementById('score_board');

    const texture = new THREE.TextureLoader().load( 'images/Pennywise.png' );
    const geometry = new THREE.PlaneGeometry( 0.9954954954, 2 ); //0.4977477477

    // immediately use the texture for material creation
    const material = new THREE.MeshBasicMaterial( { map: texture, transparent: true } );

    this.pennywise = new THREE.Mesh(geometry, material);

    this.gamePause = false;

    this._soundsBase = new SoundsBase();

    this._soundsBase.events.on('game-over-tune-start', () => {
      // game over
      this.gamePause = true;
    });

    this._soundsBase.events.on('game-over-tune-end', () => {
      // game over
      this.showMessage(5000, 'game over!');
      this.setBinPositionButtonState();
    });

    this.arBase = null;
    this.physicsBase = null;

    this.ballShape = new CANNON.Sphere(0.02);

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
    this.currentScore = 0;
    this.ballsMissed = 0;
    this.maxMissedBallsPerSet = 3;

    // 3d objects
    this.basket = null;
    this.basketHeight = 0.35;
    this.basketScale = .7;

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
    this.basketBBox = null;
    this.ballShot = 0;

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

    this.showMessage(5000);
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
      if (this.gamePause) {
        return;
      }

      this.swipePosition.endX = e.changedTouches[0].pageX;
      this.swipePosition.endY = e.changedTouches[0].pageY;
      this.swipePosition.endTime = e.timeStamp;

      if (this.swipePosition.endY > this.swipePosition.startY || !this.basketPositionLocked) {
        // swipe up shouldn't throw the ball
        // no basket no balls, lol
        if (this.swipePosition.endY > this.swipePosition.startY && this.basketPositionLocked) {
          this.showMessage(0, 'do you even toss? ◔_◔');
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

        this.showObject(this.basket);

        // Use the `placeObjectAtHit` utility to position
        // the cube where the hit occurred
        THREE.ARUtils.placeObjectAtHit(this.basket, hit, true, 1);

        // move the cannonjs groundbody accordingly
        this._groundBody.position.copy(this.basket.position);

        const bbox = new THREE.BoxHelper(this.basket, 0xff0000);
        bbox.update();

        bbox.geometry.computeBoundingBox();

        // to make sure that the ball always hit the bin's mouth
        // since the bin's base is smaller than top
        bbox.geometry.boundingBox.min.y = bbox.geometry.boundingBox.min.y + .3;

        this.basketBBox = bbox.geometry.boundingBox;

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

        this.showMessage(0, 'bin has been placed, you can now lock this position and begin throwing. (⌐■_■)');
        return;
      }

      this.hideObject(this.basket);

      this.showMessage(0, 'invalid bin location, please try again ಠ▃ಠ');
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
    this.load3DModel('./3D_objects/ball_model.obj', './3D_objects/ball_materials.mtl', .2)
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

    this.ballsReady.position.set(0, -.071, -.15);

    this._camera.add(this.ballsReady);
  }

  throwBall() {
    if (!this.basketPositionLocked || !this.ballsReady) {
      return;
    }

    this.ballsReady.ballIndex = this.ballShot;

    const raycaster = new THREE.Raycaster();

    // ref: https://stackoverflow.com/questions/13055214/mouse-canvas-x-y-to-three-js-world-x-y-z, last post
    const mousePosition = new THREE.Vector3();

    // try to get ball throw direction from the mouse position
    mousePosition.set((this.swipePosition.endX / window.innerWidth) * 2 - 1, -(this.swipePosition.endY / window.innerHeight) * 2 + 1, .5); // z = 0.5 important!

    mousePosition.unproject(this._camera);

    raycaster.set(this._camera.position, mousePosition.sub(this._camera.position).normalize());

    const shootDirection = raycaster.ray.direction.normalize();

     // let's place the paper ball at touch point
     let ballBody = new CANNON.Body({
      mass: 0.1,
      material: new CANNON.Material()
    });

    const ballPosition = new THREE.Vector3();
    const ballQuaternion = new THREE.Quaternion();
    const ballScale = new THREE.Vector3();

    this.ballsReady.matrixWorld.decompose( ballPosition, ballQuaternion, ballScale );

    ballBody.position.copy(ballPosition);

    this.ballsReady.throwPosition = ballPosition;

    // detach it from camera and add it to the scene
    // credits to Skezo
    THREE.SceneUtils.detach( this.ballsReady, this._camera, this._scene );
    this._camera.updateMatrixWorld();

    ballBody.addShape(this.ballShape);
    ballBody.linearDamping = 0;
    ballBody.ballIndex = this.ballsReady.ballIndex;

    // add collision event listener to the ballbody
    ballBody.addEventListener('collide', (e) => {
      this.checkScore(null, e);
    });

    this.ballsPhysics.push(ballBody);

    this.balls.push(this.ballsReady);

    this._world.addBody(ballBody);

    // compute swipe distance
    const swipeDist = this.computeDistance(this.swipePosition);

    const timeDelta = this.swipePosition.endTime - this.swipePosition.startTime;

    // compute velocity by dist / time delta
    const velocity = (swipeDist / timeDelta);

    // z and x velocity value are relative to each other.
    // we need to find the ratio of the final z value with origin
    // use the ratio value and multiply it with x value
    // this theory could be wrong. but for now it fix the weird behavior
    const zVel = shootDirection.z - velocity;
    const zRatio = zVel / shootDirection.z;

    ballBody.velocity.set((shootDirection.x * zRatio),
      shootDirection.y + velocity,
      shootDirection.z - velocity);

    this.ballsReady = null;
    this.ballShot += 1;

    setTimeout(() => {
      this.setBallPosition();
    }, 500);
  }

  computeDistance(pointsSet) {
    return Math.sqrt(Math.pow((pointsSet.endX - pointsSet.startX), 2) + Math.pow((pointsSet.endY - pointsSet.startY), 2));
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
        mass: 0
      });

      this.basketWall[side].isWall = true;

      const shape = side === 'right' || side === 'left' ? boxShape.side : boxShape.topBottom;

      this.basketWall[side].addShape(shape);

      this.basketWall[side].position.copy(sidesInfo[side].pos);
      this.basketWall[side].quaternion.setFromEuler(sidesInfo[side].rotation.x, sidesInfo[side].rotation.y, sidesInfo[side].rotation.z);
      this._world.add(this.basketWall[side]);
    });

    this.basketWall.created = true;
  }

  showPennywise() {
    if (this.ballsMissed / this.maxMissedBallsPerSet === 1) {
      this.pennywise.visible = true;
      this.pennywise.position.copy(this.basket.position);

      this.pennywise.position.z = -4;

      this.pennywise.position.y +=.5;

      this._scene.add(this.pennywise);

      return;
    }

    this.pennywise.position.x = this.pennywise.position.x + (this.ballsMissed / this.maxMissedBallsPerSet === 2 ? .6 : -.6);
    this.pennywise.position.z += 1.5;
  }

  hidePennywise() {
    this.pennywise.visible = false;
  }

  showObject(obj) {
    obj.visible = true;
  }

  hideObject(obj) {
    // Place the object very far to initialize
    // obj.position.set(10000, 10000, 10000);
    obj.visible = false;
  }

  assignScore(dist) {
    let msg = '';

    if (dist === 0) {
      if (this.ballsMissed % this.maxMissedBallsPerSet === 0) {
        msg = 'yawn... 눈_눈';

        this.showPennywise();

        this._soundsBase.playSound(`fail${this.ballsMissed/this.maxMissedBallsPerSet}`);
      }
    } else if (dist < 0.75 && dist > 0) {
      this.currentScore += 1;
      msg = 'cih! ◔_◔';
      this._soundsBase.playSound('win1');
    } else if (dist > 0.75 && dist < 1.5) {
      this.currentScore += 2;
      msg = 'mmmkay! ʘ‿ʘ';
      this._soundsBase.playSound('win2');
    } else if (dist > 1.5 && dist < 2.5) {
      this.currentScore += 3;
      msg = 'not bad! ᕦ(ò_óˇ)ᕤ';
      this._soundsBase.playSound('win3');
    } else if (dist > 2.5) {
      this.currentScore += 5;
      msg = 'woo hoo! ♪♪ ヽ(ˇ∀ˇ )ゞ';
      this._soundsBase.playSound('win4');
    }

    if (dist > 0) {
      // reset the ball missed count
      this.ballsMissed = 0;
    }

    this.showMessage(5000, msg);
    this.scoreBoard.innerHTML = this.padNumbers(this.currentScore, 3);
  }

  checkScore(ball, collisionProps) {
    if (ball && !ball.scoreAssigned) {
      if (this.basketBBox.containsPoint(ball.position)) {
        ball.scoreAssigned = true;

        this.assignScore(ball.throwPosition.distanceTo(this.basket.position));
        return;
      }
    }

    if (collisionProps) {
      // if the collision body isGround prop is true, and score has not been assigned to the ball
      // time to clear it
      if (collisionProps.body.isGround
        && this.balls[collisionProps.target.ballIndex]
        && !this.balls[collisionProps.target.ballIndex].scoreAssigned) {
        this.balls[collisionProps.target.ballIndex].scoreAssigned = true;

        this.ballsMissed += 1;
        this.assignScore(0);
        return;
      }
    }
  }

  retireBall(ballIndex) {
    const ball = this.balls[ballIndex];
    const ballBody = this.ballsPhysics[ballIndex];

    if (!this._scene || this._world === null) {
      return;
    }

    this.balls.splice(ballIndex, 1, null);
    this.ballsPhysics.splice(ballIndex, 1, null);

    this._scene.remove(ball);
    this._world.remove(ballBody);
  }

  padNumbers(number, size) {
    var s = String(number);
    while (s.length < (size || 2)) {
      s = `0${s}`;
    }

    return s;
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
        // this.balls[i].scale.set(.25, .25, .25);
        this.balls[i].quaternion.copy(this.ballsPhysics[i].quaternion);

        this.checkScore(this.balls[i]);
      }
    }

    requestAnimationFrame(() => {
      this.render();
    });
  }

  setBinPositionButtonState() {
    if (!this.basketPlaced) {
      this.showMessage(0, 'where is your basket dude ಠ▃ಠ');
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

        this.gamePause = false;
        this.hidePennywise();

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

  showMessage(timeout, msg) {
    if (msg) {
      this.messageWrapper.innerHTML = msg;
    }

    if (this.messageWrapper.innerHTML) {
      this.messageWrapper.style.display = 'block';
    }

    if (timeout > 0) {
      setTimeout(() => {
        this.hideMessage();
      }, timeout);
    }
  }

  hideMessage() {
    this.messageWrapper.innerHTML = '';
    this.messageWrapper.style.display = 'none';
  }
}

const paperToss = new PaperToss();