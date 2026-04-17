package com.shiva.magics.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// --- Theme Colors ---
val PrimaryPurple = Color(0xFF6C4AB6)
val SecondaryPurple = Color(0xFF8D72E1)
val AccentPurple = Color(0xFFB9A6FF)
val TextDark = Color(0xFF1A1A1A)
val TextLight = Color(0xFFFFFFFF)
val BackgroundLight = Color(0xFFFFFFFF)
val BackgroundDark = Color(0xFF121212)

// --- State Classes ---
enum class AuthMode { LOGIN, REGISTER }

data class AuthState(
    val mode: AuthMode = AuthMode.LOGIN,
    val fullName: String = "",
    val phoneNumber: String = "",
    val email: String = "",
    val username: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isSuccess: Boolean = false,
    // Per-field inline validation errors
    val usernameError: String? = null,  // used as email error in LOGIN mode
    val emailError: String? = null,     // used in REGISTER mode
    val passwordError: String? = null,
    // OTP flow
    val generatedOtp: String = "",
    val otpError: String? = null,
    val navigateToOtp: Boolean = false,   // one-shot signal to push OTP screen
    val isOtpVerified: Boolean = false    // signals OTP screen to finish
)

// --- ViewModel ---
class AuthViewModel : ViewModel() {
    private val _state = MutableStateFlow(AuthState())
    val state: StateFlow<AuthState> = _state.asStateFlow()

    fun onEvent(event: AuthEvent) {
        when (event) {
            is AuthEvent.FullNameChanged -> _state.update { it.copy(fullName = event.name) }
            is AuthEvent.PhoneNumberChanged -> _state.update { it.copy(phoneNumber = event.phone) }
            is AuthEvent.EmailChanged -> _state.update { it.copy(email = event.email) }
            is AuthEvent.UsernameChanged -> _state.update { it.copy(username = event.username) }
            is AuthEvent.PasswordChanged -> _state.update { it.copy(password = event.password) }
            is AuthEvent.ToggleMode -> _state.update { 
                it.copy(
                    mode = if (it.mode == AuthMode.LOGIN) AuthMode.REGISTER else AuthMode.LOGIN,
                    errorMessage = null
                ) 
            }
            AuthEvent.Submit -> submit()
            AuthEvent.ClearError -> _state.update { it.copy(errorMessage = null) }
            AuthEvent.ClearFieldErrors -> _state.update {
                it.copy(usernameError = null, emailError = null, passwordError = null, otpError = null)
            }
            is AuthEvent.OtpChanged -> _state.update { it.copy(otpError = null) }
            AuthEvent.OtpNavigationHandled -> _state.update { it.copy(navigateToOtp = false) }
            is AuthEvent.VerifyOtp -> verifyOtp(event.enteredOtp)
        }
    }

