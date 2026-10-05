package com.margelo.nitro.flicko.facelive

import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.SystemClock
import android.util.Log
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarkerResult
import com.margelo.nitro.NitroModules
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.public.NativeFrame
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.max

/*
 * Live MediaPipe Face Landmarker for the camera's frame processor.
 *
 * - LIVE_STREAM with one face; results arrive on MediaPipe's thread.
 * - One frame in flight: while the detector is busy (or the fps cap isn't due) new
 *   frames are dropped before any conversion work.
 * - Timestamps come from the monotonic clock and are forced strictly increasing.
 * - Only the latest result is kept; JS reads it when `process` reports a new sequence.
 * - GPU delegate first, CPU if the GPU can't be created; if neither starts, `ready`
 *   stays false and the app keeps ML Kit.
 */
@DoNotStrip
@Keep
class HybridLiveFaceTracker(maxFps: Double) : HybridLiveFaceTrackerSpec() {
  private val minIntervalMs = if (maxFps > 0) (1000.0 / maxFps).toLong() else 0L
  private val inFlight = AtomicBoolean(false)
  private val offered = AtomicLong()
  private val processed = AtomicLong()
  private val dropped = AtomicLong()
  private val errors = AtomicLong()
  private val stalls = AtomicLong()
  private val seq = AtomicLong()

  @Volatile private var snapshot = emptySnapshot()
  @Volatile private var wantLandmarks = false
  @Volatile private var submittedAt = 0L
  @Volatile private var submittedPrepMs = 0L
  @Volatile private var submittedRotation = 0
  @Volatile private var submittedWidth = 0
  @Volatile private var submittedHeight = 0
  @Volatile private var ready = false
  private var lastSubmitAt = 0L
  private var lastTimestamp = 0L
  private var delegateName = "none"
  private var landmarker: FaceLandmarker? = null

  init {
    createLandmarker()
  }

  private fun createLandmarker() {
    val context = NitroModules.applicationContext?.applicationContext
    if (context == null) {
      Log.w(TAG, "no application context; live tracking unavailable")
      return
    }
    val model = try {
      context.assets.open(MODEL_ASSET).use { input ->
        val bytes = input.readBytes()
        ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).apply {
          put(bytes)
          rewind()
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "can't read $MODEL_ASSET", e)
      return
    }
    for (delegate in listOf(Delegate.GPU, Delegate.CPU)) {
      try {
        val base = BaseOptions.builder()
          .setModelAssetBuffer(model.duplicate())
          .setDelegate(delegate)
          .build()
        val options = FaceLandmarker.FaceLandmarkerOptions.builder()
          .setBaseOptions(base)
          .setRunningMode(RunningMode.LIVE_STREAM)
          .setNumFaces(1)
          .setMinFaceDetectionConfidence(0.5f)
          .setOutputFaceBlendshapes(true)
          .setOutputFacialTransformationMatrixes(true)
          .setResultListener { result, _ -> onResult(result) }
          .setErrorListener { e -> onError(e) }
          .build()
        landmarker = FaceLandmarker.createFromOptions(context, options)
        delegateName = delegate.name
        ready = true
        Log.i(TAG, "live face landmarker ready on $delegate")
        return
      } catch (e: Exception) {
        Log.w(TAG, "live face landmarker failed on $delegate", e)
      }
    }
    Log.w(TAG, "live face landmarker could not start; ML Kit stays in use")
  }

