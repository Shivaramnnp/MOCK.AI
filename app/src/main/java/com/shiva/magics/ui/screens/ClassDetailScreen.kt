package com.shiva.magics.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.navigation.NavController
import com.shiva.magics.data.model.AssignmentModel
import com.shiva.magics.data.model.ClassModel
import com.shiva.magics.data.model.Question
import com.shiva.magics.data.model.SubmissionStatus
import com.shiva.magics.data.model.TestDefinition
import com.shiva.magics.data.model.UserRole
import com.shiva.magics.ui.navigation.AppRoutes
import com.shiva.magics.ui.theme.*
import com.shiva.magics.viewmodel.ClassroomViewModel
import com.shiva.magics.viewmodel.ProfileViewModel
import com.shiva.magics.viewmodel.TestPlayerViewModel
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClassDetailScreen(
    navController: NavController,
    classroomViewModel: ClassroomViewModel,
    profileViewModel: ProfileViewModel,
    testPlayerViewModel: TestPlayerViewModel
) {
    val state   by classroomViewModel.state.collectAsState()
    val profile by profileViewModel.profile.collectAsState()
    val role    = profile.role

    val classModel = state.selectedClass
    if (classModel == null) {
        LaunchedEffect(Unit) { navController.popBackStack() }
        return
    }

    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = if (role == UserRole.TEACHER) listOf("Students", "Assignments") else listOf("Assignments")
    val snackbarHostState = remember { SnackbarHostState() }

    var showAssignDialog by remember { mutableStateOf(false) }

    LaunchedEffect(state.snackMessage) {
        state.snackMessage?.let {
            snackbarHostState.showSnackbar(it)
            classroomViewModel.clearSnack()
        }
    }

    if (showAssignDialog) {
        CreateAssignmentDialog(
            classModel = classModel,
            onDismiss  = { showAssignDialog = false },
            onCreate   = { title, questionsJson, dueDate ->
                classroomViewModel.createAssignment(
                    classId      = classModel.classId,
                    className    = classModel.name,
                    testTitle    = title,
                    questionsJson = questionsJson,
                    dueDate      = dueDate
                )
                showAssignDialog = false
            }
        )
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost   = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(classModel.name, fontWeight = FontWeight.Bold, maxLines = 1)
                        if (role == UserRole.TEACHER) {
                            Text(
                                "Code: ${classModel.joinCode}",
                                style = MaterialTheme.typography.labelSmall.copy(color = Primary)
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    if (role == UserRole.TEACHER) {
                        // Copy join code
                        val context = LocalContext.current
                        IconButton(onClick = {
                            val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE)
                                as android.content.ClipboardManager
                            clipboard.setPrimaryClip(
                                android.content.ClipData.newPlainText("Join Code", classModel.joinCode)
                            )
                        }) {
                            Icon(Icons.Default.ContentCopy, "Copy code", tint = Primary)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
            )
        },
        floatingActionButton = {
            if (role == UserRole.TEACHER) {
                FloatingActionButton(
                    onClick = { showAssignDialog = true },
                    containerColor = Primary,
                    contentColor = Color.White
                ) {
                    Icon(Icons.Default.Add, "Assign Test")
                }
            }
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {

            // ── Tab Row ───────────────────────────────────────────────────────
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor   = MaterialTheme.colorScheme.surface,
                indicator        = { tabPositions ->
                    TabRowDefaults.SecondaryIndicator(
                        modifier = Modifier.tabIndicatorOffset(tabPositions[selectedTab]),
                        color    = Primary
                    )
                }
            ) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick  = { selectedTab = index },
                        text = {
                            Text(
                                title,
                                fontWeight = if (selectedTab == index) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (selectedTab == index) Primary else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    )
                }
            }

            // ── Content ───────────────────────────────────────────────────────
            when {
                role == UserRole.TEACHER && selectedTab == 0 -> StudentsTab(
                    classModel = classModel,
                    onRemove   = { uid -> classroomViewModel.removeStudent(classModel.classId, uid) }
                )
                else -> AssignmentsTab(
                    assignments   = state.classAssignments,
                    role          = role,
                    currentUid    = profile.uid,
                    classStudentIds = classModel.studentIds,
                    onStartAssignment = { assignment ->
                        parseAndLoadAssignment(assignment, testPlayerViewModel)
                        navController.navigate(AppRoutes.TestPlayer)
                    }
                )
            }
        }
    }
}

// ── Students Tab ──────────────────────────────────────────────────────────────

