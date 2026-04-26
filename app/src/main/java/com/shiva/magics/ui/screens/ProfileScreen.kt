package com.shiva.magics.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.shiva.magics.data.model.UserRole
import com.shiva.magics.ui.theme.*
import com.shiva.magics.viewmodel.ProfileUiState
import com.shiva.magics.viewmodel.ProfileViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    profileViewModel: ProfileViewModel,
    onNavigateBack: () -> Unit,
    onSignOut: () -> Unit,
    testsCount: Int = 0,
    avgScore: Int = 0,
    streak: Int = 0
) {
    val profile by profileViewModel.profile.collectAsState()
    val uiState by profileViewModel.uiState.collectAsState()

    var showEditDialog by remember { mutableStateOf(false) }
    var showSignOutDialog by remember { mutableStateOf(false) }
    var showRoleDialog by remember { mutableStateOf(false) }

    val initials = remember(profile.fullName) {
        profile.fullName
            .split(" ")
            .filter { it.isNotBlank() }
            .take(2)
            .joinToString("") { it.first().uppercaseChar().toString() }
            .ifEmpty { profile.email.firstOrNull()?.uppercaseChar()?.toString() ?: "?" }
    }

    val roleGradient = remember(profile.role) {
        when (profile.role) {
            UserRole.TEACHER -> listOf(Color(0xFF4F6EF7), Color(0xFF9B4DFF))
            UserRole.STUDENT -> listOf(Color(0xFF1DB974), Color(0xFF0EA5E9))
            UserRole.LEARNER -> listOf(Color(0xFFFF9500), Color(0xFFFF6B6B))
        }
    }

    // ── Dialogs ───────────────────────────────────────────────────────────────

    if (showEditDialog) {
        EditProfileDialog(
            currentName = profile.fullName,
            currentPhone = profile.phoneNumber,
            onDismiss = { showEditDialog = false },
            onSave = { name, phone ->
                profileViewModel.updateProfile(name, phone)
                showEditDialog = false
            }
        )
    }

    if (showSignOutDialog) {
        AlertDialog(
            onDismissRequest = { showSignOutDialog = false },
            title = { Text("Sign Out?", fontWeight = FontWeight.Bold) },
            text = { Text("You'll need to log in again to access your tests.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showSignOutDialog = false
                        profileViewModel.signOut()
                        onSignOut()
                    }
                ) {
                    Text("Sign Out", color = AccentRed, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showSignOutDialog = false }) {
                    Text("Cancel")
                }
            },
            containerColor = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(20.dp)
        )
    }

    if (showRoleDialog) {
        RoleChangeDialog(
            currentRole = profile.role,
            onDismiss = { showRoleDialog = false },
            onRoleSelected = { role ->
                profileViewModel.saveRole(role)
                showRoleDialog = false
            }
        )
    }

    // ── Main Layout ───────────────────────────────────────────────────────────

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text("Profile", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { showEditDialog = true }) {
                        Icon(Icons.Default.Edit, contentDescription = "Edit Profile", tint = Primary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {

            // ── Avatar Hero Section ───────────────────────────────────────────
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                roleGradient[0].copy(alpha = 0.15f),
                                Color.Transparent
                            )
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    // Avatar
                    Box(
                        modifier = Modifier
                            .size(88.dp)
                            .clip(CircleShape)
                            .background(Brush.linearGradient(roleGradient))
                            .border(3.dp, MaterialTheme.colorScheme.background, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = initials,
                            style = MaterialTheme.typography.headlineLarge.copy(
                                color = Color.White,
                                fontWeight = FontWeight.ExtraBold
                            )
                        )
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    Text(
                        text = profile.fullName.ifEmpty { "No Name Set" },
                        style = MaterialTheme.typography.titleLarge.copy(
                            color = MaterialTheme.colorScheme.onBackground,
                            fontWeight = FontWeight.Bold
                        )
                    )

                    Spacer(modifier = Modifier.height(4.dp))

                    Text(
                        text = profile.email,
                        style = MaterialTheme.typography.bodyMedium.copy(
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    // Role badge
                    RoleBadge(
                        role = profile.role,
                        gradient = roleGradient,
                        onClick = { showRoleDialog = true }
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // ── Profile Completion (Phase 7) ──────────────────────────────────
            val completionScore = listOf(
                profile.fullName.isNotBlank(),
                profile.email.isNotBlank(),
                profile.phoneNumber.isNotBlank()
            ).count { it } * 33 + if (profile.fullName.isNotBlank() && profile.email.isNotBlank() && profile.phoneNumber.isNotBlank()) 1 else 0 // 33, 66, 100

            if (completionScore < 100) {
                Card(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)),
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, Primary.copy(alpha = 0.3f))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text("Profile Completion", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface))
                            Text("$completionScore%", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold, color = Primary))
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        LinearProgressIndicator(
                            progress = { completionScore / 100f },
                            modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(50)),
                            color = Primary,
                            trackColor = Primary.copy(alpha = 0.2f),
                            strokeCap = StrokeCap.Round
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            "Complete your profile to unlock all features. Please add your ${if (profile.fullName.isBlank()) "Name" else if (profile.phoneNumber.isBlank()) "Phone Number" else "Details"}.",
                            style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        com.shiva.magics.ui.components.SecondaryButton(
                            text = "Complete Profile",
                            onClick = { showEditDialog = true },
                            icon = Icons.Default.Edit
                        )
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

            // ── Stats Row ─────────────────────────────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                ProfileStatCard(
                    modifier = Modifier.weight(1f),
                    emoji = "📚",
                    value = "$testsCount",
                    label = "Tests"
                )
                ProfileStatCard(
                    modifier = Modifier.weight(1f),
                    emoji = "⭐",
                    value = "${avgScore}%",
                    label = "Avg Score"
                )
                ProfileStatCard(
                    modifier = Modifier.weight(1f),
                    emoji = "🔥",
                    value = "$streak",
                    label = "Streak"
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // ── Info Section ──────────────────────────────────────────────────
            ProfileSection(title = "Account Info") {
                ProfileInfoRow(
                    icon = Icons.Default.Person,
                    label = "Full Name",
                    value = profile.fullName.ifEmpty { "—" }
                )
                ProfileInfoRow(
                    icon = Icons.Default.Email,
                    label = "Email",
                    value = profile.email.ifEmpty { "—" }
                )
                ProfileInfoRow(
                    icon = Icons.Default.Phone,
                    label = "Phone",
                    value = profile.phoneNumber.ifEmpty { "—" }
                )
                ProfileInfoRow(
                    icon = Icons.Default.Badge,
                    label = "Role",
                    value = "${profile.role.emoji} ${profile.role.displayName}",
                    isLast = true
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // ── Actions Section ───────────────────────────────────────────────
            ProfileSection(title = "Actions") {
                ProfileActionRow(
                    icon = Icons.Default.Edit,
                    label = "Edit Profile",
                    iconTint = Primary,
                    onClick = { showEditDialog = true }
                )
                ProfileActionRow(
                    icon = Icons.Default.SwapHoriz,
                    label = "Change Role",
                    iconTint = AccentGreen,
                    onClick = { showRoleDialog = true }
                )
                ProfileActionRow(
                    icon = Icons.AutoMirrored.Filled.Logout,
                    label = "Sign Out",
                    iconTint = AccentRed,
                    isLast = true,
                    onClick = { showSignOutDialog = true }
                )
            }

            Spacer(modifier = Modifier.height(40.dp))

            // Save state indicator
            AnimatedVisibility(visible = uiState is ProfileUiState.Loading) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                    Text(
                        "Saving...",
                        style = MaterialTheme.typography.labelSmall.copy(
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

// ── Role Badge ────────────────────────────────────────────────────────────────

@Composable
private fun RoleBadge(
    role: UserRole,
    gradient: List<Color>,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(Brush.linearGradient(gradient.map { it.copy(alpha = 0.18f) }))
            .border(1.dp, gradient[0].copy(alpha = 0.5f), RoundedCornerShape(50))
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 6.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(text = role.emoji, fontSize = 14.sp)
            Text(
                text = role.displayName,
                style = MaterialTheme.typography.labelLarge.copy(
                    color = gradient[0],
                    fontWeight = FontWeight.SemiBold
                )
            )
            Icon(
                imageVector = Icons.Default.Edit,
                contentDescription = "Change role",
                tint = gradient[0].copy(alpha = 0.7f),
                modifier = Modifier.size(12.dp)
            )
        }
    }
}

// ── Profile Stat Card ─────────────────────────────────────────────────────────

@Composable
private fun ProfileStatCard(
    modifier: Modifier = Modifier,
    emoji: String,
    value: String,
    label: String
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(16.dp))
            .padding(vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(text = emoji, fontSize = 18.sp)
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium.copy(
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Bold
            )
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        )
    }
}

// ── Profile Section Container ─────────────────────────────────────────────────

@Composable
private fun ProfileSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelLarge.copy(
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.3.sp
            ),
            modifier = Modifier.padding(bottom = 10.dp, start = 4.dp)
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(18.dp))
        ) {
            content()
        }
    }
}

