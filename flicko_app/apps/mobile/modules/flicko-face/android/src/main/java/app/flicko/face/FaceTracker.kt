package app.flicko.face

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarkerResult
import java.io.Closeable
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * The one MediaPipe Face Landmarker wrapper in the app. Still photos use it in IMAGE
 * mode today; the live camera frame processor will create it in LIVE_STREAM mode and
 * the 3D filters will read the same results (478 landmarks, the facial transformation
 * matrix and 52 blendshapes per face).
 *
 * Not thread-safe: callers serialise access (one detection at a time per instance).
 */
class FaceTracker private constructor(
  private val landmarker: FaceLandmarker,
  val delegate: Delegate,
  val runningMode: RunningMode,
) : Closeable {

  /** Still image (RunningMode.IMAGE). */
  fun detect(bitmap: Bitmap): FaceLandmarkerResult =
    landmarker.detect(BitmapImageBuilder(bitmap).build())

  /** Live frames (RunningMode.LIVE_STREAM); results arrive on the result listener. */
  fun detectAsync(image: MPImage, timestampMs: Long) =
    landmarker.detectAsync(image, timestampMs)

  override fun close() = landmarker.close()

  companion object {
    private const val TAG = "FlickoFace"
    private const val MODEL_ASSET = "face_landmarker.task"
    private const val MIN_DETECTION_CONFIDENCE = 0.5f

    /** The model is read once and shared by every tracker. */
    @Volatile private var model: ByteBuffer? = null

    private fun model(context: Context): ByteBuffer =
      model ?: synchronized(this) {
        model ?: context.assets.open(MODEL_ASSET).use { input ->
          val bytes = input.readBytes()
          ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).apply {
            put(bytes)
            rewind()
          }
        }.also { model = it }
      }

    /**
     * GPU delegate first; if the device can't create it, fall back to the CPU.
     */
    fun create(
      context: Context,
      runningMode: RunningMode = RunningMode.IMAGE,
      numFaces: Int = 5,
      onResult: ((FaceLandmarkerResult, MPImage) -> Unit)? = null,
      onError: ((RuntimeException) -> Unit)? = null,
    ): FaceTracker {
      var lastError: Exception? = null
      for (delegate in listOf(Delegate.GPU, Delegate.CPU)) {
        try {
          val base = BaseOptions.builder()
            .setModelAssetBuffer(model(context).duplicate())
            .setDelegate(delegate)
            .build()
          val options = FaceLandmarker.FaceLandmarkerOptions.builder()
            .setBaseOptions(base)
            .setRunningMode(runningMode)
            .setNumFaces(numFaces)
            .setMinFaceDetectionConfidence(MIN_DETECTION_CONFIDENCE)
            .setOutputFaceBlendshapes(true)
            .setOutputFacialTransformationMatrixes(true)
            .apply {
              if (runningMode == RunningMode.LIVE_STREAM) {
                onResult?.let { listener ->
                  setResultListener { result, image -> listener(result, image) }
                }
                onError?.let { listener -> setErrorListener { e -> listener(e) } }
              }
            }
            .build()
          val landmarker = FaceLandmarker.createFromOptions(context, options)
          Log.i(TAG, "face landmarker ready on $delegate ($runningMode)")
          return FaceTracker(landmarker, delegate, runningMode)
        } catch (e: Exception) {
          Log.w(TAG, "face landmarker failed on $delegate", e)
          lastError = e
        }
      }
      throw IllegalStateException("could not create the face landmarker", lastError)
    }
  }
}