@Composable
private fun StudentsTab(classModel: ClassModel, onRemove: (String) -> Unit) {
    if (classModel.studentIds.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("👥", fontSize = 48.sp)
                Spacer(modifier = Modifier.height(12.dp))
                Text("No Students Yet", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "Share the code ${classModel.joinCode} with your students",
                    style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant),
                    textAlign = TextAlign.Center
                )
            }
        }
    } else {
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Text(
                    "${classModel.studentCount} Student${if (classModel.studentCount != 1) "s" else ""}",
                    style = MaterialTheme.typography.labelLarge.copy(
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.SemiBold
                    ),
                    modifier = Modifier.padding(bottom = 4.dp)
                )
            }
            items(classModel.studentIds, key = { it }) { uid ->
                val name = classModel.studentNames[uid] ?: "Student"
                StudentCard(name = name, uid = uid, onRemove = onRemove)
            }
        }
    }
}

@Composable
private fun StudentCard(name: String, uid: String, onRemove: (String) -> Unit) {
    var showRemoveDialog by remember { mutableStateOf(false) }
    val initials = name.split(" ").filter { it.isNotBlank() }.take(2)
        .joinToString("") { it.first().uppercaseChar().toString() }

    if (showRemoveDialog) {
        AlertDialog(
            onDismissRequest = { showRemoveDialog = false },
            title = { Text("Remove Student?", fontWeight = FontWeight.Bold) },
            text  = { Text("Remove $name from this class? They can rejoin using the code.") },
            confirmButton = {
                TextButton(onClick = { onRemove(uid); showRemoveDialog = false }) {
                    Text("Remove", color = AccentRed)
                }
            },
            dismissButton = { TextButton(onClick = { showRemoveDialog = false }) { Text("Cancel") } },
            shape = RoundedCornerShape(20.dp),
            containerColor = MaterialTheme.colorScheme.surface
        )
    }

    Card(
        shape  = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Box(
                modifier = Modifier.size(40.dp).clip(CircleShape)
                    .background(Brush.linearGradient(listOf(Primary, PrimaryVariant))),
                contentAlignment = Alignment.Center
            ) { Text(initials, style = MaterialTheme.typography.labelLarge.copy(color = Color.White, fontWeight = FontWeight.ExtraBold)) }

            Text(name, style = MaterialTheme.typography.bodyLarge.copy(
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface
            ), modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)

            IconButton(
                onClick = { showRemoveDialog = true },
                modifier = Modifier.size(32.dp)
            ) {
                Icon(Icons.Default.PersonRemove, "Remove", tint = AccentRed, modifier = Modifier.size(18.dp))
            }
        }
    }
}

// ── Assignments Tab ───────────────────────────────────────────────────────────

@Composable
private fun AssignmentsTab(
    assignments: List<AssignmentModel>,
    role: UserRole,
    currentUid: String,
    classStudentIds: List<String>,
    onStartAssignment: (AssignmentModel) -> Unit
) {
    if (assignments.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("📝", fontSize = 48.sp)
                Spacer(modifier = Modifier.height(12.dp))
                Text("No Assignments Yet", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                if (role == UserRole.TEACHER) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Tap + to create an assignment for this class",
                        style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant),
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
        return
    }

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items(assignments, key = { it.assignmentId }) { assignment ->
            AssignmentCard(
                assignment       = assignment,
                role             = role,
                currentUid       = currentUid,
                totalStudents    = classStudentIds.size,
                onStartAssignment = { onStartAssignment(assignment) }
            )
        }
    }
}

