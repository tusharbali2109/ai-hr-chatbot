"use client";

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export type FaceMonitorReason = "no_face_detected" | "multiple_faces_detected" | "looking_away";

export interface FaceMonitorOptions {
  onViolation: (reason: FaceMonitorReason) => void;
  /** Consecutive bad detections (~one every DETECT_INTERVAL_MS) required
   * before a violation fires — filters a single-frame blip (a blink, a
   * quick glance) from genuinely sustained looking-away/no-face/multi-face. */
  consecutiveFramesRequired?: number;
}

export interface FaceMonitorHandle {
  stop: () => void;
}

const DETECT_INTERVAL_MS = 600;
const DEFAULT_CONSECUTIVE_FRAMES = 3; // ~1.8s sustained at the interval above

// Landmark-ratio head-orientation proxy, not pixel-accurate eye-gaze
// tracking (MediaPipe's transformation-matrix output has an ambiguous
// row/column-major convention that can't be resolved reliably without a
// live camera to validate against, whereas comparing raw landmark
// positions is convention-free and easy to reason about). These
// thresholds are a reasonable starting point, not calibrated against real
// footage — tune HORIZONTAL_TURN_RATIO/VERTICAL_TILT_RATIO after testing
// with an actual webcam if they trigger too eagerly or too rarely.
const HORIZONTAL_TURN_RATIO = 0.22;
const VERTICAL_TILT_RATIO = 0.28;

// Standard MediaPipe 468-point face mesh landmark indices.
const NOSE_TIP = 1;
const RIGHT_CHEEK = 234;
const LEFT_CHEEK = 454;
const FOREHEAD = 10;
const CHIN = 152;

const MODEL_ASSET_PATH = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_BASE_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

/** Module-level singleton — the model/WASM download (a few MB) only
 * happens once per page session even if the monitor is stopped/restarted
 * (e.g. a re-render), rather than once per start() call. */
function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE_PATH).then((fileset) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_ASSET_PATH, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 2,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      })
    );
  }
  return landmarkerPromise;
}

function isLookingAway(landmarks: { x: number; y: number }[]): boolean {
  const nose = landmarks[NOSE_TIP];
  const right = landmarks[RIGHT_CHEEK];
  const left = landmarks[LEFT_CHEEK];
  const top = landmarks[FOREHEAD];
  const chin = landmarks[CHIN];
  if (!nose || !right || !left || !top || !chin) return false;

  const faceWidth = Math.abs(left.x - right.x);
  const faceHeight = Math.abs(chin.y - top.y);
  if (faceWidth < 1e-3 || faceHeight < 1e-3) return false;

  const horizontalOffset = Math.abs(nose.x - (left.x + right.x) / 2) / faceWidth;
  const verticalOffset = Math.abs(nose.y - (top.y + chin.y) / 2) / faceHeight;

  return horizontalOffset > HORIZONTAL_TURN_RATIO || verticalOffset > VERTICAL_TILT_RATIO;
}

/** Runs MediaPipe FaceLandmarker against a live <video> element on a
 * throttled requestAnimationFrame loop, reporting sustained (not
 * single-frame) violations: no face in frame, more than one face in
 * frame, or the one face present oriented away from the screen.
 * Best-effort — any setup/runtime failure (no WebGL/WASM support, model
 * fetch failure, transient detection error) is swallowed so a candidate
 * still gets to do the interview, just without this extra signal; the
 * tab/window/paste checks in VideoInterviewRunner still apply regardless. */
export function startFaceMonitor(video: HTMLVideoElement, options: FaceMonitorOptions): FaceMonitorHandle {
  let stopped = false;
  let rafId: number | null = null;
  let landmarker: FaceLandmarker | null = null;
  let lastDetectAt = 0;
  const consecutiveRequired = options.consecutiveFramesRequired ?? DEFAULT_CONSECUTIVE_FRAMES;
  const streaks: Record<FaceMonitorReason, number> = { no_face_detected: 0, multiple_faces_detected: 0, looking_away: 0 };

  function bump(reason: FaceMonitorReason, hit: boolean) {
    streaks[reason] = hit ? streaks[reason] + 1 : 0;
    if (streaks[reason] === consecutiveRequired) options.onViolation(reason);
  }

  function loop(timestamp: number) {
    if (stopped) return;
    rafId = requestAnimationFrame(loop);
    if (!landmarker || video.readyState < 2 || timestamp - lastDetectAt < DETECT_INTERVAL_MS) return;
    lastDetectAt = timestamp;

    try {
      const result = landmarker.detectForVideo(video, timestamp);
      const faces = result.faceLandmarks;
      bump("no_face_detected", faces.length === 0);
      bump("multiple_faces_detected", faces.length > 1);
      bump("looking_away", faces.length === 1 && isLookingAway(faces[0]));
    } catch {
      // A transient single-frame detection failure is not itself a violation.
    }
  }

  getFaceLandmarker()
    .then((created) => {
      if (stopped) return; // stop() already ran — leave the shared singleton alone, don't close() it
      landmarker = created;
    })
    .catch(() => {
      // No WebGL/WASM support, or the model/WASM fetch failed.
    });

  rafId = requestAnimationFrame(loop);

  return {
    stop() {
      stopped = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      landmarker = null;
    },
  };
}
