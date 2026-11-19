import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Anatomy, type BodyParams } from './anatomy';
import { GarmentOverlay, type GarmentKind, type LogoPlacement } from './garmentOverlay';
import type { LoadedModel } from './glbModel';
import { ProceduralMannequin, type BodyMode } from './mannequinMesh';
import { brushedMetal, contactShadowTexture, disposePatterns, mannequinMaterial, walnut, type SurfaceId } from './materials';

/* ================================================================================================
 * The studio: renderer, three-point light rig, environment reflections, stand, floor and camera.
 * Framework-agnostic (the React component only drives it). Renders on demand: a frame is drawn only
 * while something changes (orbit damping, camera snaps, body morphs, animation), which keeps it at
 * 60 fps when busy and idle otherwise.
 * ============================================================================================== */

export type CameraView = 'full' | 'front' | 'back' | 'threeQuarter' | 'collar';

const BASE_TOP = 0.03;
const MORPH_RATE = 11;

function blendParams(cur: BodyParams, target: BodyParams, k: number): boolean {
  let moving = false;
  for (const key of Object.keys(target) as Array<keyof BodyParams>) {
    const d = target[key] - cur[key];
    const tol = key === 'chest' || key === 'waist' || key === 'hips' || key === 'shoulders' || key === 'height' ? 0.02 : 0.0005;
    if (Math.abs(d) <= tol) cur[key] = target[key];
    else {
      cur[key] += d * k;
      moving = true;
    }
  }
  return moving;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class MannequinStudio {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
  private readonly controls: OrbitControls;
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly envTexture: THREE.Texture;
  private readonly rig = new THREE.Group();
  private readonly mannequin: ProceduralMannequin;
  private readonly garment = new GarmentOverlay();

  private surface: SurfaceId = 'fiberglass';
  private bodyMat: THREE.MeshPhysicalMaterial;
  private readonly capMat = walnut();
  private readonly steel = brushedMetal();
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly calfRod: THREE.Mesh;
  private readonly pole: THREE.Mesh;
  private readonly poleCollar: THREE.Mesh;

  private current: BodyParams;
  private target: BodyParams;
  private anatomy: Anatomy;
  private mode: BodyMode = 'full';
  private garmentKind: GarmentKind | null = 'tee';

  private external: LoadedModel | null = null;
  private externalOverride = false;
  private mixer: THREE.AnimationMixer | null = null;
  private playing = false;

  private tween: { from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; t: number; dur: number } | null = null;
  private dirty = true;
  private frame = 0;
  private last = performance.now();
  private decalTimer = 0;
  private morphing = false;
  private readonly resizeObserver: ResizeObserver;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    initial: BodyParams,
  ) {
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    // neutral studio reflections
    this.pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.envTexture = this.pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.42;

    // three-point rig: warm key with soft shadows, cool fill, crisp rim
    const key = new THREE.DirectionalLight('#fff0e0', 2.6);
    key.position.set(2.2, 4.2, 3.0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -1.1;
    key.shadow.camera.right = 1.1;
    key.shadow.camera.top = 2.3;
    key.shadow.camera.bottom = -0.4;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 12;
    key.shadow.radius = 5;
    key.shadow.blurSamples = 16;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.015;
    key.target.position.set(0, 0.9, 0);
    const fill = new THREE.DirectionalLight('#bcd3ff', 0.75);
    fill.position.set(-3.2, 2.0, 2.2);
    fill.target.position.set(0, 1, 0);
    const rim = new THREE.DirectionalLight('#ffffff', 2.1);
    rim.position.set(-0.8, 3.2, -3.6);
    rim.target.position.set(0, 1.1, 0);
    const bounce = new THREE.HemisphereLight('#f4f1ec', '#3a3530', 0.25);
    this.scene.add(key, key.target, fill, fill.target, rim, rim.target, bounce);

    // floor: shadow catcher + soft contact shadow under the stand
    const floorGeo = this.own(new THREE.PlaneGeometry(30, 30));
    const floorMat = this.ownMat(new THREE.ShadowMaterial({ opacity: 0.3 }));
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    const contactTex = contactShadowTexture();
    this.ownedTextures.push(contactTex);
    const contact = new THREE.Mesh(this.own(new THREE.PlaneGeometry(1.1, 1.1)), this.ownMat(new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false })));
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.0015;
    this.scene.add(floor, contact);

    // brushed-metal stand
    const profile = [
      [0, 0],
      [0.255, 0],
      [0.272, 0.003],
      [0.28, 0.011],
      [0.277, 0.02],
      [0.266, 0.027],
      [0.24, BASE_TOP],
      [0, BASE_TOP],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const base = new THREE.Mesh(this.own(new THREE.LatheGeometry(profile, 128)), this.steel);
    base.castShadow = true;
    base.receiveShadow = true;
    this.scene.add(base);

    this.calfRod = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.006, 0.006, 1, 20)), this.steel);
    this.pole = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.013, 0.013, 1, 28)), this.steel);
    this.poleCollar = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.03, 0.022, 0.05, 36)), this.steel);
    for (const m of [this.calfRod, this.pole, this.poleCollar]) {
      m.castShadow = true;
      this.rig.add(m);
    }

    // mannequin + garment
    this.current = { ...initial };
    this.target = { ...initial };
    this.anatomy = new Anatomy(this.current);
    this.bodyMat = mannequinMaterial(this.surface);
    this.mannequin = new ProceduralMannequin(this.bodyMat, this.capMat);
    this.rig.position.y = BASE_TOP;
    this.rig.add(this.mannequin, this.garment);
    this.scene.add(this.rig);
    this.rebuild();

    // camera + damped orbit
    this.camera.position.set(0.9, 1.1, 3.6);
    const controls = (this.controls = new OrbitControls(this.camera, renderer.domElement));
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.35;
    controls.maxDistance = 7;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.target.set(0, 0.95, 0);
    controls.addEventListener('change', () => {
      this.clampTarget();
      this.dirty = true;
    });
    controls.addEventListener('start', () => (this.tween = null));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.snapTo('full', false);
    this.frame = requestAnimationFrame(this.tick);
  }

  // ------------------------------------------------------------------------------- public API

  /** Morphs smoothly to new body parameters. */
  setBody(params: BodyParams) {
    this.target = { ...params };
    this.dirty = true;
  }

  setMode(mode: BodyMode) {
    this.mode = mode;
    this.mannequin.setMode(mode);
    this.rebuild();
  }

  setSurface(id: SurfaceId) {
    if (id === this.surface) return;
    this.surface = id;
    const old = this.bodyMat;
    this.bodyMat = mannequinMaterial(id);
    this.mannequin.setMaterial(this.bodyMat, this.capMat);
    if (this.external && this.externalOverride) this.applyExternalMaterial();
    old.bumpMap?.dispose();
    old.dispose();
    this.dirty = true;
  }

  setGarment(kind: GarmentKind | null) {
    this.garmentKind = kind;
    if (kind) this.garment.setKind(kind);
    this.syncGarmentVisibility();
    if (kind) this.garment.update(this.anatomy);
    this.dirty = true;
  }

  setGarmentColor(hex: string) {
    this.garment.setColor(hex);
    this.dirty = true;
  }

  setLogo(texture: THREE.Texture | null, aspect = 1) {
    this.garment.setLogo(texture, aspect);
    this.dirty = true;
  }

  setLogoPlacement(p: LogoPlacement) {
    this.garment.setPlacement(p);
    this.dirty = true;
  }

  /** Shows an external model instead of the procedural mannequin (or restores the mannequin). */
  setExternalModel(model: LoadedModel | null) {
    if (this.external) {
      this.rig.remove(this.external.root);
      this.mixer?.stopAllAction();
      this.mixer = null;
    }
    this.external = model;
    this.playing = false;
    if (model) {
      this.rig.add(model.root);
      this.fitExternal();
      this.applyExternalMaterial();
      if (model.animations.length) this.mixer = new THREE.AnimationMixer(model.root);
    }
    this.mannequin.visible = !model;
    this.syncGarmentVisibility();
    this.updateStandFittings();
    this.dirty = true;
  }

  /** Replace the external model's own materials with the selected studio surface. */
  setExternalMaterialOverride(on: boolean) {
    this.externalOverride = on;
    this.applyExternalMaterial();
    this.dirty = true;
  }

  /** Plays / pauses the external model's first animation clip. Returns the new playing state. */
  toggleAnimation(): boolean {
    if (!this.mixer || !this.external?.animations.length) return false;
    const action = this.mixer.clipAction(this.external.animations[0]);
    if (!action.isRunning()) {
      action.reset().play();
      action.paused = false;
      this.playing = true;
    } else {
      action.paused = !action.paused;
      this.playing = !action.paused;
    }
    this.last = performance.now();
    this.dirty = true;
    return this.playing;
  }

  snapTo(view: CameraView, animate = true) {
    const H = this.target.height / 100;
    const fovV = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const fit = (half: number) => {
      const d = half / Math.tan(fovV);
      const aspect = this.camera.aspect || 1;
      return aspect < 0.75 ? d * (0.75 / aspect) : d;
    };
    const lift = BASE_TOP;
    const torsoOnly = this.mode === 'dressform' && !this.external;
    const presets: Record<CameraView, { target: THREE.Vector3; dir: THREE.Vector3; dist: number }> = {
      full: torsoOnly
        ? { target: new THREE.Vector3(0, lift + 0.55 * H, 0), dir: new THREE.Vector3(0.3, 0.1, 1), dist: fit(0.38 * H) }
        : { target: new THREE.Vector3(0, lift + 0.5 * H, 0), dir: new THREE.Vector3(0.32, 0.1, 1), dist: fit(0.6 * H) },
      front: { target: new THREE.Vector3(0, lift + 0.66 * H, 0), dir: new THREE.Vector3(0, 0.04, 1), dist: fit(0.27 * H) },
      back: { target: new THREE.Vector3(0, lift + 0.66 * H, 0), dir: new THREE.Vector3(0, 0.06, -1), dist: fit(0.27 * H) },
      threeQuarter: { target: new THREE.Vector3(0, lift + 0.64 * H, 0), dir: new THREE.Vector3(0.82, 0.12, 0.9), dist: fit(0.29 * H) },
      collar: { target: new THREE.Vector3(0, lift + 0.775 * H, 0.03), dir: new THREE.Vector3(0.28, 0.32, 1), dist: fit(0.11 * H) },
    };
    const p = presets[view];
    const pos = p.target.clone().addScaledVector(p.dir.normalize(), p.dist);
    if (!animate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(p.target);
      this.controls.update();
      this.tween = null;
    } else {
      this.tween = { from: [this.camera.position.clone(), this.controls.target.clone()], to: [pos, p.target], t: 0, dur: 0.85 };
    }
    this.dirty = true;
  }

  /** PNG data URL of the current view at the canvas resolution. */
  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    if (this.external) this.rig.remove(this.external.root);
    this.mannequin.dispose();
    this.garment.dispose();
    this.bodyMat.bumpMap?.dispose();
    this.bodyMat.dispose();
    this.capMat.map?.dispose();
    this.capMat.dispose();
    this.steel.roughnessMap?.dispose();
    this.steel.dispose();
    for (const g of this.ownedGeometries) g.dispose();
    for (const m of this.ownedMaterials) m.dispose();
    for (const t of this.ownedTextures) t.dispose();
    disposePatterns();
    this.envTexture.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // ------------------------------------------------------------------------------- internals

  private own<T extends THREE.BufferGeometry>(g: T): T {
    this.ownedGeometries.push(g);
    return g;
  }

  private ownMat<T extends THREE.Material>(m: T): T {
    this.ownedMaterials.push(m);
    return m;
  }

  private syncGarmentVisibility() {
    this.garment.visible = !!this.garmentKind && !this.external;
    this.garment.updateDecal();
  }

  private rebuild() {
    this.anatomy = new Anatomy({ ...this.current });
    this.mannequin.update(this.anatomy);
    if (this.garment.visible) this.garment.update(this.anatomy);
    this.updateStandFittings();
    if (this.external) this.fitExternal();
    this.dirty = true;
  }

  /** Calf rod for the full body, centre pole and collar for the dress form. */
  private updateStandFittings() {
    const a = this.anatomy;
    const full = this.mode === 'full';
    const show = !this.external;
    this.calfRod.visible = show && full;
    this.pole.visible = show && !full;
    this.poleCollar.visible = show && !full;
    if (full) {
      const leg = a.legs[0];
      const top = leg.curve.getPointAt(0.82);
      const bottom = new THREE.Vector3(top.x, -BASE_TOP + 0.001, top.z - 0.075 * a.s);
      const mid = top.clone().add(bottom).multiplyScalar(0.5);
      const dir = top.clone().sub(bottom);
      this.calfRod.position.copy(mid);
      this.calfRod.scale.set(1, dir.length(), 1);
      this.calfRod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    } else {
      const yTop = 0.49 * a.H;
      this.pole.position.set(0, (yTop - BASE_TOP) / 2 - 0.001, -0.005);
      this.pole.scale.set(1, yTop + BASE_TOP, 1);
      this.poleCollar.position.set(0, yTop - 0.02, -0.005);
    }
  }

  private fitExternal() {
    if (!this.external) return;
    const k = this.target.height / 100 / this.external.nativeHeight;
    this.external.root.scale.setScalar(k);
  }

  private applyExternalMaterial() {
    if (!this.external) return;
    this.external.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = this.externalOverride ? this.bodyMat : (m.userData.originalMaterial as THREE.Material);
    });
  }

  private clampTarget() {
    const t = this.controls.target;
    const H = this.target.height / 100;
    t.x = THREE.MathUtils.clamp(t.x, -0.8, 0.8);
    t.z = THREE.MathUtils.clamp(t.z, -0.8, 0.8);
    t.y = THREE.MathUtils.clamp(t.y, 0.05, H + 0.25);
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private readonly tick = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    // body morph: ease the live parameters toward the target
    const moving = blendParams(this.current, this.target, 1 - Math.exp(-dt * MORPH_RATE));
    if (moving) {
      this.anatomy = new Anatomy({ ...this.current });
      this.mannequin.update(this.anatomy);
      if (this.garment.visible) {
        // the decal projection is the costliest step: refresh it a few times a second while morphing
        this.decalTimer += dt;
        const withDecal = this.decalTimer >= 0.12;
        if (withDecal) this.decalTimer = 0;
        this.garment.update(this.anatomy, withDecal);
      }
      this.updateStandFittings();
      if (this.external) this.fitExternal();
      this.dirty = true;
    } else if (this.morphing) {
      // settled: final, exact projection of the artwork
      this.anatomy = new Anatomy({ ...this.current });
      this.mannequin.update(this.anatomy);
      if (this.garment.visible) this.garment.update(this.anatomy);
      this.updateStandFittings();
      this.dirty = true;
    }
    this.morphing = moving;

    // camera snap
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = easeInOut(tw.t);
      this.camera.position.lerpVectors(tw.from[0], tw.to[0], k);
      this.controls.target.lerpVectors(tw.from[1], tw.to[1], k);
      if (tw.t >= 1) this.tween = null;
      this.dirty = true;
    }

    if (this.mixer && this.playing) {
      this.mixer.update(dt);
      this.dirty = true;
    }

    if (this.controls.update()) this.dirty = true;
    if (this.dirty) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
    }
  };
}