    private fun submit() {
        val currentState = _state.value

        // Clear previous field errors before re-validating
        _state.update { it.copy(usernameError = null, emailError = null, passwordError = null, errorMessage = null) }

        val auth = com.google.firebase.auth.FirebaseAuth.getInstance()
        val db = com.google.firebase.firestore.FirebaseFirestore.getInstance()

        if (currentState.mode == AuthMode.LOGIN) {
            // --- Login validation ---
            var hasError = false

            if (currentState.username.isBlank()) {
                _state.update { it.copy(usernameError = "Please enter your email") }
                hasError = true
            } else if (!currentState.username.contains("@") || !currentState.username.contains(".")) {
                _state.update { it.copy(usernameError = "Invalid email format") }
                hasError = true
            }
            if (currentState.password.isBlank()) {
                _state.update { it.copy(passwordError = "Please enter your password") }
                hasError = true
            }
            if (hasError) return

            _state.update { it.copy(isLoading = true) }
            auth.signInWithEmailAndPassword(currentState.username, currentState.password)
                .addOnSuccessListener {
                    _state.update { it.copy(isLoading = false, isSuccess = true) }
                }
                .addOnFailureListener { e ->
                    _state.update { it.copy(isLoading = false, errorMessage = e.localizedMessage) }
                }
        } else {
            // --- Register validation ---
            var hasError = false

            if (currentState.fullName.isBlank()) {
                _state.update { it.copy(errorMessage = "Please enter your full name") }
                hasError = true
            }
            if (currentState.phoneNumber.isBlank()) {
                _state.update { it.copy(errorMessage = "Please enter your phone number") }
                hasError = true
            }
            if (currentState.email.isBlank()) {
                _state.update { it.copy(emailError = "Please enter your email") }
                hasError = true
            } else if (!currentState.email.contains("@") || !currentState.email.contains(".")) {
                _state.update { it.copy(emailError = "Invalid email format") }
                hasError = true
            }
            if (currentState.password.isBlank()) {
                _state.update { it.copy(passwordError = "Please enter your password") }
                hasError = true
            } else if (currentState.password.length < 6) {
                _state.update { it.copy(passwordError = "Password must be at least 6 characters") }
                hasError = true
            }
            if (hasError) return

            // Generate OTP and navigate to verification screen
            val otp = generateOtp()
            _state.update { it.copy(generatedOtp = otp, navigateToOtp = true) }
            // NOTE: Firebase account creation is deferred until OTP is verified
        }
    }

    /** Generates a cryptographically-random 6-digit OTP. */
    private fun generateOtp(): String =
        (100_000..999_999).random().toString()

    /**
     * Called from OtpVerificationScreen after the user enters the code.
     * On success: creates the Firebase account then signals navigation to Home.
     */
    fun verifyOtp(enteredOtp: String) {
        val currentState = _state.value
        if (enteredOtp.isBlank()) {
            _state.update { it.copy(otpError = "Please enter the OTP") }
            return
        }
        if (enteredOtp != currentState.generatedOtp) {
            _state.update { it.copy(otpError = "Incorrect OTP. Please try again.") }
            return
        }

        // OTP matched — now create the Firebase account
        val auth = com.google.firebase.auth.FirebaseAuth.getInstance()
        val db = com.google.firebase.firestore.FirebaseFirestore.getInstance()

        _state.update { it.copy(isLoading = true, otpError = null) }
        auth.createUserWithEmailAndPassword(currentState.email, currentState.password)
            .addOnSuccessListener { result ->
                val userPath = result.user?.uid ?: return@addOnSuccessListener
                val userData = hashMapOf(
                    "fullName" to currentState.fullName,
                    "phoneNumber" to currentState.phoneNumber,
                    "email" to currentState.email,
                    "username" to currentState.username,
                    "createdAt" to System.currentTimeMillis()
                )
                db.collection("users").document(userPath)
                    .set(userData)
                    .addOnSuccessListener {
                        _state.update { it.copy(isLoading = false, isOtpVerified = true) }
                    }
                    .addOnFailureListener { e ->
                        _state.update { it.copy(isLoading = false, errorMessage = "Failed to save data: ${e.localizedMessage}") }
                    }
            }
            .addOnFailureListener { e ->
                _state.update { it.copy(isLoading = false, otpError = e.localizedMessage) }
            }
    }
}

// --- Events ---
sealed class AuthEvent {
    data class FullNameChanged(val name: String) : AuthEvent()
    data class PhoneNumberChanged(val phone: String) : AuthEvent()
    data class EmailChanged(val email: String) : AuthEvent()
    data class UsernameChanged(val username: String) : AuthEvent()
    data class PasswordChanged(val password: String) : AuthEvent()
    object ToggleMode : AuthEvent()
    object Submit : AuthEvent()
    object ClearError : AuthEvent()
    object ClearFieldErrors : AuthEvent()
    // OTP events
    data class OtpChanged(val otp: String) : AuthEvent()
    object OtpNavigationHandled : AuthEvent()
    data class VerifyOtp(val enteredOtp: String) : AuthEvent()
}

