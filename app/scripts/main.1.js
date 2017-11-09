// we are inserting threejs via bower components
// otherwise there will be some issue if we import threejs library

import * as threeARJs from 'three.ar.js';

let vrDisplay = null;
let vrFrameData = null;
let vrControls = null;
let arView = null;
let scene = null;
let camera = null;
let renderer = null;
let world = null;
let groundBody = null;

var cannonDebugRenderer;

let physicsMaterial = null;

let balls = [];
let ballMeshes = [];

let canvas = null;

let binAdded = false;
let lockBinPosition = false;
let isValidBinPosition = false;

let binObject = new THREE.Object3D();
let binBase;

const sceneWrapper = document.getElementById('scene_wrapper');

const binLocationButton = document.getElementById('basket_location_button');
const binLocationButtonLabel = document.getElementById('bin_location_button_label');
const heroUnit = document.getElementById('hero_unit');
const messageWrapper = document.getElementById('message_wrapper');

/**
 * Use the `getARDisplay()` utility to leverage the WebVR API
 * to see if there are any AR-capable WebVR VRDisplays. Returns
 * a valid display if found. Otherwise, display the unsupported
 * browser message.
 */
THREE.ARUtils.getARDisplay().then(function (display) {
  if (display) {
    vrFrameData = new VRFrameData();
    vrDisplay = display;
    initCannon();
    init();

    cannonDebugRenderer = new THREE.CannonDebugRenderer( scene, world );
  } else {
    THREE.ARUtils.displayUnsupportedMessage();
  }
});

const init = () => {
  setCanvasPlaygroundDimension();

  // you will need a canvas, in this case we called it scene
  scene = new THREE.Scene();

  // Turn on the debugging panel
  const arDebug = new THREE.ARDebug(vrDisplay, scene, {
    showLastHit: true,
    showPoseStatus: true,
    showPlanes: false
  });

  sceneWrapper.appendChild(arDebug.getElement());

  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true
  });

  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(sceneWrapper.offsetWidth, sceneWrapper.offsetHeight);
  renderer.setClearColor( 0x000000, 1 );
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
  renderer.autoClear = false;

  canvas = renderer.domElement;

  sceneWrapper.appendChild(canvas);

  // Creating the ARView, which is the object that handles
  // the rendering of the camera stream behind the three.js
  // scene
  arView = new THREE.ARView(vrDisplay, renderer);

  // you will need a camera. this is to view the 3d object
  camera = new THREE.ARPerspectiveCamera(
    vrDisplay,
    sceneWrapper.offsetWidth / sceneWrapper.offsetHeight,
    vrDisplay.depthNear,
    vrDisplay.depthFar
  );

  // VRControls is a utility from three.js that applies the device's
  // orientation/position to the perspective camera, keeping our
  // real world and virtual world in sync.
  vrControls = new THREE.VRControls(camera);

  const ambient = new THREE.AmbientLight(0xffffff, 1); // soft white light
  scene.add(ambient);

  bindEventListeners();

  renderObject();
};

const initCannon = () => {
  // Setup our world
  world = new CANNON.World();
  world.quatNormalizeSkip = 0;
  world.quatNormalizeFast = false;
  const solver = new CANNON.GSSolver();
  world.defaultContactMaterial.contactEquationStiffness = 1e9;
  world.defaultContactMaterial.contactEquationRelaxation = 4;
  solver.iterations = 7;
  solver.tolerance = 0.1;
  const split = true;
  if(split)
      world.solver = new CANNON.SplitSolver(solver);
  else
      world.solver = solver;
  world.gravity.set(0,-10,0);
  world.broadphase = new CANNON.NaiveBroadphase();
  // Create a slippery material (friction coefficient = 0.0)
  // physicsMaterial = new CANNON.Material("groundMaterial");
  // const physicsContactMaterial = new CANNON.ContactMaterial(physicsMaterial,
  //                                                         physicsMaterial,
  //                                                         0.0, // friction coefficient
  //                                                         0.3  // restitution
  //                                                         );
  // // We must add the contact materials to the world
  // world.addContactMaterial(physicsContactMaterial);

  // Create a plane
  const groundShape = new CANNON.Plane();
  groundBody = new CANNON.Body({ mass: 0 });
  groundBody.addShape(groundShape);
  groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
  world.addBody(groundBody);
};

