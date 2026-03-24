package com.shivasruthi.magics.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

val Shapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),   // Chips, small badges
    small = RoundedCornerShape(8.dp),      // Small buttons
    medium = RoundedCornerShape(12.dp),    // Buttons, option cards
    large = RoundedCornerShape(16.dp),     // Main cards
    extraLarge = RoundedCornerShape(24.dp)  // Bottom sheets, dialogs
)
