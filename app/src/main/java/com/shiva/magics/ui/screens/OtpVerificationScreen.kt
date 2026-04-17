package com.shiva.magics.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.delay

/**
 * OTP Verification Screen
 *
 * Flow:
 *  1. Screen receives [email] so it can display "OTP sent to <email>".
 *  2. In real production you would trigger a backend/Firebase send here; for this
 *     demo the OTP is already stored in [AuthViewModel.state.generatedOtp] and
 *     printed to Logcat so QA can copy it.
 *  3. User types the 6-digit code. Each digit occupies its own styled box.
 *  4. On "Verify" the ViewModel checks the entered code against the stored OTP.
 *  5. On success [onNavigateToHome] is called; the ViewModel has already created
 *     the Firebase account in [AuthViewModel.verifyOtp].
 */
@OptIn(ExperimentalAnimationApi::class)
@Composable
fun OtpVerificationScreen(
    email: String,
    viewModel: AuthViewModel = viewModel(),
    onNavigateToHome: () -> Unit,
    onNavigateBack: () -> Unit = {}
) {
    val state by viewModel.state.collectAsState()

    // OTP box state — a single string of max 6 digits
    var otpValue by remember { mutableStateOf("") }
    val focusRequester = remember { FocusRequester() }

    // Countdown resend timer (60 seconds)
    var secondsLeft by remember { mutableIntStateOf(60) }
    var canResend by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
        while (secondsLeft > 0) {
            delay(1_000)
            secondsLeft--
        }
        canResend = true
    }

    // Navigate home once OTP is verified and account is created
    LaunchedEffect(state.isOtpVerified) {
        if (state.isOtpVerified) {
            onNavigateToHome()
        }
    }

    // Log OTP for development — remove in production!
    LaunchedEffect(state.generatedOtp) {
        android.util.Log.d("OTP_DEBUG", "Generated OTP: ${state.generatedOtp}")
    }

    val isDark = androidx.compose.foundation.isSystemInDarkTheme()
    val bgColor = if (isDark) BackgroundDark else BackgroundLight
    val textColor = if (isDark) TextLight else TextDark

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = bgColor
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {

            // ── Header ──────────────────────────────────────────────────────
            Icon(
                imageVector = Icons.Default.AutoAwesome,
                contentDescription = "App Logo",
                tint = PrimaryPurple,
                modifier = Modifier.size(64.dp)
            )

            Spacer(modifier = Modifier.height(20.dp))

            Text(
                text = "Verify your email",
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                color = PrimaryPurple
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "We sent a 6-digit code to",
                fontSize = 15.sp,
                color = textColor.copy(alpha = 0.6f),
                textAlign = TextAlign.Center
            )
            Text(
                text = email,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                color = textColor,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(40.dp))

            // ── OTP 6-box input ─────────────────────────────────────────────
            // Hidden BasicTextField drives the value; boxes are overlaid on top
            Box(contentAlignment = Alignment.Center) {
                BasicTextField(
                    value = otpValue,
                    onValueChange = { new ->
                        if (new.length <= 6 && new.all { it.isDigit() }) {
                            otpValue = new
                            // Clear error on new input
                            if (state.otpError != null) {
                                viewModel.onEvent(AuthEvent.ClearFieldErrors)
                            }
                        }
                    },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    cursorBrush = SolidColor(Color.Transparent),
                    modifier = Modifier
                        .focusRequester(focusRequester)
                        .size(1.dp)  // invisible, just captures key events
                )

                // Visible boxes
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    repeat(6) { index ->
                        OtpBox(
                            digit = otpValue.getOrNull(index)?.toString() ?: "",
                            isFocused = index == otpValue.length && otpValue.length < 6,
                            isError = state.otpError != null,
                            textColor = textColor
                        )
                    }
                }
            }

            // ── Error message ────────────────────────────────────────────────
            AnimatedVisibility(
                visible = state.otpError != null,
                enter = fadeIn() + slideInVertically(),
                exit = fadeOut()
            ) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = state.otpError ?: "",
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 12.dp)
                )
            }

            Spacer(modifier = Modifier.height(36.dp))

            // ── Verify Button ────────────────────────────────────────────────
            Button(
                onClick = {
                    viewModel.onEvent(AuthEvent.VerifyOtp(otpValue))
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryPurple),
                shape = RoundedCornerShape(16.dp),
                enabled = otpValue.length == 6 && !state.isLoading
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(
                        color = Color.White,
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Verify OTP",
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // ── Resend section ───────────────────────────────────────────────
            if (canResend) {
                TextButton(
                    onClick = {
                        // Regenerate a new OTP (simulated; in production re-trigger API)
                        otpValue = ""
                        secondsLeft = 60
                        canResend = false
                        viewModel.onEvent(AuthEvent.Submit) // re-runs registration validation → new OTP
                    }
                ) {
                    Text("Resend OTP", color = PrimaryPurple, fontWeight = FontWeight.SemiBold)
                }
            } else {
                Text(
                    text = "Resend OTP in ${secondsLeft}s",
                    fontSize = 14.sp,
                    color = textColor.copy(alpha = 0.5f)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // ── Back link ────────────────────────────────────────────────────
            TextButton(onClick = onNavigateBack) {
                Text(
                    text = "← Change email",
                    color = textColor.copy(alpha = 0.5f),
                    fontSize = 14.sp
                )
            }
        }
    }
}

// ── Single OTP digit box ──────────────────────────────────────────────────────
@Composable
private fun OtpBox(
    digit: String,
    isFocused: Boolean,
    isError: Boolean,
    textColor: Color
) {
    val borderColor = when {
        isError -> MaterialTheme.colorScheme.error
        isFocused -> PrimaryPurple
        digit.isNotEmpty() -> SecondaryPurple
        else -> Color.Gray.copy(alpha = 0.4f)
    }
    val bgColor = when {
        isError -> MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.15f)
        digit.isNotEmpty() -> PrimaryPurple.copy(alpha = 0.08f)
        else -> Color.Transparent
    }

    // Pulsing border animation for focused box
    val infiniteTransition = rememberInfiniteTransition(label = "otp_pulse")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 1f, targetValue = 0.3f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "border_alpha"
    )

    Box(
        modifier = Modifier
            .size(width = 44.dp, height = 54.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(bgColor)
            .border(
                width = if (isFocused) 2.dp else 1.5.dp,
                color = if (isFocused) borderColor.copy(alpha = alpha) else borderColor,
                shape = RoundedCornerShape(12.dp)
            ),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = digit,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            color = textColor,
            textAlign = TextAlign.Center
        )
    }
}
