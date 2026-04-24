package com.shiva.magics.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shiva.magics.data.model.UserRole
import com.shiva.magics.ui.theme.*
import com.shiva.magics.viewmodel.ProfileViewModel
import kotlinx.coroutines.delay

@OptIn(ExperimentalAnimationApi::class)
@Composable
fun RoleSelectionScreen(
    profileViewModel: ProfileViewModel,
    onRoleSelected: () -> Unit
) {
    var selectedRole by remember { mutableStateOf<UserRole?>(null) }
    var isSaving     by remember { mutableStateOf(false) }

    // Shimmer entrance animation
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(100)
        visible = true
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFF0A0E1E),
                        Color(0xFF111830),
                        Color(0xFF0A0E1E)
                    )
                )
            )
    ) {
        // Decorative background glow
        Box(
            modifier = Modifier
                .size(340.dp)
                .align(Alignment.TopCenter)
                .offset(y = (-60).dp)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Color(0xFF4F6EF7).copy(alpha = 0.18f),
                            Color.Transparent
                        )
                    ),
                    shape = CircleShape
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
                .statusBarsPadding()
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {

            Spacer(modifier = Modifier.height(52.dp))

            // ── Header ────────────────────────────────────────────────────────
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(600)) + slideInVertically(tween(600)) { -30 }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {

                    // Animated logo badge
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .clip(RoundedCornerShape(22.dp))
                            .background(
                                Brush.linearGradient(
                                    listOf(Color(0xFF4F6EF7), Color(0xFF9B4DFF))
                                )
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.AutoAwesome,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(34.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    Text(
                        text = "Welcome to Mock AI",
                        style = MaterialTheme.typography.headlineMedium.copy(
                            color = Color.White,
                            fontWeight = FontWeight.Bold
                        ),
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = "Choose your role to get started.\nYou can change this later in Profile.",
                        style = MaterialTheme.typography.bodyMedium.copy(
                            color = Color.White.copy(alpha = 0.55f),
                            lineHeight = 22.sp
                        ),
                        textAlign = TextAlign.Center
                    )
                }
            }

            Spacer(modifier = Modifier.height(44.dp))

            // ── Role Cards ────────────────────────────────────────────────────
            UserRole.entries.forEachIndexed { index, role ->
                AnimatedVisibility(
                    visible = visible,
                    enter = fadeIn(tween(400, delayMillis = 150 + index * 100)) +
                            slideInVertically(tween(400, delayMillis = 150 + index * 100)) { 40 }
                ) {
                    RoleCard(
                        role = role,
                        isSelected = selectedRole == role,
                        onClick = { selectedRole = role },
                        modifier = Modifier.padding(bottom = 14.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            // ── Continue Button ───────────────────────────────────────────────
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(tween(400, delayMillis = 500))
            ) {
                val buttonEnabled = selectedRole != null && !isSaving
                Button(
                    onClick = {
                        val role = selectedRole ?: return@Button
                        isSaving = true
                        profileViewModel.saveRole(role)
                        onRoleSelected()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(58.dp),
                    enabled = buttonEnabled,
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.Transparent,
                        disabledContainerColor = Color.White.copy(alpha = 0.08f)
                    ),
                    contentPadding = PaddingValues(0.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .then(
                                if (buttonEnabled)
                                    Modifier.background(
                                        Brush.linearGradient(
                                            listOf(Color(0xFF4F6EF7), Color(0xFF9B4DFF))
                                        ),
                                        RoundedCornerShape(18.dp)
                                    )
                                else Modifier.background(
                                    Color.White.copy(alpha = 0.08f),
                                    RoundedCornerShape(18.dp)
                                )
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        if (isSaving) {
                            CircularProgressIndicator(
                                color = Color.White,
                                modifier = Modifier.size(24.dp),
                                strokeWidth = 2.5.dp
                            )
                        } else {
                            Text(
                                text = if (selectedRole != null) "Continue as ${selectedRole!!.displayName}" else "Select a Role",
                                style = MaterialTheme.typography.titleMedium.copy(
                                    color = Color.White,
                                    fontWeight = FontWeight.SemiBold
                                )
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(48.dp))
        }
    }
}

// ── Role Card ─────────────────────────────────────────────────────────────────

@Composable
private fun RoleCard(
    role: UserRole,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val scale by animateFloatAsState(
        targetValue = if (isSelected) 1.02f else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        label = "roleScale"
    )

    val borderColor by animateColorAsState(
        targetValue = if (isSelected) Color(0xFF4F6EF7) else Color.White.copy(alpha = 0.10f),
        animationSpec = tween(200),
        label = "roleBorder"
    )

    val bgAlpha by animateFloatAsState(
        targetValue = if (isSelected) 0.18f else 0.06f,
        animationSpec = tween(200),
        label = "roleBg"
    )

    val (cardGradientStart, cardGradientEnd) = when (role) {
        UserRole.TEACHER -> Pair(Color(0xFF4F6EF7), Color(0xFF9B4DFF))
        UserRole.STUDENT -> Pair(Color(0xFF1DB974), Color(0xFF0EA5E9))
        UserRole.LEARNER -> Pair(Color(0xFFFF9500), Color(0xFFFF6B6B))
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .scale(scale)
            .clip(RoundedCornerShape(20.dp))
            .border(1.5.dp, borderColor, RoundedCornerShape(20.dp))
            .background(
                if (isSelected)
                    Brush.linearGradient(
                        listOf(
                            cardGradientStart.copy(alpha = bgAlpha),
                            cardGradientEnd.copy(alpha = bgAlpha * 0.6f)
                        )
                    )
                else
                    Brush.linearGradient(
                        listOf(
                            Color.White.copy(alpha = bgAlpha),
                            Color.White.copy(alpha = bgAlpha * 0.5f)
                        )
                    )
            )
            .clickable { onClick() }
            .padding(20.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            // Emoji badge
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(
                                cardGradientStart.copy(alpha = if (isSelected) 0.35f else 0.20f),
                                cardGradientEnd.copy(alpha = if (isSelected) 0.20f else 0.10f)
                            )
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text(text = role.emoji, fontSize = 26.sp)
            }

            // Text
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = role.displayName,
                    style = MaterialTheme.typography.titleMedium.copy(
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                )
                Spacer(modifier = Modifier.height(3.dp))
                Text(
                    text = role.description,
                    style = MaterialTheme.typography.bodySmall.copy(
                        color = Color.White.copy(alpha = 0.58f),
                        lineHeight = 18.sp
                    )
                )
            }

            // Check indicator
            AnimatedVisibility(
                visible = isSelected,
                enter = scaleIn(spring(dampingRatio = Spring.DampingRatioMediumBouncy)) + fadeIn(),
                exit = scaleOut() + fadeOut()
            ) {
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.linearGradient(listOf(cardGradientStart, cardGradientEnd))
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = "Selected",
                        tint = Color.White,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}