  override fun process(frame: HybridFrameSpec): Double {
    offered.incrementAndGet()
    val detector = landmarker
    if (!ready || detector == null) return seq.get().toDouble()
    val now = SystemClock.elapsedRealtime()
    // MediaPipe can drop a frame without ever calling the result listener, which would leave
    // "one frame in flight" set forever; give up on it after a short while.
    if (inFlight.get() && now - submittedAt > STALL_MS) {
      Log.w(TAG, "no result for ${now - submittedAt} ms; unblocking")
      stalls.incrementAndGet()
      inFlight.set(false)
    }
    if (now - lastSubmitAt < minIntervalMs || !inFlight.compareAndSet(false, true)) {
      dropped.incrementAndGet()
      return seq.get().toDouble()
    }
    try {
      val native = frame as? NativeFrame ?: throw IllegalStateException("not a NativeFrame")
      val proxy = native.image
      val rotation = proxy.imageInfo.rotationDegrees
      val raw = proxy.toBitmap()
      // Rotate upright ourselves (Matrix rotation is clockwise, like CameraX's
      // rotationDegrees) and scale down in the same pass; MediaPipe's own rotation option
      // has a different convention, which gave an upside-down mesh on device.
      val longEdge = max(raw.width, raw.height)
      val scale = if (longEdge > MAX_EDGE) MAX_EDGE.toFloat() / longEdge else 1f
      val matrix = Matrix().apply {
        postScale(scale, scale)
        postRotate(rotation.toFloat())
      }
      val bitmap = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, matrix, true)
      if (bitmap !== raw) raw.recycle()
      submittedWidth = bitmap.width
      submittedHeight = bitmap.height
      submittedRotation = rotation
      var timestamp = now
      if (timestamp <= lastTimestamp) timestamp = lastTimestamp + 1
      lastTimestamp = timestamp
      lastSubmitAt = now
      submittedAt = SystemClock.elapsedRealtime()
      submittedPrepMs = submittedAt - now
      processed.incrementAndGet()
      detector.detectAsync(BitmapImageBuilder(bitmap).build(), timestamp)
    } catch (e: Exception) {
      inFlight.set(false)
      onError(RuntimeException(e))
    }
    return seq.get().toDouble()
  }

  private fun onResult(result: FaceLandmarkerResult) {
    try {
      val withPoints = wantLandmarks
      val matrices = result.facialTransformationMatrixes().orElse(null)
      val blendshapes = result.faceBlendshapes().orElse(null)
      val faces = result.faceLandmarks().mapIndexed { i, points ->
        var minX = 1f
        var minY = 1f
        var maxX = 0f
        var maxY = 0f
        for (p in points) {
          minX = minOf(minX, p.x())
          minY = minOf(minY, p.y())
          maxX = maxOf(maxX, p.x())
          maxY = maxOf(maxY, p.y())
        }
        // Iris centres (468, 473); eye-corner midpoints if the model has no iris points.
        fun centre(iris: Int, a: Int, b: Int): DoubleArray {
          val p = if (points.size > iris) points[iris] else null
          return if (p != null) doubleArrayOf(p.x().toDouble(), p.y().toDouble())
          else doubleArrayOf(
            (points[a].x() + points[b].x()) / 2.0,
            (points[a].y() + points[b].y()) / 2.0,
          )
        }
        val left = centre(468, 33, 133)
        val right = centre(473, 362, 263)
        val matrix = matrices?.getOrNull(i)
        val euler = matrix?.let { eulerFrom(it) } ?: doubleArrayOf(0.0, 0.0)
        val roll = Math.toDegrees(atan2(right[1] - left[1], right[0] - left[0]))
        val scores = blendshapes?.getOrNull(i)
        fun blink(name: String) =
          scores?.firstOrNull { it.categoryName() == name }?.score()?.toDouble() ?: 0.0
        var flat = DoubleArray(0)
        if (withPoints) {
          flat = DoubleArray(points.size * 3)
          for ((k, p) in points.withIndex()) {
            flat[k * 3] = p.x().toDouble()
            flat[k * 3 + 1] = p.y().toDouble()
            flat[k * 3 + 2] = p.z().toDouble()
          }
        }
        LiveFace(
          box = doubleArrayOf(
            minX.toDouble(), minY.toDouble(), (maxX - minX).toDouble(), (maxY - minY).toDouble(),
          ),
          leftEye = left,
          rightEye = right,
          roll = roll,
          yaw = euler[0],
          pitch = euler[1],
          headPose = matrix?.let { m -> DoubleArray(m.size) { m[it].toDouble() } } ?: DoubleArray(0),
          eyeBlinkLeft = blink("eyeBlinkLeft"),
          eyeBlinkRight = blink("eyeBlinkRight"),
          landmarks = flat,
        )
      }
      val finishedAt = SystemClock.elapsedRealtime()
      snapshot = LiveFaceSnapshot(
        seq = (seq.get() + 1).toDouble(),
        timestampMs = submittedAt.toDouble(),
        inferenceMs = (finishedAt - submittedAt).toDouble(),
        prepMs = submittedPrepMs.toDouble(),
        width = submittedWidth.toDouble(),
        height = submittedHeight.toDouble(),
        sensorRotation = submittedRotation.toDouble(),
        faces = faces.toTypedArray(),
      )
      seq.incrementAndGet()
    } catch (e: Exception) {
      Log.w(TAG, "live result failed", e)
      errors.incrementAndGet()
    } finally {
      inFlight.set(false)
    }
  }

  private fun onError(e: RuntimeException) {
    Log.w(TAG, "live face landmarker error", e)
    // Three errors and the tracker retires for this session; the app falls back to ML Kit.
    if (errors.incrementAndGet() >= MAX_ERRORS) ready = false
    inFlight.set(false)
  }

  /*
   * Yaw and pitch (degrees) from MediaPipe's column-major 4x4 facial transformation
   * matrix. Approximate; roll comes from the iris line instead.
   */
  private fun eulerFrom(m: FloatArray): DoubleArray {
    if (m.size < 16) return doubleArrayOf(0.0, 0.0)
    val r20 = m[2].toDouble()
    val yaw = Math.toDegrees(asin((-r20).coerceIn(-1.0, 1.0)))
    val pitch = Math.toDegrees(atan2(m[6].toDouble(), m[10].toDouble()))
    return doubleArrayOf(yaw, if (abs(pitch) > 180) 0.0 else pitch)
  }

  override fun latest(): LiveFaceSnapshot = snapshot

  override fun stats() = LiveStats(
    offered = offered.get().toDouble(),
    processed = processed.get().toDouble(),
    dropped = dropped.get().toDouble(),
    errors = errors.get().toDouble(),
    stalls = stalls.get().toDouble(),
    delegate = delegateName,
    ready = ready,
  )

  override fun setWantLandmarks(want: Boolean) {
    wantLandmarks = want
  }

  companion object {
    private const val TAG = "FlickoFaceLive"
    private const val MODEL_ASSET = "face_landmarker.task"
    private const val MAX_EDGE = 480
    private const val MAX_ERRORS = 3
    private const val STALL_MS = 400L

    private fun emptySnapshot() = LiveFaceSnapshot(
      seq = 0.0,
      timestampMs = 0.0,
      inferenceMs = 0.0,
      prepMs = 0.0,
      width = 0.0,
      height = 0.0,
      sensorRotation = 0.0,
      faces = emptyArray(),
    )
  }
}
