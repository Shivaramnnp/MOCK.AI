package com.shivasruthi.magics.ui.theme

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate

object ThemePreference {
    private const val PREFS = "app_settings"
    private const val KEY   = "theme_mode"

    fun get(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, "system") ?: "system"

    fun set(context: Context, value: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY, value).apply()
        applyToDelegate(value)
    }

    fun applyToDelegate(value: String) {
        val mode = when (value) {
            "light"  -> AppCompatDelegate.MODE_NIGHT_NO
            "dark"   -> AppCompatDelegate.MODE_NIGHT_YES
            else     -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        }
        AppCompatDelegate.setDefaultNightMode(mode)
    }
}
