package expo.modules.legacystatemigrator

import android.content.Context

internal const val PREFERENCES_NAME = "strength_rebuild_preferences"
internal const val STATE_KEY = "strength_rebuild_state"
internal const val MAX_STATE_LENGTH = 1_000_000

internal enum class LegacyReadStatus(val wireValue: String) {
  ABSENT("absent"),
  AVAILABLE("available"),
  OVERSIZED("oversized"),
}

internal data class LegacyReadResult(
  val status: LegacyReadStatus,
  val payload: String? = null,
)

internal class LegacyPreferenceReader(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  fun read(): LegacyReadResult {
    val payload = preferences.getString(STATE_KEY, null)
      ?: return LegacyReadResult(LegacyReadStatus.ABSENT)

    if (payload.length > MAX_STATE_LENGTH) {
      return LegacyReadResult(LegacyReadStatus.OVERSIZED)
    }

    return LegacyReadResult(LegacyReadStatus.AVAILABLE, payload)
  }
}
