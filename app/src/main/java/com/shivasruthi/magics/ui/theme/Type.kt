package com.shivasruthi.magics.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.googlefonts.Font
import androidx.compose.ui.text.googlefonts.GoogleFont
import androidx.compose.ui.unit.sp
import com.shivasruthi.magics.R

private val GeminiProvider = GoogleFont.Provider(
    providerAuthority = "com.google.android.gms.fonts",
    providerPackage = "com.google.android.gms",
    certificates = R.array.com_google_android_gms_fonts_certs
)

// Syne — display font, geometric, premium feel
val SyneFamily = FontFamily(
    Font(GoogleFont("Syne"), GeminiProvider, FontWeight.Normal),
    Font(GoogleFont("Syne"), GeminiProvider, FontWeight.SemiBold),
    Font(GoogleFont("Syne"), GeminiProvider, FontWeight.Bold),
    Font(GoogleFont("Syne"), GeminiProvider, FontWeight.ExtraBold),
)

// DM Sans — clean, highly legible body font
val DmSansFamily = FontFamily(
    Font(GoogleFont("DM Sans"), GeminiProvider, FontWeight.Normal),
    Font(GoogleFont("DM Sans"), GeminiProvider, FontWeight.Medium),
    Font(GoogleFont("DM Sans"), GeminiProvider, FontWeight.SemiBold),
)

// DM Mono — timers, labels, code-style elements
val DmMonoFamily = FontFamily(
    Font(GoogleFont("DM Mono"), GeminiProvider, FontWeight.Normal),
    Font(GoogleFont("DM Mono"), GeminiProvider, FontWeight.Medium),
)

val AppTypography = Typography(
    displayLarge  = TextStyle(fontFamily = SyneFamily,  fontWeight = FontWeight.ExtraBold, fontSize = 57.sp, lineHeight = 64.sp),
    displayMedium = TextStyle(fontFamily = SyneFamily,  fontWeight = FontWeight.Bold,      fontSize = 45.sp, lineHeight = 52.sp),
    displaySmall  = TextStyle(fontFamily = SyneFamily,  fontWeight = FontWeight.Bold,      fontSize = 36.sp, lineHeight = 44.sp),
    headlineLarge = TextStyle(fontFamily = SyneFamily,  fontWeight = FontWeight.SemiBold,  fontSize = 32.sp, lineHeight = 40.sp),
    headlineMedium= TextStyle(fontFamily = SyneFamily,  fontWeight = FontWeight.SemiBold,  fontSize = 28.sp, lineHeight = 36.sp),
    headlineSmall = TextStyle(fontFamily = SyneFamily,  fontWeight = FontWeight.SemiBold,  fontSize = 24.sp, lineHeight = 32.sp),
    titleLarge    = TextStyle(fontFamily = SyneFamily,  fontWeight = FontWeight.SemiBold,  fontSize = 22.sp, lineHeight = 28.sp),
    titleMedium   = TextStyle(fontFamily = DmSansFamily,fontWeight = FontWeight.SemiBold,  fontSize = 16.sp, lineHeight = 24.sp),
    titleSmall    = TextStyle(fontFamily = DmSansFamily,fontWeight = FontWeight.Medium,    fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge     = TextStyle(fontFamily = DmSansFamily,fontWeight = FontWeight.Normal,    fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium    = TextStyle(fontFamily = DmSansFamily,fontWeight = FontWeight.Normal,    fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall     = TextStyle(fontFamily = DmSansFamily,fontWeight = FontWeight.Normal,    fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge    = TextStyle(fontFamily = DmMonoFamily,fontWeight = FontWeight.Medium,    fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.5.sp),
    labelMedium   = TextStyle(fontFamily = DmMonoFamily,fontWeight = FontWeight.Medium,    fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.5.sp),
    labelSmall    = TextStyle(fontFamily = DmMonoFamily,fontWeight = FontWeight.Normal,    fontSize = 11.sp, lineHeight = 16.sp, letterSpacing = 1.sp),
)
