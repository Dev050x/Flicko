package com.margelo.nitro.flicko.facelive

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip

@DoNotStrip
@Keep
class HybridLiveFaceTrackerFactory : HybridLiveFaceTrackerFactorySpec() {
  @DoNotStrip
  @Keep
  override fun create(maxFps: Double): HybridLiveFaceTrackerSpec = HybridLiveFaceTracker(maxFps)
}