// ── Profile Info Row ──────────────────────────────────────────────────────────

@Composable
private fun ProfileInfoRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
    isLast: Boolean = false
) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 18.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = Primary,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall.copy(
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = value,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Medium
                    )
                )
            }
        }
        if (!isLast) {
            HorizontalDivider(
                modifier = Modifier.padding(start = 50.dp),
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
            )
        }
    }
}

// ── Profile Action Row ────────────────────────────────────────────────────────

@Composable
private fun ProfileActionRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    iconTint: Color,
    isLast: Boolean = false,
    onClick: () -> Unit
) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onClick() }
                .padding(horizontal = 18.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(iconTint.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(18.dp)
                )
            }
            Spacer(modifier = Modifier.width(14.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium.copy(
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Medium
                ),
                modifier = Modifier.weight(1f)
            )
            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp)
            )
        }
        if (!isLast) {
            HorizontalDivider(
                modifier = Modifier.padding(start = 68.dp),
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
            )
        }
    }
}

// ── Edit Profile Dialog ───────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditProfileDialog(
    currentName: String,
    currentPhone: String,
    onDismiss: () -> Unit,
    onSave: (String, String) -> Unit
) {
    var name  by remember { mutableStateOf(currentName) }
    var phone by remember { mutableStateOf(currentPhone) }
    val focusManager = LocalFocusManager.current

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 4.dp
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "Edit Profile",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
                )

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Full Name") },
                    leadingIcon = { Icon(Icons.Default.Person, null, tint = Primary) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
                )

                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("Phone Number") },
                    leadingIcon = { Icon(Icons.Default.Phone, null, tint = Primary) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Phone,
                        imeAction = ImeAction.Done
                    ),
                    keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus() })
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp)
                    ) { Text("Cancel") }

                    Button(
                        onClick = { onSave(name.trim(), phone.trim()) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Primary)
                    ) { Text("Save", color = Color.White) }
                }
            }
        }
    }
}

