package com.shiva.magics.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.shiva.magics.data.model.AssignmentModel
import com.shiva.magics.data.model.SubmissionStatus
import com.shiva.magics.ui.components.MockAiBottomNav
import com.shiva.magics.ui.navigation.AppRoutes
import com.shiva.magics.ui.theme.*
import com.shiva.magics.viewmodel.ClassroomViewModel
import com.shiva.magics.viewmodel.ProfileViewModel
import com.shiva.magics.viewmodel.TestPlayerViewModel
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentAssignmentsScreen(
    navController: NavController,
    classroomViewModel: ClassroomViewModel,
    profileViewModel: ProfileViewModel,
    testPlayerViewModel: TestPlayerViewModel
) {
    val state   by classroomViewModel.state.collectAsState()
    val profile by profileViewModel.profile.collectAsState()

    // Ensure we're listening to student classes + assignments
    LaunchedEffect(Unit) {
        classroomViewModel.listenStudentClasses()
    }

    val allAssignments = state.assignments
    var filterSelected by remember { mutableIntStateOf(0) }
    val filters = listOf("All", "Pending", "Done")

    val uid = profile.uid
    val filtered = remember(allAssignments, filterSelected, uid) {
        when (filterSelected) {
            1    -> allAssignments.filter { !it.isSubmittedBy(uid) }
            2    -> allAssignments.filter { it.isSubmittedBy(uid) }
            else -> allAssignments
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = { MockAiBottomNav(navController = navController, role = profile.role) }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(bottom = 24.dp)
        ) {

            // ── Header ────────────────────────────────────────────────────────
            item {
                Box(
                    modifier = Modifier.fillMaxWidth()
                        .background(
                            Brush.verticalGradient(
                                listOf(Primary.copy(alpha = 0.10f), Color.Transparent)
                            )
                        )
                        .padding(start = 20.dp, end = 20.dp, top = 52.dp, bottom = 20.dp)
                ) {
                    Column {
                        Text("📋", fontSize = 34.sp)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "My Assignments",
                            style = MaterialTheme.typography.headlineMedium.copy(
                                fontWeight = FontWeight.ExtraBold,
                                color = MaterialTheme.colorScheme.onBackground
                            )
                        )
                        Text(
                            "${allAssignments.size} total across ${state.classes.size} class${if (state.classes.size != 1) "es" else ""}",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        )
                    }
                }
            }

            // ── Filter Chips ──────────────────────────────────────────────────
            item {
                Row(
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    filters.forEachIndexed { index, label ->
                        val isSelected = filterSelected == index
                        FilterChip(
                            selected = isSelected,
                            onClick  = { filterSelected = index },
                            label    = { Text(label, fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal) },
                            colors   = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = Primary,
                                selectedLabelColor     = Color.White
                            )
                        )
                    }
                }
            }

            // ── Loading ───────────────────────────────────────────────────────
            if (state.isLoading && allAssignments.isEmpty()) {
                item {
                    Box(modifier = Modifier.fillParentMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Primary)
                    }
                }
            }

            // ── Empty state ───────────────────────────────────────────────────
            if (!state.isLoading && filtered.isEmpty()) {
                item {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 40.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(if (filterSelected == 2) "🎉" else "📭", fontSize = 44.sp)
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            when (filterSelected) {
                                1    -> "No pending assignments"
                                2    -> "No completed assignments yet"
                                else -> "No assignments yet"
                            },
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            if (filterSelected == 0) "Join a class to receive assignments from your teacher"
                            else "Check the other filter tabs",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            ),
                            textAlign = TextAlign.Center
                        )
                        if (allAssignments.isEmpty()) {
                            Spacer(modifier = Modifier.height(16.dp))
                            Button(
                                onClick = { navController.navigate(AppRoutes.Classroom) },
                                colors  = ButtonDefaults.buttonColors(containerColor = AccentGreen),
                                shape   = RoundedCornerShape(12.dp)
                            ) {
                                Icon(Icons.Default.Groups, null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Join a Class", fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }

            // ── Assignment Cards ──────────────────────────────────────────────
            if (filtered.isNotEmpty()) {
                item {
                    Text(
                        "${filtered.size} assignment${if (filtered.size != 1) "s" else ""}",
                        style = MaterialTheme.typography.labelLarge.copy(
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.Medium
                        ),
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)
                    )
                }
            }

            items(filtered, key = { it.assignmentId }) { assignment ->
                StudentAssignmentCard(
                    assignment = assignment,
                    currentUid = uid,
                    modifier   = Modifier.padding(horizontal = 20.dp, vertical = 5.dp),
                    onStart    = {
                        parseAndLoadAssignment(assignment, testPlayerViewModel)
                        navController.navigate(AppRoutes.TestPlayer)
                    }
                )
            }
        }
    }
}

