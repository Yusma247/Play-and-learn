// Camera and MediaPipe hand / face tracking. Everything runs on the device.
// Video frames are never saved or sent anywhere.
import { FilesetResolver, HandLandmarker, FaceLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';
import { syntheticHand } from './fingers.js';

const CDN = {
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
};

// ?mock=3 pretends a hand with 3 fingers is shown, ?mock=head moves a fake head. Used for tests and demos.
const MOCK = new URLSearchParams(location.search).get('mock');

const abs = (p) => new URL(p, document.baseURI).href;

// Use the model file shipped with the app when it is there, otherwise download it once.
async function modelUrl(kind) {
  const local = abs(`vendor/${kind}_landmarker.task`);
  try {
    const r = await fetch(local, { method: 'HEAD' });
    if (r.ok) return local;
  } catch (e) { /* offline or missing */ }
  return CDN[kind];
}

export class Vision {
  constructor() {
    this.video = document.createElement('video');
    this.video.id = 'cam';
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
    this.stream = null;
    this.facing = 'user';
    this.fileset = null;
    this.models = { hand: null, face: null };
    this.pending = {};
    this.lastVideoTime = -1;
    this.lastTs = 0;
    this.last = { hand: null, face: null, fresh: false };
  }

  get mocked() { return !!MOCK; }
  get hasCamera() { return !!this.stream || !!MOCK; }
  get aspect() {
    const v = this.video;
    return v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 4 / 3;
  }

  async startCamera(facing = 'user') {
    if (MOCK) return;
    if (this.stream && this.facing === facing) { await this.ensurePlaying(); return; }
    this.stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no-camera-api');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    this.facing = facing;
    this.video.srcObject = this.stream;
    this.video.classList.toggle('mirror', facing === 'user');
    await this.video.play();
    this.lastVideoTime = -1;
  }

  // A video that is taken out of the page is paused by the browser. Park it in a hidden holder instead,
  // and start it again if it was paused, so the pointer keeps moving from one game to the next.
  park() {
    let h = document.getElementById('cam-holder');
    if (!h) {
      h = document.createElement('div');
      h.id = 'cam-holder';
      h.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none';
      document.body.appendChild(h);
    }
    if (this.video.parentNode !== h) h.appendChild(this.video);
  }

  async ensurePlaying() {
    if (!this.stream) return;
    if (!this.video.isConnected) this.park();
    if (this.video.paused) { try { await this.video.play(); } catch (e) { /* retried next game */ } }
  }

  stopCamera() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  // Load a model: kind is 'hand' or 'face'.
  async load(kind) {
    if (MOCK || this.models[kind]) return;
    if (this.pending[kind]) return this.pending[kind];
    this.pending[kind] = (async () => {
      if (!this.fileset) this.fileset = await FilesetResolver.forVisionTasks(abs('vendor/mediapipe/wasm'));
      const modelAssetPath = await modelUrl(kind);
      const Cls = kind === 'hand' ? HandLandmarker : FaceLandmarker;
      const extra = kind === 'hand'
        ? { numHands: 1, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 }
        : { numFaces: 1, outputFaceBlendshapes: true };
      const make = (delegate) => Cls.createFromOptions(this.fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        ...extra,
      });
      try { this.models[kind] = await make('GPU'); } catch (e) { this.models[kind] = await make('CPU'); }
    })();
    try { await this.pending[kind]; } finally { delete this.pending[kind]; }
  }

  // Look at the newest camera frame. Returns {hand, face, fresh}.
  detect(wantHand, wantFace) {
    const now = performance.now();
    if (MOCK) {
      const n = Number(MOCK);
      const hand = wantHand && !Number.isNaN(n) ? syntheticHand(n) : null;
      const face = MOCK === 'head'
        ? { nose: { x: 0.5 + 0.04 * Math.cos(now / 900), y: 0.5 + 0.04 * Math.sin(now / 900) }, jawOpen: 0 }
        : null;
      this.last = { hand, face, fresh: true };
      return this.last;
    }
    const v = this.video;
    if (!this.stream || v.readyState < 2 || v.currentTime === this.lastVideoTime) {
      // no new picture: keep the last result for a moment, then forget it so a pointer never freezes on old data
      const stale = now - (this.lastFreshAt || 0) > 500;
      this.last = stale ? { hand: null, face: null, fresh: false } : { ...this.last, fresh: false };
      if (stale && this.stream && v.paused) this.ensurePlaying();
      return this.last;
    }
    this.lastFreshAt = now;
    this.lastVideoTime = v.currentTime;
    const ts = Math.max(now, this.lastTs + 1);
    this.lastTs = ts;
    let hand = null, face = null;
    try {
      if (wantHand && this.models.hand) {
        const r = this.models.hand.detectForVideo(v, ts);
        hand = r.landmarks && r.landmarks[0] ? r.landmarks[0] : null;
      }
      if (wantFace && this.models.face) {
        const r = this.models.face.detectForVideo(v, ts);
        if (r.faceLandmarks && r.faceLandmarks[0]) {
          const jaw = r.faceBlendshapes && r.faceBlendshapes[0]
            ? r.faceBlendshapes[0].categories.find(c => c.categoryName === 'jawOpen') : null;
          face = { nose: r.faceLandmarks[0][1], jawOpen: jaw ? jaw.score : 0 };
        }
      }
    } catch (e) {
      console.warn('detect failed', e);
    }
    this.last = { hand, face, fresh: true };
    return this.last;
  }
}