const bindEventListeners = () => {
  // /////////////////////////////////////////
  // // Window Resizing
  // /////////////////////////////////////////
  window.addEventListener( 'resize', onWindowResize, false );

  binLocationButton.addEventListener('touchstart', setBinPositionState, false);
  canvas.addEventListener('touchstart', canvasTouchEvent, false);
};

const getShootDir = (targetDirection, targetPosition, xPos, yPos) => {
    var raycaster = new THREE.Raycaster();
    var mouse = new THREE.Vector2();

    mouse.x = ( xPos ) * 2 - 1;
    mouse.y = - ( yPos ) * 2 + 1;

    // update the picking ray with the camera and mouse position
    raycaster.setFromCamera( mouse, camera );

    targetPosition.set(0, 0, 1);
    targetPosition.copy(raycaster.ray.direction);

    targetDirection.set(0,0,1);
    targetDirection.copy(camera.getWorldDirection());
}

const canvasTouchEvent = (e) => {
  console.log('touched');

  // Inspect the event object and generate normalize screen coordinates
  // (between 0 and 1) for the screen position.
  const xPos = e.touches[0].pageX / window.innerWidth;
  const yPos = e.touches[0].pageY / window.innerHeight;

  if (!lockBinPosition && vrDisplay && vrDisplay.hitTest) {
    isValidBinPosition = false;

    // Send a ray from the point of click to the real world surface
    // and attempt to find a hit. `hitTest` returns an array of potential
    // hits.
    var hits = vrDisplay.hitTest(xPos, yPos);

    // If a hit is found, just use the first one
    if (hits && hits.length) {
      createBinWall();
      isValidBinPosition = true;
      var hit = hits[0];

      // Use the `placeObjectAtHit` utility to position
      // the cube where the hit occurred
      THREE.ARUtils.placeObjectAtHit(binObject, hit, true /* apply orientation */, 1);

      // move the cannonjs groundbody accordingly
      groundBody.position.copy(binObject.position);
      console.log('ground ok');

      binWallContacts.right.position.set(binObject.position.x - .125, binObject.position.y, binObject.position.z - .125);
      binWallContacts.left.position.set(binObject.position.x + .125, binObject.position.y, binObject.position.z + .125);
      binWallContacts.top.position.set(binObject.position.x + .125, binObject.position.y, binObject.position.z - .125);
      binWallContacts.bottom.position.set(binObject.position.x - .125, binObject.position.y, binObject.position.z + .125);

      binWallContacts.all.position.copy(binObject.position);

      showMessage('bin has been placed, you can now lock this position and start throwing shit. (⌐■_■)');
      return;
    }

    showMessage('invalid bin location, please try again ಠ▃ಠ');
    return;
  }

  if (!isValidBinPosition) {
    showMessage('please place the damn bin into this world first ಠ▃ಠ');
    return;
  }

  throwBall(xPos, yPos);
};

const throwBall = (xPos, yPos) => {
  const ballShape = new CANNON.Sphere(.03);

  let shootDirection = new THREE.Vector3();
  let shootPosition = new THREE.Vector3();
  const shootVelo = 6;

  // let's place the paper ball at touch point
  var ballBody = new CANNON.Body({ mass: .1, material: new CANNON.Material() });
  ballBody.addShape(ballShape);
  ballBody.linearDamping = 0;

  var ballMesh = createPaperBall(null, 0x004d40, ballShape.radius );
  world.addBody(ballBody);
  scene.add(ballMesh);
  ballMesh.castShadow = true;
  ballMesh.receiveShadow = true;

  balls.push(ballBody);
  ballMeshes.push(ballMesh);
  getShootDir(shootDirection, shootPosition, xPos, yPos);
  ballBody.velocity.set(  shootDirection.x * shootVelo,
                          shootDirection.y * shootVelo,
                          shootDirection.z * shootVelo);

  const x = camera.position.x;
  const y = camera.position.y + .2;
  const z = camera.position.z;
  ballBody.position.set(x,y,z);
  ballMesh.position.set(x,y,z);

  ballBody.quaternion.copy(camera.quaternion);
  ballMesh.quaternion.copy(camera.quaternion);

  // world.addContactMaterial(new CANNON.ContactMaterial(binWallContacts.top.material, ballBody.material,
  //   {friction: 0.3, restitution: .5}));

  // world.addContactMaterial(new CANNON.ContactMaterial(binWallContacts.bottom.material, ballBody.material,
  //   {friction: 0.3, restitution: .5}));

  // world.addContactMaterial(new CANNON.ContactMaterial(binWallContacts.left.material, ballBody.material,
  //   {friction: 0.3, restitution: .5}));

  // world.addContactMaterial(new CANNON.ContactMaterial(binWallContacts.right.material, ballBody.material,
  //   {friction: 0.3, restitution: .5}));

};

