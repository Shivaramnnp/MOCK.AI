package com.shiva.magics.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

@Composable
fun MagicSTheme(
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val savedTheme = remember {
        ThemePreference.get(context)
    }
    val darkTheme = when (savedTheme) {
        "dark"  -> true
        "light" -> false
        else    -> isSystemInDarkTheme()
    }

    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = AppTypography,
        shapes = Shapes,
        content = content
    )
}
