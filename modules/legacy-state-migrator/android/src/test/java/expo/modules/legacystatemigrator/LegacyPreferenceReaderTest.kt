package expo.modules.legacystatemigrator

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class LegacyPreferenceReaderTest {
  private lateinit var context: Context

  @Before
  fun setUp() {
    context = ApplicationProvider.getApplicationContext()
    preferences().edit().clear().commit()
  }

  @After
  fun tearDown() {
    preferences().edit().clear().commit()
  }

  @Test
  fun reportsAbsentWhenPreferenceDoesNotExist() {
    assertEquals(LegacyReadStatus.ABSENT, LegacyPreferenceReader(context).read().status)
  }

  @Test
  fun returnsStoredPayloadWithoutMutatingTheV1Preference() {
    val payload = "{\"stage\":\"w2\"}"
    preferences().edit().putString(STATE_KEY, payload).commit()

    val result = LegacyPreferenceReader(context).read()

    assertEquals(LegacyReadStatus.AVAILABLE, result.status)
    assertEquals(payload, result.payload)
    assertEquals(payload, preferences().getString(STATE_KEY, null))
  }

  @Test
  fun leavesMalformedJsonAvailableForTypeScriptValidationAndRecovery() {
    val malformed = "{\"stage\":"
    preferences().edit().putString(STATE_KEY, malformed).commit()

    assertEquals(malformed, LegacyPreferenceReader(context).read().payload)
  }

  @Test
  fun refusesToBridgeOversizedStateButDoesNotDeleteIt() {
    val oversized = "x".repeat(MAX_STATE_LENGTH + 1)
    preferences().edit().putString(STATE_KEY, oversized).commit()

    val result = LegacyPreferenceReader(context).read()

    assertEquals(LegacyReadStatus.OVERSIZED, result.status)
    assertNull(result.payload)
    assertEquals(oversized, preferences().getString(STATE_KEY, null))
  }

  private fun preferences() = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  companion object {
    private const val PREFERENCES_NAME = "strength_rebuild_preferences"
    private const val STATE_KEY = "strength_rebuild_state"
  }
}