const setBinPositionState = () => {
  lockBinPosition = !lockBinPosition;

  // if it's locked change button icon and label
  const iconState = lockBinPosition ? 'data-inactive' : 'data-active';
  binLocationButton.querySelector('i').innerHTML = binLocationButton.querySelector('i').getAttribute(iconState);
  // binLocationButtonLabel.innerHTML = binLocationButtonLabel.getAttribute(iconState);
};

const onWindowResize = () => {
  camera.aspect = sceneWrapper.offsetWidth / sceneWrapper.offsetHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(sceneWrapper.offsetWidth, sceneWrapper.offsetHeight);
};

const showMessage = (msg) => {
  messageWrapper.innerHTML = msg;
  messageWrapper.style.display = 'block';

  setTimeout(hideMessage, 5000);
};

const hideMessage = () => {
  messageWrapper.innerHTML = '';
  messageWrapper.style.display = 'none';
}

const hideObject = (obj) => {
  obj.position.set(10000, 10000, 10000);
};

let binWallContacts = {};

const cylinderCannonJS = (radiusTop, radiusBottom, height , numSegments, openEnded) => {
  var N = numSegments,
  verts = [],
  axes = [],
  faces = [],
  bottomface = [],
  topface = [],
  cos = Math.cos,
  sin = Math.sin;

  // First bottom point
  verts.push(new CANNON.Vec3(radiusBottom*cos(0),
      radiusBottom*sin(0),
      -height*0.5));
  bottomface.push(0);

  // First top point
  verts.push(new CANNON.Vec3(radiusTop*cos(0),
      radiusTop*sin(0),
      height*0.5));
  topface.push(1);

  for(var i=0; i<N; i++){
    var theta = 2*Math.PI/N * (i+1);
    var thetaN = 2*Math.PI/N * (i+0.5);
    if(i<N-1){
        // Bottom
        verts.push(new CANNON.Vec3(radiusBottom*cos(theta),
                                  radiusBottom*sin(theta),
                                  -height*0.5));

        bottomface.push(2*i+2);
        // Top
        verts.push(new CANNON.Vec3(radiusTop*cos(theta),
                                  radiusTop*sin(theta),
                                  height*0.5));
        topface.push(2*i+3);

        // Face
        faces.push([2*i+2, 2*i+3, 2*i+1,2*i]);
    } else {
        faces.push([0,1, 2*i+1, 2*i]); // Connect
    }

    // Axis: we can cut off half of them if we have even number of segments
    if(N % 2 === 1 || i < N / 2){
        axes.push(new CANNON.Vec3(cos(thetaN), sin(thetaN), 0));
    }
  }

  axes.push(new CANNON.Vec3(0,0,1));

  if (!openEnded) {
    faces.push(topface);
  }

  // Reorder bottom face
  var temp = [];
  for(var i=0; i<bottomface.length; i++){
    temp.push(bottomface[bottomface.length - i - 1]);
  }
  faces.push(temp);

  return {
    verts,
    faces,
    axes
  }
};

