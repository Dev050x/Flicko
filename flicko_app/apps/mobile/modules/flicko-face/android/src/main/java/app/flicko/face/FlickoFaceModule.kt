package app.flicko.face

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.SystemClock
import androidx.exifinterface.media.ExifInterface
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarkerResult
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.InputStream

/**
 * `detectFaces(uri)` for still photos. AsyncFunctions run on the module's background
 * queue, never the main thread. The photo is decoded upright and as displayed (EXIF
 * rotation and mirror flips applied, e.g. front-camera shots), downscaled to at most
 * 1920px on the long side, so normalised coordinates line up with what the user sees.
 */
class FlickoFaceModule : Module() {
  private var tracker: FaceTracker? = null
  private val lock = Any()

  private fun tracker(context: Context): FaceTracker =
    tracker ?: FaceTracker.create(context).also { tracker = it }

  override fun definition() = ModuleDefinition {
    Name("FlickoFace")

    AsyncFunction("detectFaces") { uri: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val started = SystemClock.elapsedRealtime()
      val bitmap = loadUpright(context, uri)
      val decodedMs = SystemClock.elapsedRealtime() - started
      val (result, delegate) = synchronized(lock) {
        val t = tracker(context)
        t.detect(bitmap) to t.delegate.name
      }
      mapOf(
        "faces" to toFaces(result),
        "width" to bitmap.width,
        "height" to bitmap.height,
        "decodeMs" to decodedMs,
        "totalMs" to (SystemClock.elapsedRealtime() - started),
        "delegate" to delegate,
      )
    }

    OnDestroy {
      synchronized(lock) {
        tracker?.close()
        tracker = null
      }
    }
  }

  /**
   * Per face: landmarks flattened as [x, y, z, x, y, z, ...] (478 points, normalised to
   * the displayed photo; the JS side turns them into objects), the 4x4 facial
   * transformation matrix as MediaPipe packs it (column-major), the 52 blendshape
   * scores, and a normalised box from the landmark extents.
   */
  private fun toFaces(result: FaceLandmarkerResult): List<Map<String, Any>> {
    val matrices = result.facialTransformationMatrixes().orElse(null)
    val blendshapes = result.faceBlendshapes().orElse(null)
    return result.faceLandmarks().mapIndexed { i, landmarks ->
      val flat = ArrayList<Double>(landmarks.size * 3)
      var minX = 1f
      var minY = 1f
      var maxX = 0f
      var maxY = 0f
      for (p in landmarks) {
        flat.add(p.x().toDouble())
        flat.add(p.y().toDouble())
        flat.add(p.z().toDouble())
        minX = minOf(minX, p.x())
        minY = minOf(minY, p.y())
        maxX = maxOf(maxX, p.x())
        maxY = maxOf(maxY, p.y())
      }
      mapOf(
        "landmarks" to flat,
        "matrix" to (matrices?.getOrNull(i)?.map { it.toDouble() } ?: emptyList()),
        "blendshapes" to (
          blendshapes?.getOrNull(i)?.associate { it.categoryName() to it.score().toDouble() }
            ?: emptyMap()
          ),
        "box" to mapOf(
          "x" to minX.toDouble(),
          "y" to minY.toDouble(),
          "width" to (maxX - minX).toDouble(),
          "height" to (maxY - minY).toDouble(),
        ),
      )
    }
  }

  private fun open(context: Context, uri: String): InputStream {
    val parsed = if (uri.startsWith("/")) Uri.fromFile(java.io.File(uri)) else Uri.parse(uri)
    return context.contentResolver.openInputStream(parsed)
      ?: throw IllegalArgumentException("can't open $uri")
  }

  private fun loadUpright(context: Context, uri: String): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    open(context, uri).use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2

    val decoded = open(context, uri).use {
      BitmapFactory.decodeStream(
        it,
        null,
        BitmapFactory.Options().apply {
          inSampleSize = sample
          inPreferredConfig = Bitmap.Config.ARGB_8888
        },
      )
    } ?: throw IllegalArgumentException("can't decode $uri")

    val orientation = open(context, uri).use {
      ExifInterface(it).getAttributeInt(
        ExifInterface.TAG_ORIENTATION,
        ExifInterface.ORIENTATION_NORMAL,
      )
    }
    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> {
        matrix.postRotate(90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
      ExifInterface.ORIENTATION_TRANSVERSE -> {
        matrix.postRotate(-90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(-90f)
    }
    if (matrix.isIdentity) return decoded
    return Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
      .also { if (it !== decoded) decoded.recycle() }
  }

  companion object {
    private const val MAX_SIDE = 1920
  }
}
