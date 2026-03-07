package com.shivasruthi.magics.ui.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

// Primary palette — Deep Teal
val Teal10  = Color(0xFF002019)
val Teal20  = Color(0xFF003730)
val Teal40  = Color(0xFF1A7A6E)   // Primary
val Teal80  = Color(0xFF8CDDD4)
val Teal90  = Color(0xFFC8F5EF)   // PrimaryContainer

// Secondary palette — Warm Gold
val Gold10  = Color(0xFF2C1900)
val Gold40  = Color(0xFFC8922A)   // Secondary
val Gold80  = Color(0xFFE8C86A)
val Gold90  = Color(0xFFFDEFC8)   // SecondaryContainer

// Error — Warm Rust
val Rust40  = Color(0xFFC0432A)
val Rust90  = Color(0xFFFFDAD4)

// Neutral — Warm paper tones
val Warm10  = Color(0xFF1A1714)   // Dark ink
val Warm20  = Color(0xFF2E2B27)
val Warm90  = Color(0xFFF5F0E8)   // Background (warm off-white)
val Warm95  = Color(0xFFFDFAF4)   // Surface
val Warm99  = Color(0xFFFFFBF7)

// Accent for timer danger states
val AmberWarn  = Color(0xFFE67E22)
val RedDanger  = Color(0xFFE74C3C)

val LightColorScheme = lightColorScheme(
    primary = Teal40,
    onPrimary = Color.White,
    primaryContainer = Teal90,
    onPrimaryContainer = Teal10,
    secondary = Gold40,
    onSecondary = Color.White,
    secondaryContainer = Gold90,
    onSecondaryContainer = Gold10,
    error = Rust40,
    errorContainer = Rust90,
    background = Warm90,
    onBackground = Warm10,
    surface = Warm95,
    onSurface = Warm10,
    surfaceVariant = Color(0xFFE6DFD7),
    onSurfaceVariant = Color(0xFF4D4740),
    outline = Color(0xFF7F7870),
)

val DarkColorScheme = darkColorScheme(
    primary = Teal80,
    onPrimary = Teal20,
    primaryContainer = Teal40,
    onPrimaryContainer = Teal90,
    secondary = Gold80,
    onSecondary = Gold10,
    secondaryContainer = Gold40,
    onSecondaryContainer = Gold90,
    error = Color(0xFFFFB4AB),
    background = Warm10,
    onBackground = Warm90,
    surface = Color(0xFF1F1C19),
    onSurface = Warm90,
)