const createBinWall = () => {
  if(binWallContacts.right) {
    world.removeBody(binWallContacts.right);
    world.removeBody(binWallContacts.left);
    world.removeBody(binWallContacts.top);
    world.removeBody(binWallContacts.bottom);
    world.removeBody(binWallContacts.all);

    binWallContacts = {};
  }

  const binWallContactsShape = cylinderCannonJS(.2, .2, .3, 4, true);

  binWallContacts.all = new CANNON.Body({
    mass: 0,
    shape: new CANNON.ConvexPolyhedron(binWallContactsShape.verts, binWallContactsShape.faces, binWallContactsShape.axes),
    material: new CANNON.Material()
  });

  binWallContacts.all.quaternion.setFromEuler(-Math.PI/2, 0, 0);
  binWallContacts.all.linearDamping = 0;
  world.add(binWallContacts.all);

  var halfExtents = new CANNON.Vec3(.15,.35,.02);

  var boxShape = new CANNON.Box(halfExtents);

  binWallContacts.right = new CANNON.Body({ mass: 0, collisionResponse: true });
  binWallContacts.right.addShape(boxShape);
  binWallContacts.right.position.set(0,1,0);
  binWallContacts.right.quaternion.setFromEuler(0, 45 * Math.PI / 180, 0);
  world.addBody(binWallContacts.right);

  binWallContacts.left = new CANNON.Body({ mass: 0, collisionResponse: true });
  binWallContacts.left.addShape(boxShape);
  binWallContacts.left.position.set(1,0,0);
  binWallContacts.left.quaternion.setFromEuler(0, 45 * Math.PI / 180, 0);
  world.addBody(binWallContacts.left);

  binWallContacts.top = new CANNON.Body({ mass: 0, collisionResponse: true });
  binWallContacts.top.addShape(boxShape);
  binWallContacts.top.position.set(2,0,0);
  binWallContacts.top.quaternion.setFromEuler(0, -(45 * Math.PI / 180), 0);
  world.addBody(binWallContacts.top);

  binWallContacts.bottom = new CANNON.Body({ mass: 0, collisionResponse: true });
  binWallContacts.bottom.addShape(boxShape);
  binWallContacts.bottom.position.set(0,2,0);
  binWallContacts.bottom.quaternion.setFromEuler(0, -(45 * Math.PI / 180), 0);
  world.addBody(binWallContacts.bottom);
};

const loadBin = () => {
  // let's create bin's wall
  const binWallMaterial = new THREE.MeshLambertMaterial({
    color: 0xfc1c05,
    opacity: 1,
    wireframe: true
  });

  const binWallGeometry = new THREE.CylinderGeometry(.2, .2, .35, 4, 4, true, 0, 6.3);
  const binWall = new THREE.Mesh(binWallGeometry, binWallMaterial);

  binWall.position.set(0, .175, 0);

  // add bin's wall to the bin object group
  binObject.add(binWall);

  // let's create bin's base
  const binBaseGeometry = new THREE.CircleGeometry(.2, 4);

  const binBaseMaterial = new THREE.MeshPhongMaterial({
    color: 0xfc1c05,
    side: THREE.DoubleSide // this is to make it visible on both side
  });

  binBase = new THREE.Mesh(binBaseGeometry, binBaseMaterial);

  binBase.receiveShadow = true;

  // let's position bin's base to the correct position
  binBase.position.set(0, 0, 0);
  binBase.rotation.x = Math.PI / 2;

  binObject.add(binBase);

  // add paperball
  // binObject.add(createPaperBall(new THREE.Vector3(0, 0, 0)));

  // Place the bin very far to initialize
  hideObject(binObject);
  scene.add(binObject);

  binAdded = true;
};

const setCanvasPlaygroundDimension = () => {
  sceneWrapper.style.height = `${document.body.offsetHeight - heroUnit.offsetHeight - 135}px`;
};

const createPaperBall = (pos, color, radius ) => {
  // let's just use a sphere for this
  const paperBallGeometry = new THREE.SphereGeometry(radius || .02, 32, 32);
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
};

const renderObject = () => {
  // Render the device's camera stream on screen first of all.
  // It allows to get the right pose synchronized with the right frame.
  arView.render();

  // Update our camera projection matrix in the event that
  // the near or far planes have updated
  camera.updateProjectionMatrix();

  // From the WebVR API, populate `vrFrameData` with
  // updated information for the frame
  vrDisplay.getFrameData(vrFrameData);

  // Update our perspective camera's positioning
  vrControls.update();

  world.step(1/60);   // update the physics

  // If we have not added boxes yet, and we have positional
  // information applied to our camera (it can take a few seconds),
  // and the camera's Y position is not undefined or 0, create boxes
  if (!binAdded && !camera.position.y) {
    loadBin();
  }

  // Update ball positions
  for(var i=0; i<balls.length; i++){
    ballMeshes[i].position.copy(balls[i].position);
    ballMeshes[i].quaternion.copy(balls[i].quaternion);
  }

  if (binWallContacts.all) {
    binObject.position.copy(binWallContacts.all.position);
    // binBase.position.copy(binWallContacts.all.position);
  }
  // binObject.quaternion.copy(binWallContacts.top.quaternion);

  // binObject.rotation.x = 0;

  if (cannonDebugRenderer) {
    cannonDebugRenderer.update();      // Update the debug renderer
  }

  // Render our three.js virtual scene
  renderer.clearDepth();
  renderer.render(scene, camera);

  // Kick off the requestAnimationFrame to call this function
  // on the next frame
  requestAnimationFrame(renderObject);
};