@Composable
private fun AssignmentCard(
    assignment: AssignmentModel,
    role: UserRole,
    currentUid: String,
    totalStudents: Int,
    onStartAssignment: () -> Unit
) {
    val isSubmitted   = assignment.isSubmittedBy(currentUid)
    val dueText       = assignment.dueDate?.let {
        "Due: ${SimpleDateFormat("MMM d, h:mm a", Locale.getDefault()).format(Date(it))}"
    } ?: "No deadline"
    val isOverdue     = assignment.dueDate?.let { it < System.currentTimeMillis() } ?: false
    val submCount     = assignment.submissionCount

    Card(
        shape  = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = assignment.testTitle,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    modifier = Modifier.weight(1f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                // Status badge
                if (role == UserRole.STUDENT || role == UserRole.LEARNER) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(
                                if (isSubmitted) AccentGreen.copy(alpha = 0.15f)
                                else if (isOverdue) AccentRed.copy(alpha = 0.12f)
                                else Primary.copy(alpha = 0.12f)
                            )
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text  = if (isSubmitted) "✓ Done" else if (isOverdue) "Overdue" else "Pending",
                            style = MaterialTheme.typography.labelSmall.copy(
                                color = if (isSubmitted) AccentGreen else if (isOverdue) AccentRed else Primary,
                                fontWeight = FontWeight.SemiBold
                            )
                        )
                    }
                }
            }

            // Due date
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(
                    Icons.Default.Schedule,
                    null,
                    tint = if (isOverdue && !isSubmitted) AccentRed else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(14.dp)
                )
                Text(
                    dueText,
                    style = MaterialTheme.typography.labelSmall.copy(
                        color = if (isOverdue && !isSubmitted) AccentRed else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                )
            }

            // Teacher: submission progress bar
            if (role == UserRole.TEACHER && totalStudents > 0) {
                val progress = submCount.toFloat() / totalStudents
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Submissions", style = MaterialTheme.typography.labelSmall.copy(
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        ))
                        Text("$submCount / $totalStudents", style = MaterialTheme.typography.labelSmall.copy(
                            color = Primary, fontWeight = FontWeight.SemiBold
                        ))
                    }
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).height(6.dp),
                        color    = Primary,
                        trackColor = Primary.copy(alpha = 0.15f)
                    )
                }
            }

            // Student: start button
            if ((role == UserRole.STUDENT || role == UserRole.LEARNER) && !isSubmitted && assignment.questionsJson.isNotBlank()) {
                Button(
                    onClick = onStartAssignment,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary),
                    shape  = RoundedCornerShape(10.dp)
                ) {
                    Icon(Icons.Default.PlayArrow, null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Start Test", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

// ── Create Assignment Dialog ──────────────────────────────────────────────────

@Composable
private fun CreateAssignmentDialog(
    classModel: ClassModel,
    onDismiss: () -> Unit,
    onCreate: (title: String, questionsJson: String, dueDate: Long?) -> Unit
) {
    var title   by remember { mutableStateOf("") }
    var questionsJson by remember { mutableStateOf("") }
    var hasDueDate   by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 4.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(24.dp).verticalScroll(androidx.compose.foundation.rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(
                        modifier = Modifier.size(44.dp).clip(RoundedCornerShape(12.dp))
                            .background(Brush.linearGradient(listOf(Primary, PrimaryVariant))),
                        contentAlignment = Alignment.Center
                    ) { Icon(Icons.AutoMirrored.Filled.Assignment, null, tint = Color.White, modifier = Modifier.size(22.dp)) }
                    Column {
                        Text("New Assignment", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
                        Text("for ${classModel.name}", style = MaterialTheme.typography.bodySmall.copy(
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        ))
                    }
                }

                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Test Title") },
                    leadingIcon = { Icon(Icons.Default.Title, null, tint = Primary) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    singleLine = true
                )

                OutlinedTextField(
                    value = questionsJson,
                    onValueChange = { questionsJson = it },
                    label = { Text("Questions JSON") },
                    placeholder = { Text("[{\"questionText\":\"...\",\"options\":[...],\"correctAnswerIndex\":0}]") },
                    leadingIcon = { Icon(Icons.Default.Code, null, tint = Primary) },
                    modifier = Modifier.fillMaxWidth().height(130.dp),
                    shape = RoundedCornerShape(14.dp),
                    maxLines = 6
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Add a due date", style = MaterialTheme.typography.bodyMedium)
                    Switch(
                        checked = hasDueDate,
                        onCheckedChange = { hasDueDate = it },
                        colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = Primary)
                    )
                }

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp)) {
                        Text("Cancel")
                    }
                    Button(
                        onClick = {
                            if (title.isNotBlank() && questionsJson.isNotBlank()) {
                                val due = if (hasDueDate) System.currentTimeMillis() + 7 * 24 * 3600 * 1000L else null
                                onCreate(title, questionsJson, due)
                            }
                        },
                        modifier = Modifier.weight(1f),
                        shape  = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Primary),
                        enabled = title.isNotBlank() && questionsJson.isNotBlank()
                    ) { Text("Assign", color = Color.White, fontWeight = FontWeight.SemiBold) }
                }
            }
        }
    }
}

// ── Helper: parse JSON and load into TestPlayerViewModel ─────────────────────

fun parseAndLoadAssignment(assignment: AssignmentModel, testPlayerViewModel: TestPlayerViewModel) {
    runCatching {
        val questions = kotlinx.serialization.json.Json.decodeFromString(ListSerializer(Question.serializer()), assignment.questionsJson)
        testPlayerViewModel.loadTest(
            definition = TestDefinition(
                dbId      = 0,
                title     = assignment.testTitle,
                category  = assignment.className,
                questions = questions
            )
        )
    }
}
