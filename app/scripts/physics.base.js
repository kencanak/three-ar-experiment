const EventEmitter = require('events');

class PhysicsBase {
  constructor(arScene, opt) {
    this.opt = {
      debug: false
    };

    this.arScene = arScene;

    this.world = null;
    this.groundBody = null;

    this.cannonDebugRenderer = null;

    this.opt = { ...this.opt, ...opt };

    // events emitter
    this.events = new EventEmitter();

    this.init();
  }

  init() {
    // Setup our world
    this.world = new CANNON.World();
    this.world.quatNormalizeSkip = 0;
    this.world.quatNormalizeFast = false;
    this.world.defaultContactMaterial.contactEquationStiffness = 1e9;
    this.world.defaultContactMaterial.contactEquationRelaxation = 4;

    const solver = new CANNON.GSSolver();
    solver.iterations = 7;
    solver.tolerance = 0.1;

    const split = true;

    if(split) {
      this.world.solver = new CANNON.SplitSolver(solver);
    } else {
      this.world.solver = solver;
    }

    this.world.gravity.set(0,-10,0);
    this.world.broadphase = new CANNON.NaiveBroadphase();

    // Create a plane
    const groundShape = new CANNON.Plane();
    this.groundBody = new CANNON.Body({ mass: 0 });
    this.groundBody.addShape(groundShape);
    this.groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
    this.world.addBody(this.groundBody);

    if (this.opt.debug) {
      this.cannonDebugRenderer = new THREE.CannonDebugRenderer(this.arScene, this.world);
    }

    this.events.emit('physicsbase-ready');
  }

  render() {
    // update the physics
    this.world.step(1/90);

    if (this.opt.debug) {
      // we need to render the debugger
      this.cannonDebugRenderer.update();
    }
  }
}

export default PhysicsBase;