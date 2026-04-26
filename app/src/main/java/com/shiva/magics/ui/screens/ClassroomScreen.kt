package com.shiva.magics.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.navigation.NavController
import com.shiva.magics.data.model.ClassModel
import com.shiva.magics.data.model.UserRole
import com.shiva.magics.ui.components.MockAiBottomNav
import com.shiva.magics.ui.navigation.AppRoutes
import com.shiva.magics.ui.theme.*
import com.shiva.magics.viewmodel.ClassroomViewModel
import com.shiva.magics.viewmodel.ProfileViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClassroomScreen(
    navController: NavController,
    classroomViewModel: ClassroomViewModel,
    profileViewModel: ProfileViewModel
) {
    val state   by classroomViewModel.state.collectAsState()
    val profile by profileViewModel.profile.collectAsState()
    val role    = profile.role

    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(role) {
        when (role) {
            UserRole.TEACHER -> classroomViewModel.listenTeacherClasses()
            UserRole.STUDENT -> classroomViewModel.listenStudentClasses()
            UserRole.LEARNER -> {}
        }
    }

    LaunchedEffect(state.snackMessage) {
        state.snackMessage?.let {
            snackbarHostState.showSnackbar(it)
            classroomViewModel.clearSnack()
        }
    }

    var showCreateDialog by remember { mutableStateOf(false) }
    var showJoinDialog   by remember { mutableStateOf(false) }

    if (showCreateDialog) {
        CreateClassDialog(
            onDismiss = { showCreateDialog = false },
            onCreate  = { name ->
                classroomViewModel.createClass(name)
                showCreateDialog = false
            }
        )
    }

    if (showJoinDialog) {
        JoinClassDialog(
            studentName = profile.fullName,
            onDismiss   = { showJoinDialog = false },
            onJoin      = { code ->
                classroomViewModel.joinClass(code, profile.fullName)
                showJoinDialog = false
            }
        )
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        floatingActionButton = {
            if (role == UserRole.TEACHER) {
                ExtendedFloatingActionButton(
                    onClick = { showCreateDialog = true },
                    containerColor = Primary,
                    contentColor = Color.White,
                    icon = { Icon(Icons.Default.Add, null) },
                    text = { Text("New Class", fontWeight = FontWeight.SemiBold) }
                )
            }
        },
        bottomBar = { MockAiBottomNav(navController = navController, role = role) }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(bottom = 16.dp)
        ) {

            // ── Header ────────────────────────────────────────────────────────
            item {
                ClassroomHeader(role = role, classCount = state.classes.size)
            }

            // ── Student: join class card ──────────────────────────────────────
            if (role == UserRole.STUDENT || role == UserRole.LEARNER) {
                item {
                    JoinClassHeroCard(
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                        onClick = { showJoinDialog = true }
                    )
                }
            }

            // ── Loading ───────────────────────────────────────────────────────
            if (state.isLoading && state.classes.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(top = 60.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = Primary)
                    }
                }
            }

            // ── Empty state ───────────────────────────────────────────────────
            if (!state.isLoading && state.classes.isEmpty()) {
                item {
                    val emptyStateData = if (role == UserRole.TEACHER) {
                        Triple("No Classes Yet", "Create your first class to start managing your students.", "Create a Class")
                    } else {
                        Triple("Ready to join?", "Enter the 6-character code from your teacher to enroll in a class.", "Join a Class")
                    }
                    
                    com.shiva.magics.ui.components.EmptyStateView(
                        title = emptyStateData.first,
                        message = emptyStateData.second,
                        icon = if (role == UserRole.TEACHER) Icons.Default.School else Icons.Default.LibraryBooks,
                        buttonText = emptyStateData.third,
                        onButtonClick = {
                            when (role) {
                                UserRole.TEACHER -> showCreateDialog = true
                                else             -> showJoinDialog = true
                            }
                        },
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 20.dp)
                    )
                }
            }

            // ── Section title ─────────────────────────────────────────────────
            if (state.classes.isNotEmpty()) {
                item {
                    Text(
                        text = if (role == UserRole.TEACHER) "My Classes" else "Enrolled Classes",
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onBackground
                        ),
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
                    )
                }
            }

            // ── Class Cards ───────────────────────────────────────────────────
            items(state.classes, key = { it.classId }) { classModel ->
                ClassCard(
                    classModel = classModel,
                    role = role,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
                    onClick = {
                        classroomViewModel.selectClass(classModel)
                        navController.navigate(AppRoutes.ClassDetail(classModel.classId))
                    }
                )
            }

            // ── Error ─────────────────────────────────────────────────────────
            if (state.error != null) {
                item {
                    com.shiva.magics.ui.components.ErrorStateView(
                        rawError = state.error ?: "",
                        onRetry = {
                            classroomViewModel.clearError()
                            when (role) {
                                UserRole.TEACHER -> classroomViewModel.listenTeacherClasses()
                                UserRole.STUDENT -> classroomViewModel.listenStudentClasses()
                                else -> {}
                            }
                        },
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp)
                    )
                }
            }
        }
    }
}

