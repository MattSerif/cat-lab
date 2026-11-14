import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { BodyMesh } from "./cat/body";
import { palette } from "./cat/coat";
import { CatMesh } from "./cat/geometry";
import type { Coat, Params } from "./model";

const FOV = 26;
const START_YAW = 52;
const START_PITCH = 14;
/** The bounding sphere of a long cat is loose, so the fit can sit inside it. */
const FIT_MARGIN = 0.82;

export class CatScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly mesh: CatMesh;
  readonly body: BodyMesh;
  readonly controls: OrbitControls;

  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  private cat = new THREE.Group();
  /** Sits on the neck top, so head tilt rolls the head about the neck. */
  private pivot = new THREE.Group();
  private head = new THREE.Mesh();
  private torso = new THREE.Mesh();
  private shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: "#141414", transparent: true, opacity: 0.08, depthWrite: false }),
  );
  private box = new THREE.Box3();
  private sphere = new THREE.Sphere();

  constructor(canvas: HTMLCanvasElement, start: Params) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.NoToneMapping;

    const key = new THREE.DirectionalLight("#ffffff", 1.5);
    key.position.set(-1.4, 2.2, 3);
    this.scene.add(new THREE.AmbientLight("#ffffff", 2.3), key);

    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.mesh = new CatMesh(start);
    this.body = new BodyMesh(start);
    this.head.geometry = this.mesh.geometry;
    this.torso.geometry = this.body.geometry;
    this.head.material = this.torso.material = material;
    this.pivot.add(this.head);
    this.shadow.position.y = 0.002;
    this.cat.add(this.torso, this.pivot, this.shadow);
    this.scene.add(this.cat);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 60;

    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    this.update(start);
    this.frame();
  }

  private resize() {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // narrow screens pull back so the whole cat stays in frame
    this.camera.fov = w < h ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * (h / w))) : FOV;
    this.camera.updateProjectionMatrix();
    this.draw();
  }

  update(p: Params) {
    this.mesh.update(p);
    this.body.update(p);
    this.pivot.position.copy(this.body.neckTop);
    // the dataset's tilt grows clockwise on screen because image y points down
    this.pivot.rotation.z = -THREE.MathUtils.degToRad(p.tilt);
    const [ax, ay, az] = this.mesh.anchor;
    this.head.position.set(-ax, -ay, -az);
    this.shadow.scale.set(p.bodyWidth * 0.9 + 0.3, 1, (p.bodyLength + 1) / 2);
    this.shadow.position.z = -p.bodyLength / 2;

    // the orbit centre follows the cat, and the camera moves with it so the view does not jump
    this.measure();
    const shift = this.sphere.center.clone().sub(this.controls.target);
    this.controls.target.add(shift);
    this.camera.position.add(shift);
  }

  private measure() {
    this.cat.updateMatrixWorld(true);
    this.box.makeEmpty().expandByObject(this.torso).expandByObject(this.head);
    this.box.getBoundingSphere(this.sphere);
  }

  /** Zooms so the whole cat fits, keeping the current viewing direction. */
  frame() {
    const dir = this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-6) this.direction(START_YAW, START_PITCH, dir);
    const half = THREE.MathUtils.degToRad(Math.min(this.camera.fov, FOV) / 2);
    const distance = (this.sphere.radius / Math.sin(half)) * FIT_MARGIN;
    this.camera.position.copy(this.controls.target).addScaledVector(dir.normalize(), distance);
    this.controls.update();
  }

  private direction(yaw: number, pitch: number, out: THREE.Vector3) {
    const y = THREE.MathUtils.degToRad(yaw);
    const x = THREE.MathUtils.degToRad(pitch);
    return out.set(Math.sin(y) * Math.cos(x), Math.sin(x), Math.cos(y) * Math.cos(x));
  }

  setCoat(coat: Coat) {
    const colours = palette(coat);
    const tabby = coat.category === "tabby";
    this.mesh.paint(colours, tabby);
    this.body.paint(colours, tabby);
  }

  /** Puts the camera at a yaw and pitch in degrees, for repeatable checks. Without a distance it fits the cat. */
  view(yaw: number, pitch: number, distance?: number) {
    const dir = this.direction(yaw, pitch, new THREE.Vector3());
    this.camera.position.copy(this.controls.target).add(dir);
    if (distance === undefined) this.frame();
    else this.camera.position.copy(this.controls.target).addScaledVector(dir, distance);
    this.controls.update();
    this.draw();
  }

  /** Resets the viewing direction and fits the cat. */
  home() {
    this.view(START_YAW, START_PITCH);
  }

  private draw() {
    this.renderer.render(this.scene, this.camera);
  }

  exportPng(size = 2048) {
    const canvas = this.renderer.domElement;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.camera.aspect = 1;
    this.camera.fov = FOV;
    this.camera.updateProjectionMatrix();
    this.draw();
    const png = new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
    this.resize();
    return png;
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.draw();
    });
  }
}
