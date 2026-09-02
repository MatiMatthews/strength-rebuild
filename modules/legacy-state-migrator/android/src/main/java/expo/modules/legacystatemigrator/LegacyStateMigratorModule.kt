package expo.modules.legacystatemigrator

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LegacyStateMigratorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LegacyStateMigrator")

    Function("readLegacyState") {
      val context = requireNotNull(appContext.reactContext) {
        "Legacy state cannot be read before the React context is available."
      }
      val result = LegacyPreferenceReader(context).read()
      mapOf(
        "status" to result.status.wireValue,
        "payload" to result.payload,
      )
    }
  }
}