// ── Student Assignment Card ───────────────────────────────────────────────────

@Composable
private fun StudentAssignmentCard(
    assignment: AssignmentModel,
    currentUid: String,
    modifier: Modifier = Modifier,
    onStart: () -> Unit
) {
    val isSubmitted = assignment.isSubmittedBy(currentUid)
    val submission  = assignment.studentSubmissions[currentUid]
    val isOverdue   = assignment.dueDate?.let { it < System.currentTimeMillis() } ?: false

    val statusColor = when {
        isSubmitted -> AccentGreen
        isOverdue   -> AccentRed
        else        -> Primary
    }
    val statusText = when {
        isSubmitted -> "✓ Completed"
        isOverdue   -> "Overdue"
        else        -> "Pending"
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape    = RoundedCornerShape(18.dp),
        colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border   = BorderStroke(1.5.dp, statusColor.copy(alpha = if (isSubmitted || isOverdue) 0.3f else 0.1f))
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {

            // Class name chip
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(Primary.copy(alpha = 0.10f))
                    .padding(horizontal = 8.dp, vertical = 3.dp)
            ) {
                Text(
                    assignment.className,
                    style = MaterialTheme.typography.labelSmall.copy(
                        color = Primary, fontWeight = FontWeight.SemiBold
                    )
                )
            }

            // Title + status badge
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    assignment.testTitle,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    ),
                    modifier = Modifier.weight(1f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(statusColor.copy(alpha = 0.13f))
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(
                        statusText,
                        style = MaterialTheme.typography.labelSmall.copy(
                            color = statusColor, fontWeight = FontWeight.SemiBold
                        )
                    )
                }
            }

            // Assigned by + due date
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                if (assignment.assignedByName.isNotBlank()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Person, null, modifier = Modifier.size(13.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(assignment.assignedByName, style = MaterialTheme.typography.labelSmall.copy(
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        ))
                    }
                }
                assignment.dueDate?.let { due ->
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Schedule, null, modifier = Modifier.size(13.dp),
                            tint = if (isOverdue && !isSubmitted) AccentRed else MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(due)),
                            style = MaterialTheme.typography.labelSmall.copy(
                                color = if (isOverdue && !isSubmitted) AccentRed else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        )
                    }
                }
            }

            // Score (if submitted)
            if (isSubmitted && submission?.score != null) {
                val pct = submission.scorePercent ?: 0f
                Row(
                    modifier = Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(AccentGreen.copy(alpha = 0.09f))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        "Your Score",
                        style = MaterialTheme.typography.bodySmall.copy(color = AccentGreen)
                    )
                    Text(
                        "${submission.score} / ${submission.total}  (${pct.toInt()}%)",
                        style = MaterialTheme.typography.titleSmall.copy(
                            color = AccentGreen, fontWeight = FontWeight.Bold
                        )
                    )
                }
            }

            // Start button (if not submitted and has questions)
            if (!isSubmitted && assignment.questionsJson.isNotBlank()) {
                Button(
                    onClick = onStart,
                    modifier = Modifier.fillMaxWidth(),
                    shape  = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary)
                ) {
                    Icon(Icons.Default.PlayArrow, null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Start Test", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}