// ── Classroom Header ──────────────────────────────────────────────────────────

@Composable
private fun ClassroomHeader(role: UserRole, classCount: Int) {
    val (gradient, emoji, title, subtitle) = when (role) {
        UserRole.TEACHER -> Quadruple(
            listOf(Color(0xFF4F6EF7), Color(0xFF9B4DFF)),
            "🎓", "My Classroom", "Manage your classes and track students"
        )
        UserRole.STUDENT -> Quadruple(
            listOf(Color(0xFF1DB974), Color(0xFF0EA5E9)),
            "📚", "My Classes", "View your assignments and join new classes"
        )
        UserRole.LEARNER -> Quadruple(
            listOf(Color(0xFFFF9500), Color(0xFFFF6B6B)),
            "📖", "Explore Classes", "Join a class to get started"
        )
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(colors = gradient.map { it.copy(alpha = 0.12f) } + listOf(Color.Transparent))
            )
            .padding(start = 20.dp, end = 20.dp, top = 52.dp, bottom = 20.dp)
    ) {
        Column {
            Text(text = emoji, fontSize = 36.sp)
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.onBackground
                )
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall.copy(
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            )
            if (classCount > 0) {
                Spacer(modifier = Modifier.height(10.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(gradient[0].copy(alpha = 0.15f))
                        .border(1.dp, gradient[0].copy(alpha = 0.4f), RoundedCornerShape(50))
                        .padding(horizontal = 12.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "$classCount ${if (classCount == 1) "class" else "classes"}",
                        style = MaterialTheme.typography.labelMedium.copy(
                            color = gradient[0],
                            fontWeight = FontWeight.SemiBold
                        )
                    )
                }
            }
        }
    }
}

private data class Quadruple<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)

// ── Join Class Hero Card ──────────────────────────────────────────────────────

@Composable
private fun JoinClassHeroCard(modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF1DB974), Color(0xFF0EA5E9))))
            .clickable { onClick() }
            .padding(20.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Join a Class", style = MaterialTheme.typography.titleLarge.copy(
                    color = Color.White, fontWeight = FontWeight.Bold
                ))
                Spacer(modifier = Modifier.height(4.dp))
                Text("Enter the 6-character code from your teacher",
                    style = MaterialTheme.typography.bodySmall.copy(color = Color.White.copy(alpha = 0.8f)))
            }
            Box(
                modifier = Modifier.size(44.dp).clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.22f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.AutoMirrored.Filled.Login, null, tint = Color.White, modifier = Modifier.size(22.dp))
            }
        }
    }
}

// ── Class Card ────────────────────────────────────────────────────────────────

@Composable
private fun ClassCard(
    classModel: ClassModel,
    role: UserRole,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val gradient = when (role) {
        UserRole.TEACHER -> listOf(Color(0xFF4F6EF7), Color(0xFF9B4DFF))
        else             -> listOf(Color(0xFF1DB974), Color(0xFF0EA5E9))
    }
    val initials = classModel.name
        .split(" ").filter { it.isNotBlank() }.take(2)
        .joinToString("") { it.first().uppercaseChar().toString() }

    Card(
        modifier = modifier.fillMaxWidth().clickable { onClick() },
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Class avatar
            Box(
                modifier = Modifier.size(52.dp).clip(RoundedCornerShape(14.dp))
                    .background(Brush.linearGradient(gradient)),
                contentAlignment = Alignment.Center
            ) {
                Text(initials, style = MaterialTheme.typography.titleMedium.copy(
                    color = Color.White, fontWeight = FontWeight.ExtraBold
                ))
            }

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = classModel.name,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    // Student count pill
                    InfoPill(
                        emoji = "👥",
                        text  = "${classModel.studentCount} students"
                    )
                    if (role == UserRole.TEACHER) {
                        // Join code
                        InfoPill(emoji = "🔑", text = classModel.joinCode)
                    } else {
                        InfoPill(emoji = "👨‍🏫", text = classModel.teacherName.ifEmpty { "Teacher" })
                    }
                }
            }

            Icon(
                Icons.Default.ChevronRight,
                null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

@Composable
private fun InfoPill(emoji: String, text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(emoji, fontSize = 11.sp)
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall.copy(
                color = MaterialTheme.colorScheme.onSurfaceVariant
            ),
            maxLines = 1
        )
    }
}

