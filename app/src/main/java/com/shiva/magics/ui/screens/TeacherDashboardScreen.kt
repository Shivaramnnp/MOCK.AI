package com.shiva.magics.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.shiva.magics.data.model.ClassModel
import com.shiva.magics.ui.components.MockAiBottomNav
import com.shiva.magics.ui.theme.*
import com.shiva.magics.viewmodel.ClassroomViewModel
import com.shiva.magics.viewmodel.ProfileViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeacherDashboardScreen(
    navController: NavController,
    classroomViewModel: ClassroomViewModel,
    profileViewModel: ProfileViewModel
) {
    val state   by classroomViewModel.state.collectAsState()
    val profile by profileViewModel.profile.collectAsState()

    LaunchedEffect(Unit) {
        classroomViewModel.listenTeacherClasses()
    }

    val classes     = state.classes
    val totalStudents = classes.sumOf { it.studentCount }
    val totalClasses  = classes.size

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
                                listOf(PrimaryVariant.copy(alpha = 0.14f), Color.Transparent)
                            )
                        )
                        .padding(start = 20.dp, end = 20.dp, top = 52.dp, bottom = 20.dp)
                ) {
                    Column {
                        Text("📊", fontSize = 34.sp)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Teacher Dashboard",
                            style = MaterialTheme.typography.headlineMedium.copy(
                                fontWeight = FontWeight.ExtraBold,
                                color = MaterialTheme.colorScheme.onBackground
                            )
                        )
                        Text(
                            "Overview of your classes and students",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        )
                    }
                }
            }

            // ── Stats Row ─────────────────────────────────────────────────────
            item {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    DashboardStatCard(
                        modifier     = Modifier.weight(1f),
                        emoji        = "🏫",
                        value        = "$totalClasses",
                        label        = "Classes",
                        gradientColors = listOf(Primary, PrimaryVariant)
                    )
                    DashboardStatCard(
                        modifier     = Modifier.weight(1f),
                        emoji        = "👥",
                        value        = "$totalStudents",
                        label        = "Students",
                        gradientColors = listOf(AccentGreen, Color(0xFF0EA5E9))
                    )
                    DashboardStatCard(
                        modifier     = Modifier.weight(1f),
                        emoji        = "📝",
                        value        = state.assignments.size.let { if (it == 0) "—" else "$it" },
                        label        = "Assignments",
                        gradientColors = listOf(AccentAmber, Color(0xFFFF6B6B))
                    )
                }
            }

            // ── Empty state ───────────────────────────────────────────────────
            if (classes.isEmpty()) {
                item {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 48.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("📊", fontSize = 48.sp)
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("No Data Yet", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            "Create a class and add students\nto see your dashboard",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            ),
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }

            // ── Classes Overview ──────────────────────────────────────────────
            if (classes.isNotEmpty()) {
                item {
                    Text(
                        "Classes Overview",
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onBackground
                        ),
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
                    )
                }

                items(classes, key = { it.classId }) { classModel ->
                    DashboardClassCard(
                        classModel = classModel,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 5.dp)
                    )
                }
            }

            // ── Tips section ──────────────────────────────────────────────────
            if (classes.isNotEmpty()) {
                item {
                    Spacer(modifier = Modifier.height(16.dp))
                    DashboardTipCard(
                        modifier = Modifier.padding(horizontal = 20.dp)
                    )
                }
            }
        }
    }
}

// ── Dashboard Stat Card ───────────────────────────────────────────────────────

@Composable
private fun DashboardStatCard(
    modifier: Modifier = Modifier,
    emoji: String,
    value: String,
    label: String,
    gradientColors: List<Color>
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(gradientColors.map { it.copy(alpha = 0.13f) }))
            .border(
                1.dp,
                Brush.linearGradient(gradientColors.map { it.copy(alpha = 0.3f) }),
                RoundedCornerShape(18.dp)
            )
            .padding(vertical = 16.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(emoji, fontSize = 22.sp)
            Text(
                value,
                style = MaterialTheme.typography.headlineSmall.copy(
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.onBackground
                )
            )
            Text(
                label,
                style = MaterialTheme.typography.labelSmall.copy(
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            )
        }
    }
}

// ── Dashboard Class Card ──────────────────────────────────────────────────────

@Composable
private fun DashboardClassCard(
    classModel: ClassModel,
    modifier: Modifier = Modifier
) {
    val initials = classModel.name.split(" ").filter { it.isNotBlank() }.take(2)
        .joinToString("") { it.first().uppercaseChar().toString() }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape    = RoundedCornerShape(18.dp),
        colors   = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border   = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(
                    modifier = Modifier.size(48.dp).clip(RoundedCornerShape(14.dp))
                        .background(Brush.linearGradient(listOf(Primary, PrimaryVariant))),
                    contentAlignment = Alignment.Center
                ) {
                    Text(initials, style = MaterialTheme.typography.titleMedium.copy(
                        color = Color.White, fontWeight = FontWeight.ExtraBold
                    ))
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(classModel.name, style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    ))
                    Text(
                        "Code: ${classModel.joinCode}",
                        style = MaterialTheme.typography.labelSmall.copy(color = Primary)
                    )
                }

                // Student count badge
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(Primary.copy(alpha = 0.13f))
                        .padding(horizontal = 10.dp, vertical = 5.dp)
                ) {
                    Text(
                        "${classModel.studentCount} students",
                        style = MaterialTheme.typography.labelSmall.copy(
                            color = Primary, fontWeight = FontWeight.SemiBold
                        )
                    )
                }
            }

            // Student name mini-list (first 4)
            if (classModel.studentNames.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy((-10).dp)) {
                    classModel.studentNames.values.take(4).forEachIndexed { index, name ->
                        val sInitials = name.split(" ").filter { it.isNotBlank() }.take(1)
                            .joinToString("") { it.first().uppercaseChar().toString() }
                        val colors = listOf(
                            listOf(Primary, PrimaryVariant),
                            listOf(AccentGreen, Color(0xFF0EA5E9)),
                            listOf(AccentAmber, Color(0xFFFF6B6B)),
                            listOf(Color(0xFFAA66FF), Color(0xFF4F6EF7))
                        )
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(Brush.linearGradient(colors[index % colors.size]))
                                .border(2.dp, MaterialTheme.colorScheme.surface, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(sInitials, style = MaterialTheme.typography.labelSmall.copy(
                                color = Color.White, fontWeight = FontWeight.Bold
                            ))
                        }
                    }
                    if (classModel.studentCount > 4) {
                        Box(
                            modifier = Modifier.size(32.dp).clip(CircleShape)
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .border(2.dp, MaterialTheme.colorScheme.surface, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("+${classModel.studentCount - 4}",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontWeight = FontWeight.Bold
                                ))
                        }
                    }
                }
            }
        }
    }
}

// ── Tips Card ─────────────────────────────────────────────────────────────────

@Composable
private fun DashboardTipCard(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(listOf(Primary.copy(0.08f), PrimaryVariant.copy(0.05f))))
            .border(1.dp, Primary.copy(alpha = 0.2f), RoundedCornerShape(18.dp))
            .padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.Default.Lightbulb, null, tint = AccentAmber, modifier = Modifier.size(20.dp))
            Column {
                Text("Pro Tip", style = MaterialTheme.typography.labelLarge.copy(
                    fontWeight = FontWeight.Bold, color = AccentAmber
                ))
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    "Create tests using AI from PDF or YouTube, then assign them to your class from the Classes tab.",
                    style = MaterialTheme.typography.bodySmall.copy(
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        lineHeight = 18.sp
                    )
                )
            }
        }
    }
}