// --- UI Composable ---
@OptIn(ExperimentalAnimationApi::class, ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    viewModel: AuthViewModel = viewModel(),
    onNavigateToHome: () -> Unit,
    onNavigateToForgotPassword: () -> Unit = {},
    onNavigateToOtpVerification: (email: String) -> Unit = {}
) {
    val state by viewModel.state.collectAsState()
    val isDarkTheme = isSystemInDarkTheme()
    val scrollState = rememberScrollState()
    val focusManager = LocalFocusManager.current

    // Handle Navigation on Success (login path)
    LaunchedEffect(state.isSuccess) {
        if (state.isSuccess) {
            onNavigateToHome()
        }
    }

    // Navigate to OTP screen after register submit passes validation
    LaunchedEffect(state.navigateToOtp) {
        if (state.navigateToOtp) {
            viewModel.onEvent(AuthEvent.OtpNavigationHandled)
            onNavigateToOtpVerification(state.email)
        }
    }

    // Dynamic Colors based on theme
    val backgroundColor = if (isDarkTheme) BackgroundDark else BackgroundLight
    val textColor = if (isDarkTheme) TextLight else TextDark

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = backgroundColor
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp)
                .verticalScroll(scrollState),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            
            // --- 1. Top Section ---
            Icon(
                imageVector = Icons.Default.AutoAwesome, // Placeholder for AI Logo
                contentDescription = "App Logo",
                tint = PrimaryPurple,
                modifier = Modifier.size(72.dp)
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Text(
                text = "Mock AI",
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                color = PrimaryPurple
            )
            
            Text(
                text = "Practice smarter. Perform better.",
                fontSize = 16.sp,
                color = textColor.copy(alpha = 0.7f),
                modifier = Modifier.padding(top = 8.dp, bottom = 32.dp)
            )

            // --- Error Message ---
            AnimatedVisibility(visible = state.errorMessage != null) {
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp)
                ) {
                    Text(
                        text = state.errorMessage ?: "",
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(12.dp),
                        textAlign = TextAlign.Center
                    )
                }
            }

            // --- 2. Input Fields ---
            
            // Animated visibility for Registration specific fields
            AnimatedVisibility(visible = state.mode == AuthMode.REGISTER) {
                Column {
                    CustomTextField(
                        value = state.fullName,
                        onValueChange = { viewModel.onEvent(AuthEvent.FullNameChanged(it)) },
                        label = "Full Name",
                        icon = Icons.Default.Person,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                        keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    CustomTextField(
                        value = state.phoneNumber,
                        onValueChange = { viewModel.onEvent(AuthEvent.PhoneNumberChanged(it)) },
                        label = "Phone Number",
                        icon = Icons.Default.Phone,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Next),
                        keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
                    )
                    Spacer(modifier = Modifier.height(16.dp))

                    CustomTextField(
                        value = state.email,
                        onValueChange = {
                            viewModel.onEvent(AuthEvent.EmailChanged(it))
                            if (state.emailError != null) viewModel.onEvent(AuthEvent.ClearFieldErrors)
                        },
                        label = "Email Address",
                        icon = Icons.Default.Email,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                        keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
                        errorMessage = state.emailError
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                }
            }

            CustomTextField(
                value = state.username,
                onValueChange = {
                    viewModel.onEvent(AuthEvent.UsernameChanged(it))
                    if (state.usernameError != null) viewModel.onEvent(AuthEvent.ClearFieldErrors)
                },
                label = if (state.mode == AuthMode.LOGIN) "Email" else "Username",
                icon = if (state.mode == AuthMode.LOGIN) Icons.Default.Email else Icons.Default.AccountCircle,
                keyboardOptions = KeyboardOptions(
                    keyboardType = if (state.mode == AuthMode.LOGIN) KeyboardType.Email else KeyboardType.Text,
                    imeAction = ImeAction.Next
                ),
                keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) }),
                errorMessage = state.usernameError
            )
            
            Spacer(modifier = Modifier.height(16.dp))

            var passwordVisible by remember { mutableStateOf(false) }
            CustomTextField(
                value = state.password,
                onValueChange = {
                    viewModel.onEvent(AuthEvent.PasswordChanged(it))
                    if (state.passwordError != null) viewModel.onEvent(AuthEvent.ClearFieldErrors)
                },
                label = "Password",
                icon = Icons.Default.Lock,
                isPassword = true,
                passwordVisible = passwordVisible,
                onPasswordVisibilityToggle = { passwordVisible = !passwordVisible },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = {
                    focusManager.clearFocus()
                    viewModel.onEvent(AuthEvent.Submit)
                }),
                errorMessage = state.passwordError
            )

            // Forgot Password (Only in Login Mode)
            AnimatedVisibility(visible = state.mode == AuthMode.LOGIN) {
                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.CenterEnd
                ) {
                    TextButton(onClick = onNavigateToForgotPassword) {
                        Text("Forgot Password?", color = PrimaryPurple)
                    }
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            // --- 3. Buttons ---
            val primaryText = if (state.mode == AuthMode.LOGIN) "Login" else "Create Account"

            Button(
                onClick = { 
                    focusManager.clearFocus()
                    viewModel.onEvent(AuthEvent.Submit) 
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryPurple),
                shape = RoundedCornerShape(16.dp),
                enabled = !state.isLoading
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(
                        color = Color.White,
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    Text(text = primaryText, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedButton(
                onClick = { 
                    focusManager.clearFocus()
                    viewModel.onEvent(AuthEvent.ToggleMode) 
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = PrimaryPurple),
                border = BorderStroke(1.dp, PrimaryPurple)
            ) {
                Text(
                    text = if (state.mode == AuthMode.LOGIN) "Create Account" else "Back to Login", 
                    fontSize = 16.sp, 
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Google Sign In Placeholder
            OutlinedButton(
                onClick = { /* TODO: Google Sign In */ },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = TextDark),
                border = BorderStroke(1.dp, Color.LightGray)
            ) {
                Icon(
                    imageVector = Icons.Default.Email, // Using Email icon as placeholder for Google
                    contentDescription = "Google Icon",
                    tint = Color.Unspecified
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(text = "Continue with Google", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = textColor)
            }

            Spacer(modifier = Modifier.weight(1f))

            // --- 5. Footer ---
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.padding(vertical = 24.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Bolt,
                    contentDescription = null,
                    tint = AccentPurple,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "Powered by AI",
                    fontSize = 12.sp,
                    color = textColor.copy(alpha = 0.5f),
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    icon: ImageVector,
    isPassword: Boolean = false,
    passwordVisible: Boolean = false,
    onPasswordVisibilityToggle: () -> Unit = {},
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    errorMessage: String? = null
) {
    val isError = errorMessage != null
    Column {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            leadingIcon = { Icon(imageVector = icon, contentDescription = label, tint = if (isError) MaterialTheme.colorScheme.error else PrimaryPurple) },
            trailingIcon = if (isPassword) {
                {
                    IconButton(onClick = onPasswordVisibilityToggle) {
                        Icon(
                            imageVector = if (passwordVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                            contentDescription = "Toggle Password Visibility",
                            tint = if (isError) MaterialTheme.colorScheme.error else PrimaryPurple
                        )
                    }
                }
            } else null,
            visualTransformation = if (isPassword && !passwordVisible) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            isError = isError,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PrimaryPurple,
                focusedLabelColor = PrimaryPurple,
                cursorColor = PrimaryPurple,
                focusedLeadingIconColor = PrimaryPurple
            ),
            singleLine = true,
            supportingText = if (isError) {
                {
                    Text(
                        text = errorMessage!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            } else null
        )
    }
}

@androidx.compose.ui.tooling.preview.Preview(showBackground = true)
@Composable
fun LoginScreenPreview() {
    LoginScreen(onNavigateToHome = {})
}
