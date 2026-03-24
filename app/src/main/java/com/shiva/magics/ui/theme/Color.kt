package com.shiva.magics.ui.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

// ── Brand / Accent ────────────────────────────────────────────────────────────
val Primary        = Color(0xFF4F6EF7)   // Indigo-blue — trust, focus
val PrimaryVariant = Color(0xFF9B4DFF)   // Purple — used in gradient end
val AccentGreen    = Color(0xFF1DB974)   // Correct answers, success, streaks
val AccentAmber    = Color(0xFFFF9500)   // Warnings, skipped, coming-soon
val AccentRed      = Color(0xFFFF3B4E)   // Wrong answers, errors — use SPARINGLY

// ── Light theme surfaces ───────────────────────────────────────────────────────
val Surface        = Color(0xFFF5F7FF)   // App background — very light lavender-white
val SurfaceElev1   = Color(0xFFFFFFFF)   // Cards
val SurfaceElev2   = Color(0xFFF0F2FF)   // Elevated cards, bottom sheets
val SurfaceElev3   = Color(0xFFE8ECF8)   // Input fills, chips, nav items
val OnSurface      = Color(0xFF0F1320)   // Primary text
val OnSurfaceMuted = Color(0xFF7B83A6)   // Secondary text, hints
val Border         = Color(0xFFE0E4F4)   // Subtle dividers/strokes

// ── Dark theme surfaces (kept for reference but not used by default) ───────────
val DarkSurface     = Color(0xFF0F1117)
val DarkSurfaceElev1 = Color(0xFF171B26)
val DarkSurfaceElev2 = Color(0xFF1E2335)
val DarkSurfaceElev3 = Color(0xFF252A3D)
val DarkOnSurface   = Color(0xFFE8EAF2)
val DarkOnSurfaceMuted = Color(0xFF8892AA)
val DarkBorder      = Color(0xFF2A2F45)

// ── Light color scheme ────────────────────────────────────────────────────────
val LightColorScheme = lightColorScheme(
    primary                = Primary,
    onPrimary              = Color.White,
    primaryContainer       = Color(0xFFDDE4FF),
    onPrimaryContainer     = Color(0xFF001258),
    secondary              = PrimaryVariant,
    onSecondary            = Color.White,
    secondaryContainer     = Color(0xFFEFDFFF),
    onSecondaryContainer   = Color(0xFF2A004E),
    tertiary               = AccentGreen,
    onTertiary             = Color.White,
    tertiaryContainer      = Color(0xFFB7F5D5),
    onTertiaryContainer    = Color(0xFF002115),
    error                  = AccentRed,
    onError                = Color.White,
    errorContainer         = Color(0xFFFFDAD9),
    onErrorContainer       = Color(0xFF410002),
    background             = Surface,
    onBackground           = OnSurface,
    surface                = SurfaceElev1,
    onSurface              = OnSurface,
    surfaceVariant         = SurfaceElev2,
    onSurfaceVariant       = OnSurfaceMuted,
    outline                = Border,
    outlineVariant         = SurfaceElev3,
    scrim                  = Color(0x52000000),
    inverseSurface         = DarkSurfaceElev1,
    inverseOnSurface       = DarkOnSurface,
    inversePrimary         = PrimaryVariant,
    surfaceTint            = Primary,
    surfaceBright          = SurfaceElev1,
    surfaceDim             = SurfaceElev2,
    surfaceContainer       = SurfaceElev2,
    surfaceContainerHigh   = SurfaceElev3,
    surfaceContainerHighest = Color(0xFFDDE4FF),
)

// ── Dark color scheme (kept for future use) ───────────────────────────────────
val DarkColorScheme = darkColorScheme(
    primary                = Primary,
    onPrimary              = Color.White,
    primaryContainer       = DarkSurfaceElev1,
    onPrimaryContainer     = DarkOnSurface,
    secondary              = PrimaryVariant,
    onSecondary            = Color.White,
    secondaryContainer     = DarkSurfaceElev2,
    onSecondaryContainer   = DarkOnSurface,
    tertiary               = AccentGreen,
    onTertiary             = Color.White,
    tertiaryContainer      = DarkSurfaceElev2,
    onTertiaryContainer    = DarkOnSurface,
    error                  = AccentRed,
    onError                = Color.White,
    errorContainer         = DarkSurfaceElev2,
    onErrorContainer       = DarkOnSurface,
    background             = DarkSurface,
    onBackground           = DarkOnSurface,
    surface                = DarkSurfaceElev1,
    onSurface              = DarkOnSurface,
    surfaceVariant         = DarkSurfaceElev2,
    onSurfaceVariant       = DarkOnSurfaceMuted,
    outline                = DarkBorder,
    outlineVariant         = DarkSurfaceElev3,
    scrim                  = DarkSurface,
    inverseSurface         = DarkOnSurface,
    inverseOnSurface       = DarkSurface,
    inversePrimary         = DarkSurface,
    surfaceTint            = Primary,
    surfaceBright          = DarkSurfaceElev2,
    surfaceDim             = DarkSurface,
    surfaceContainer       = DarkSurfaceElev1,
    surfaceContainerHigh   = DarkSurfaceElev2,
    surfaceContainerHighest = DarkSurfaceElev3,
)