// ── Role Change Dialog ────────────────────────────────────────────────────────

@Composable
private fun RoleChangeDialog(
    currentRole: UserRole,
    onDismiss: () -> Unit,
    onRoleSelected: (UserRole) -> Unit
) {
    var selected by remember { mutableStateOf(currentRole) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 4.dp
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Text(
                    text = "Change Role",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
                )
                Spacer(modifier = Modifier.height(16.dp))

                UserRole.entries.forEach { role ->
                    val isSelected = selected == role
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                if (isSelected) Primary.copy(alpha = 0.10f) else Color.Transparent
                            )
                            .border(
                                1.dp,
                                if (isSelected) Primary.copy(alpha = 0.5f) else Color.Transparent,
                                RoundedCornerShape(12.dp)
                            )
                            .clickable { selected = role }
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(text = role.emoji, fontSize = 22.sp)
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = role.displayName,
                                style = MaterialTheme.typography.bodyLarge.copy(
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            )
                            Text(
                                text = role.description,
                                style = MaterialTheme.typography.bodySmall.copy(
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            )
                        }
                        RadioButton(
                            selected = isSelected,
                            onClick = { selected = role },
                            colors = RadioButtonDefaults.colors(selectedColor = Primary)
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                }

                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp)
                    ) { Text("Cancel") }

                    Button(
                        onClick = { onRoleSelected(selected) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Primary)
                    ) { Text("Confirm", color = Color.White) }
                }
            }
        }
    }
}