// ── Empty State removed as it's handled by CoreUI ─────────────────────────────

// ── Create Class Dialog ───────────────────────────────────────────────────────

@Composable
private fun CreateClassDialog(onDismiss: () -> Unit, onCreate: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surface, tonalElevation = 4.dp) {
            Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(
                        modifier = Modifier.size(44.dp).clip(RoundedCornerShape(12.dp))
                            .background(Brush.linearGradient(listOf(Primary, PrimaryVariant))),
                        contentAlignment = Alignment.Center
                    ) { Icon(Icons.Default.School, null, tint = Color.White, modifier = Modifier.size(22.dp)) }
                    Text("Create New Class", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
                }

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Class Name") },
                    placeholder = { Text("e.g. Mathematics Grade 10") },
                    leadingIcon = { Icon(Icons.Default.Edit, null, tint = Primary) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = {
                        focusManager.clearFocus()
                        if (name.isNotBlank()) onCreate(name)
                    })
                )

                Text(
                    "A unique 6-character join code will be generated automatically.",
                    style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
                )

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp)) {
                        Text("Cancel")
                    }
                    Button(
                        onClick = { if (name.isNotBlank()) onCreate(name) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Primary),
                        enabled = name.isNotBlank()
                    ) { Text("Create", color = Color.White, fontWeight = FontWeight.SemiBold) }
                }
            }
        }
    }
}

// ── Join Class Dialog (Walkthrough) ───────────────────────────────────────────

@Composable
private fun JoinClassDialog(
    studentName: String,
    onDismiss: () -> Unit,
    onJoin: (String) -> Unit
) {
    var code by remember { mutableStateOf("") }
    var step by remember { mutableStateOf(1) }
    val focusManager = LocalFocusManager.current

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surface, tonalElevation = 4.dp) {
            Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(
                        modifier = Modifier.size(44.dp).clip(RoundedCornerShape(12.dp))
                            .background(Brush.linearGradient(listOf(Color(0xFF1DB974), Color(0xFF0EA5E9)))),
                        contentAlignment = Alignment.Center
                    ) { Icon(Icons.AutoMirrored.Filled.Login, null, tint = Color.White, modifier = Modifier.size(22.dp)) }
                    Text(
                        if (step == 1) "Join a Class" else "Confirm Enrollment",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
                    )
                }

                if (step == 1) {
                    Text(
                        "Step 1: Enter the 6-character code provided by your teacher.",
                        style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
                    )
                    OutlinedTextField(
                        value = code,
                        onValueChange = { if (it.length <= 6) code = it.uppercase() },
                        label = { Text("Class Code") },
                        placeholder = { Text("e.g. XY9Z2A") },
                        leadingIcon = { Icon(Icons.Default.Key, null, tint = AccentGreen) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = {
                            focusManager.clearFocus()
                            if (code.length == 6) step = 2
                        })
                    )

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp)) {
                            Text("Cancel")
                        }
                        Button(
                            onClick = { if (code.length == 6) step = 2 },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = AccentGreen),
                            enabled = code.length == 6
                        ) { Text("Next", color = Color.White, fontWeight = FontWeight.SemiBold) }
                    }
                } else {
                    Text(
                        "Step 2: You are about to join a class with code:",
                        style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
                    )
                    Box(
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(SurfaceElev2).padding(16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = code,
                            style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Black, color = Primary, letterSpacing = 4.sp)
                        )
                    }
                    Text(
                        "Joining as: $studentName",
                        style = MaterialTheme.typography.labelMedium.copy(color = MaterialTheme.colorScheme.onSurface)
                    )

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedButton(onClick = { step = 1 }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp)) {
                            Text("Back")
                        }
                        Button(
                            onClick = { onJoin(code) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = AccentGreen)
                        ) { Text("Confirm", color = Color.White, fontWeight = FontWeight.SemiBold) }
                    }
                }
            }
        }
    }
}
