package de.ithandwerk.foldpage

import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

@CapacitorPlugin(name = "ShareTarget")
class ShareTargetPlugin : Plugin() {
    override fun load() {
        instance = this
    }

    @PluginMethod
    fun consume(call: PluginCall) {
        val value = synchronized(lock) {
            pendingValue.also { pendingValue = null }
        }
        call.resolve(JSObject().put("value", value ?: JSONObject.NULL))
    }

    private fun emitShared(value: String) {
        notifyListeners("shared", JSObject().put("value", value), true)
    }

    companion object {
        private val lock = Any()
        private var pendingValue: String? = null
        private var instance: ShareTargetPlugin? = null

        @JvmStatic
        fun queue(intent: Intent?) {
            extractText(intent)?.let { value ->
                synchronized(lock) { pendingValue = value }
            }
        }

        @JvmStatic
        fun emit(intent: Intent?) {
            extractText(intent)?.let { value ->
                val plugin = synchronized(lock) { instance }
                if (plugin == null) {
                    synchronized(lock) { pendingValue = value }
                } else {
                    plugin.emitShared(value)
                }
            }
        }

        private fun extractText(intent: Intent?): String? {
            if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return null
            return intent.getStringExtra(Intent.EXTRA_TEXT)?.takeIf { it.isNotBlank() }
        }
    }
}
