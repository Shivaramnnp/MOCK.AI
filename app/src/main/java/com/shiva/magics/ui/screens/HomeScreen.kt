package com.shiva.magics.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.shiva.magics.data.local.TestHistoryEntity
import com.shiva.magics.data.model.Question
import com.shiva.magics.data.model.TestDefinition
import com.shiva.magics.ui.theme.OnSurface
import com.shiva.magics.ui.theme.OnSurfaceMuted
import com.shiva.magics.ui.theme.PrimaryVariant
import com.shiva.magics.ui.theme.SurfaceElev1
import com.shiva.magics.ui.theme.SurfaceElev2
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.window.Dialog
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import com.shiva.magics.data.repository.TestRepository
import com.shiva.magics.ui.navigation.AppRoutes
import com.shiva.magics.ui.theme.*
import com.shiva.magics.viewmodel.AnalyticsViewModel
import com.shiva.magics.viewmodel.EditorViewModel
import com.shiva.magics.viewmodel.HomeViewModel
import com.shiva.magics.viewmodel.ProcessingViewModel
import com.shiva.magics.viewmodel.TestPlayerViewModel
import com.shiva.magics.viewmodel.MarketplaceViewModel
import android.content.Context
import android.content.ClipboardManager
import android.content.ClipData
import com.shiva.magics.data.model.UserRole
import com.shiva.magics.ui.components.MockAiBottomNav
import com.shiva.magics.viewmodel.ProfileViewModel

fun resolveFileName(context: Context, uri: Uri): String {
    return context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            val idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (idx != -1) cursor.getString(idx) else null
        } else null
    } ?: uri.lastPathSegment ?: "document"
}

// ─── Data model ──────────────────────────────────────────────────────────────

data class InputOption(
    val title: String,
    val description: String,
    val icon: ImageVector,
    val color: Color,
    val emoji: String = "📄",
    val implemented: Boolean = true,
    val onClick: () -> Unit
)

// ─── Main Screen ─────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun HomeScreen(
    navController: NavController,
    homeViewModel: HomeViewModel,
    profileViewModel: ProfileViewModel,
    editorViewModel: EditorViewModel,
    processingViewModel: ProcessingViewModel,
    testPlayerViewModel: TestPlayerViewModel,
    marketplaceViewModel: MarketplaceViewModel,
    repository: TestRepository
) {
    val tests by homeViewModel.tests.collectAsState()
    val activeStudyPlan by homeViewModel.activeStudyPlan.collectAsState()
    val revisionQueue by homeViewModel.revisionQueue.collectAsState()
    val dailyTasks by homeViewModel.dailyTasks.collectAsState()
    val avgScore = remember(tests) {
        if (tests.isNotEmpty()) {
            tests.mapNotNull { it.bestScorePercent }.let { scores ->
                if (scores.isNotEmpty()) scores.average().toInt() else 0
            }
        } else 0
    }
    val studyStreak by homeViewModel.studyStreak.collectAsState()
    val streakCount = studyStreak?.currentStreak ?: 0
    val dailyInsight by homeViewModel.dailyInsight.collectAsState()
    val autoTests by homeViewModel.autoTests.collectAsState()
    val referralCount by homeViewModel.referralCount.collectAsState()
    val isReferralEnabled by homeViewModel.isReferralEnabled.collectAsState()

    var showBottomSheet by remember { mutableStateOf(false) }
    
    // Dialog States
    var showJsonDialog by remember { mutableStateOf(false) }
    var showTopicDialog by remember { mutableStateOf(false) }
    var showUrlDialog by remember { mutableStateOf(false) }
    var showYouTubeDialog by remember { mutableStateOf(false) }
    var publishDialogTarget by remember { mutableStateOf<com.shiva.magics.data.local.TestHistoryEntity?>(null) }
    
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val pdfLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            showBottomSheet = false
            val fileName = resolveFileName(context, uri)
            val mimeType = context.contentResolver.getType(uri) ?: "application/pdf"
            processingViewModel.processFile(context, uri, mimeType, fileName)
            navController.navigate(AppRoutes.Processing)
        }
    }

    val docxLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            showBottomSheet = false
            val fileName = resolveFileName(context, uri)
            val mimeType = context.contentResolver.getType(uri) ?: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            processingViewModel.processFile(context, uri, mimeType, fileName)
            navController.navigate(AppRoutes.Processing)
        }
    }

    val imageLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris: List<Uri> ->
        if (uris.isNotEmpty()) {
            showBottomSheet = false
            processingViewModel.processMultipleImages(context, uris)
            navController.navigate(AppRoutes.Processing)
        }
    }

    val allOptions = remember {
        listOf(
            InputOption("PDF", "Upload a PDF document", Icons.Default.PictureAsPdf, AccentRed, "📄", true) {
                pdfLauncher.launch(arrayOf("application/pdf"))
            },
            InputOption("Word / PPT", "Upload DOCX or PPTX", Icons.Default.AutoStories, Color(0xFF5B8AF5), "📝", true) {
                docxLauncher.launch(arrayOf(
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                ))
            },
            InputOption("Web URL", "Scrape text from webpage", Icons.Default.Search, Primary, "🌐", true) {
                showBottomSheet = false
                showUrlDialog = true
            },
            InputOption("YouTube", "Extract transcript from video", Icons.Default.PlayArrow, Color(0xFFFF4444), "▶️", true) {
                showBottomSheet = false
                showYouTubeDialog = true
            },
            InputOption("Topic", "Type a topic name", Icons.Default.School, AccentGreen, "🎯", true) {
                showBottomSheet = false
                showTopicDialog = true
            },
            InputOption("Image", "Upload from gallery", Icons.Default.Image, AccentAmber, "🖼️", true) {
                imageLauncher.launch("image/*")
            },
            InputOption("Camera", "Scan a physical page", Icons.Default.Image, Color(0xFF5B8AF5), "📷", true) {
                showBottomSheet = false
                navController.navigate(AppRoutes.Camera)
            },
            InputOption("Voice", "Record audio", Icons.Default.Mic, Color(0xFFAA66FF), "🎙️", true) {
                showBottomSheet = false
                navController.navigate(AppRoutes.VoiceRecorder)
            },
            InputOption("Manual Entry", "Write questions yourself", Icons.Default.Edit, AccentRed, "✏️", true) {
                showBottomSheet = false
                editorViewModel.setQuestions(listOf(Question("", List(4) { "" }, -1)))
                navController.navigate(AppRoutes.Editor)
            },
            InputOption("JSON", "Paste or upload JSON", Icons.Default.Edit, Color(0xFF22C9A5), "{ }", true) {
                showBottomSheet = false
                showJsonDialog = true
            },
        )
    }

    // Input Dialogs Runtime
    if (showTopicDialog) {
        MagicInputDialog(title = "Enter a Topic", placeholder = "e.g. World War 2", onDismiss = { showTopicDialog = false }) { topic ->
            showTopicDialog = false
            processingViewModel.generateQuestionsFromText(topic, com.shiva.magics.data.model.InputSource.Topic, topic)
            navController.navigate(AppRoutes.Processing)
        }
    }
    if (showUrlDialog) {
        MagicInputDialog(title = "Enter Webpage URL", placeholder = "https://example.com/article", onDismiss = { showUrlDialog = false }) { url ->
            showUrlDialog = false
            processingViewModel.processWebUrl(url)
            navController.navigate(AppRoutes.Processing)
        }
    }
    if (showYouTubeDialog) {
        MagicInputDialog(title = "Enter YouTube URL", placeholder = "https://youtube.com/watch?v=...", onDismiss = { showYouTubeDialog = false }) { url ->
            showYouTubeDialog = false
            processingViewModel.processYouTubeUrl(url)
            navController.navigate(AppRoutes.Processing)
        }
    }
    if (showJsonDialog) {
        MagicInputDialog(
            title = "Paste JSON Data",
            placeholder = "{ \"questions\": ... }",
            isMultiline = true,
            showJsonExtras = true,
            onDismiss = { showJsonDialog = false }
        ) { jsonText ->
            showJsonDialog = false
            processingViewModel.generateQuestionsFromText(jsonText, com.shiva.magics.data.model.InputSource.Json, "Pasted JSON")
            navController.navigate(AppRoutes.Processing)
        }
    }


    Scaffold(
        containerColor = Surface,
        bottomBar = {
            val profile by profileViewModel.profile.collectAsState()
            MockAiBottomNav(navController = navController, role = profile.role)
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentPadding = PaddingValues(bottom = 40.dp)
        ) {

            // ── Header ────────────────────────────────────────────────────
            item {
                HomeHeader(
                    navController = navController,
                    testsCount = tests.size,
                    avgScore = avgScore,
                    streak = streakCount,
                    profileViewModel = profileViewModel
                )
            }

            // ── Daily AI Insight ──────────────────────────────────────────
            dailyInsight?.let { insight ->
                item {
                    DailyInsightCard(
                        insight = insight,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
                    )
                }
            }

            // ── Referral Card ─────────────────────────────────────────────
            if (isReferralEnabled) {
                item {
                    ReferralCard(
                        referralCount = referralCount,
                        onInviteClick = { homeViewModel.shareReferral(context) },
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
                    )
                }
            }

            // ── Hero: Create New Test ─────────────────────────────────────
            item {
                CreateNewTestHero(
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                    onClick = { showBottomSheet = true }
                )
            }

            // ── Study Coach Section (Sprint 3) ────────────────────────────
            if (activeStudyPlan != null || revisionQueue.isNotEmpty()) {
                item {
                    StudyCoachSection(
                        activePlan = activeStudyPlan,
                        revisionQueue = revisionQueue,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                }
            }

            // ── Today's Tasks Section (Sprint 3) ──────────────────────────
            if (dailyTasks.isNotEmpty() || autoTests.isNotEmpty()) {
                item {
                    DailyTaskChecklist(
                        tasks = dailyTasks,
                        autoTests = autoTests,
                        onTaskToggle = { id, done -> homeViewModel.toggleTaskCompletion(id, done) },
                        onStartAutoTest = { id -> navController.navigate(AppRoutes.TestPlayerWithId(id)) },
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                }
            }

            // ── Resume Last Test (Phase 3) ───────────────────────────────────
            val unfinishedTest = tests.firstOrNull { it.lastTakenAt == null }
            if (unfinishedTest != null) {
                item {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Resume Test",
                        style = MaterialTheme.typography.titleLarge.copy(
                            color = OnSurface,
                            fontWeight = FontWeight.Bold
                        ),
                        modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 8.dp)
                    )
                    TestHistoryCard(
                        test = unfinishedTest,
                        onStartTest = {
                            val prefs = context.getSharedPreferences("app_settings", android.content.Context.MODE_PRIVATE)
                            val timerSec = prefs.getInt("timer_seconds", 60)
                            testPlayerViewModel.loadTestFromDb(unfinishedTest.id, repository, timerDurationSeconds = timerSec)
                            navController.navigate(AppRoutes.TestPlayerWithId(unfinishedTest.id))
                        },
                        onEditTest = {
                            scope.launch {
                                val questions = repository.getQuestionsForTest(unfinishedTest.id)
                                editorViewModel.setQuestions(questions)
                                navController.navigate(AppRoutes.Editor)
                            }
                        },
                        onShareTest = {
                            scope.launch {
                                val questions = repository.getQuestionsForTest(unfinishedTest.id)
                                val json = repository.buildShareJson(questions, unfinishedTest.title)
                                val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                                    type = "application/json"
                                    putExtra(android.content.Intent.EXTRA_TEXT, json)
                                    putExtra(android.content.Intent.EXTRA_SUBJECT, "Mock AI Test: ${unfinishedTest.title}")
                                }
                                context.startActivity(android.content.Intent.createChooser(intent, "Share Test"))
                            }
                        },
                        onPublishTest = { publishDialogTarget = unfinishedTest },
                        onDeleteTest = { homeViewModel.deleteTest(unfinishedTest.id) },
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 5.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                }
            }

            // ── Your Tests Header ─────────────────────────────────────────
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Your Tests",
                        style = MaterialTheme.typography.titleLarge.copy(
                            color = OnSurface,
                            fontWeight = FontWeight.Bold
                        )
                    )
                    if (tests.isNotEmpty()) {
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(SurfaceElev3)
                                .border(1.dp, Border, RoundedCornerShape(50))
                                .padding(horizontal = 14.dp, vertical = 5.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = "${tests.size}",
                                style = MaterialTheme.typography.labelMedium.copy(
                                    color = OnSurface,
                                    fontWeight = FontWeight.Bold
                                )
                            )
                            Text(
                                text = "›",
                                style = MaterialTheme.typography.labelMedium.copy(
                                    color = OnSurfaceMuted,
                                    fontWeight = FontWeight.Medium
                                )
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(12.dp))
            }

            // ── Tests or Empty State ──────────────────────────────────────
            if (tests.isEmpty()) {
                item {
                    EmptyTestsState(
                        modifier = Modifier.padding(horizontal = 20.dp),
                        onCreateClick = { showBottomSheet = true }
                    )
                }
            } else {
                items(tests, key = { it.id }) { test ->
                    TestHistoryCard(
                        test = test,
                        onStartTest = {
                            val prefs = context.getSharedPreferences("app_settings", android.content.Context.MODE_PRIVATE)
                            val timerSec = prefs.getInt("timer_seconds", 60)
                            testPlayerViewModel.loadTestFromDb(test.id, repository, timerDurationSeconds = timerSec)
                            navController.navigate(AppRoutes.TestPlayerWithId(test.id))
                        },
                        onEditTest = {
                            scope.launch {
                                val questions = repository.getQuestionsForTest(test.id)
                                editorViewModel.setQuestions(questions)
                                navController.navigate(AppRoutes.Editor)
                            }
                        },
                        onShareTest = {
                            scope.launch {
                                val questions = repository.getQuestionsForTest(test.id)
                                val json = repository.buildShareJson(questions, test.title)
                                val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                                    type = "application/json"
                                    putExtra(android.content.Intent.EXTRA_TEXT, json)
                                    putExtra(android.content.Intent.EXTRA_SUBJECT, "Mock AI Test: ${test.title}")
                                }
                                context.startActivity(android.content.Intent.createChooser(intent, "Share Test"))
                            }
                        },
                        onPublishTest = {
                            publishDialogTarget = test
                        },
                        onDeleteTest = { homeViewModel.deleteTest(test.id) },
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 5.dp)
                    )
                }
            }
        }
    }

    // ── Bottom Sheet ──────────────────────────────────────────────────────────
    if (showBottomSheet) {
        ModalBottomSheet(
            onDismissRequest = { showBottomSheet = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = SurfaceElev1,
            shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
            dragHandle = {
                Box(
                    modifier = Modifier
                        .padding(top = 14.dp, bottom = 6.dp)
                        .size(width = 36.dp, height = 4.dp)
                        .background(Border, RoundedCornerShape(2.dp))
                )
            }
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 36.dp)
            ) {
                Text(
                    text = "Choose Source",
                    style = MaterialTheme.typography.headlineSmall.copy(
                        color = OnSurface,
                        fontWeight = FontWeight.Bold
                    )
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "How would you like to create your test?",
                    style = MaterialTheme.typography.bodySmall.copy(color = OnSurfaceMuted)
                )
                Spacer(modifier = Modifier.height(24.dp))

                val fromImport = allOptions.filter { it.title in listOf("PDF", "Word / PPT") }
                val fromGenerate = allOptions.filter { it.title in listOf("Topic", "YouTube", "Web URL") }
                val fromCapture = allOptions.filter { it.title in listOf("Camera", "Image", "Voice") }
                val fromAdvanced = allOptions.filter { it.title in listOf("JSON", "Manual Entry") }

                BottomSheetGroup(title = "IMPORT", options = fromImport) { option ->
                    showBottomSheet = false
                    if (option.implemented) option.onClick()
                }
                Spacer(modifier = Modifier.height(20.dp))
                BottomSheetGroup(title = "GENERATE", options = fromGenerate) { option ->
                    showBottomSheet = false
                    if (option.implemented) option.onClick()
                }
                Spacer(modifier = Modifier.height(20.dp))
                BottomSheetGroup(title = "CAPTURE", options = fromCapture) { option ->
                    showBottomSheet = false
                    if (option.implemented) option.onClick()
                }
                Spacer(modifier = Modifier.height(20.dp))
                BottomSheetGroup(title = "ADVANCED", options = fromAdvanced) { option ->
                    showBottomSheet = false
                    if (option.implemented) option.onClick()
                }
            }
        }
    }
}

// ─── Header ──────────────────────────────────────────────────────────────────

@Composable
private fun HomeHeader(
    navController: NavController,
    testsCount: Int,
    avgScore: Int,
    streak: Int,
    profileViewModel: ProfileViewModel
) {
    val profile by profileViewModel.profile.collectAsState()
    val hour = remember {
        java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
    }
    val greeting = when {
        hour < 12 -> "Good morning"
        hour < 17 -> "Good afternoon"
        else      -> "Good evening"
    }

    val initials = remember(profile.fullName, profile.email) {
        profile.fullName
            .split(" ")
            .filter { it.isNotBlank() }
            .take(2)
            .joinToString("") { it.first().uppercaseChar().toString() }
            .ifEmpty { profile.email.firstOrNull()?.uppercaseChar()?.toString() ?: "M" }
    }

    val roleGradient = remember(profile.role) {
        when (profile.role) {
            UserRole.TEACHER -> listOf(Primary, PrimaryVariant)
            UserRole.STUDENT -> listOf(Color(0xFF1DB974), Color(0xFF0EA5E9))
            UserRole.LEARNER -> listOf(Color(0xFFFF9500), Color(0xFFFF6B6B))
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 52.dp, bottom = 20.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "$greeting 👋",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = OnSurfaceMuted
                    )
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = if (profile.fullName.isNotBlank())
                               profile.fullName.split(" ").first() + "!"
                           else "Ready to Practice?",
                    style = MaterialTheme.typography.headlineMedium.copy(
                        color = OnSurface,
                        fontWeight = FontWeight.Bold
                    )
                )
            }

            // Home actions (Settings + Avatar)
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { navController.navigate(AppRoutes.Settings) }) {
                    Icon(
                        imageVector = Icons.Default.Settings,
                        contentDescription = "Settings",
                        tint = OnSurfaceMuted,
                        modifier = Modifier.size(24.dp)
                    )
                }
                Spacer(modifier = Modifier.width(4.dp))
                // Profile avatar — tappable
                Box(
                    modifier = Modifier
                        .size(46.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(
                            Brush.linearGradient(roleGradient)
                        )
                        .clickable { navController.navigate(AppRoutes.Profile) },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = initials,
                        style = MaterialTheme.typography.titleMedium.copy(
                            color = Color.White,
                            fontWeight = FontWeight.ExtraBold
                        )
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Stat pills row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            StatPill(modifier = Modifier.weight(1f), emoji = "📚", value = "$testsCount", label = "Tests")
            StatPill(modifier = Modifier.weight(1f), emoji = "⭐", value = "${avgScore}%", label = "Avg Score")
            StatPill(modifier = Modifier.weight(1f), emoji = "🔥", value = "$streak", label = "Streak")
        }
    }
}

@Composable
private fun StatPill(
    modifier: Modifier = Modifier,
    emoji: String,
    value: String,
    label: String
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(SurfaceElev1)
            .border(1.dp, Border, RoundedCornerShape(16.dp))
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(text = emoji, fontSize = 18.sp)
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium.copy(
                color = OnSurface,
                fontWeight = FontWeight.Bold
            )
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(color = OnSurfaceMuted),
            maxLines = 1
        )
    }
}

// ─── Hero Create Button ───────────────────────────────────────────────────────

@Composable
private fun CreateNewTestHero(
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    var pressed by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.97f else 1f,
        animationSpec = tween(100),
        label = "heroScale"
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .scale(scale)
            .clip(RoundedCornerShape(24.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(Color(0xFF3D5EF5), Color(0xFF9B4DFF))
                )
            )
            .clickable {
                pressed = true
                onClick()
            }
            .padding(horizontal = 24.dp, vertical = 22.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Create New Test",
                    style = MaterialTheme.typography.titleLarge.copy(
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "PDF, YouTube, Web, Topic & more",
                    style = MaterialTheme.typography.bodySmall.copy(
                        color = Color.White.copy(alpha = 0.78f)
                    )
                )
            }

            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.22f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = "Create",
                    tint = Color.White,
                    modifier = Modifier.size(26.dp)
                )
            }
        }
    }

    LaunchedEffect(pressed) {
        if (pressed) {
            kotlinx.coroutines.delay(150)
            pressed = false
        }
    }
}

// ─── Empty State ──────────────────────────────────────────────────────────────

@Composable
private fun EmptyTestsState(
    modifier: Modifier = Modifier,
    onCreateClick: () -> Unit
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(SurfaceElev1)
            .border(1.dp, Border, RoundedCornerShape(20.dp))
            .padding(vertical = 36.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(text = "📚", fontSize = 40.sp)
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = "No tests yet",
            style = MaterialTheme.typography.titleMedium.copy(
                color = OnSurface,
                fontWeight = FontWeight.SemiBold
            )
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = "Tap the button above to create\nyour first test",
            style = MaterialTheme.typography.bodySmall.copy(color = OnSurfaceMuted),
            textAlign = TextAlign.Center
        )
    }
}

// ─── Bottom Sheet Components ──────────────────────────────────────────────────

@Composable
private fun BottomSheetGroup(
    title: String,
    options: List<InputOption>,
    onOptionClick: (InputOption) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelMedium.copy(
                color = OnSurfaceMuted,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.5.sp
            ),
            modifier = Modifier.padding(bottom = 4.dp)
        )
        // 2-column grid using chunked rows
        options.chunked(2).forEach { rowOptions ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                rowOptions.forEach { option ->
                    Box(modifier = Modifier.weight(1f)) {
                        BottomSheetOptionCard(
                            option = option,
                            onClick = { onOptionClick(option) }
                        )
                    }
                }
                // If odd number of items, fill the second column with empty space
                if (rowOptions.size == 1) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun BottomSheetOptionRow(
    option: InputOption,
    onClick: () -> Unit
) {
    val enabled = option.implemented
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(SurfaceElev2)
            .border(1.dp, Border, RoundedCornerShape(14.dp))
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(option.color.copy(alpha = if (enabled) 0.13f else 0.06f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = option.icon,
                contentDescription = null,
                tint = option.color.copy(alpha = if (enabled) 1f else 0.4f),
                modifier = Modifier.size(20.dp)
            )
        }

        Spacer(modifier = Modifier.width(14.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = option.title,
                style = MaterialTheme.typography.titleSmall.copy(
                    color = OnSurface.copy(alpha = if (enabled) 1f else 0.45f),
                    fontWeight = FontWeight.SemiBold
                )
            )
            Text(
                text = option.description,
                style = MaterialTheme.typography.bodySmall.copy(
                    color = OnSurfaceMuted.copy(alpha = if (enabled) 1f else 0.45f)
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        if (!enabled) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(AccentAmber.copy(alpha = 0.13f))
                    .border(1.dp, AccentAmber.copy(alpha = 0.3f), RoundedCornerShape(50))
                    .padding(horizontal = 9.dp, vertical = 3.dp)
            ) {
                Text(
                    text = "Soon",
                    style = MaterialTheme.typography.labelSmall.copy(
                        color = AccentAmber,
                        fontWeight = FontWeight.SemiBold
                    )
                )
            }
        }
    }
}

@Composable
private fun BottomSheetOptionCard(
    option: InputOption,
    onClick: () -> Unit
) {
    val enabled = option.implemented
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(SurfaceElev2)
            .border(1.dp, Border, RoundedCornerShape(14.dp))
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(CircleShape)
                    .background(option.color.copy(alpha = if (enabled) 0.13f else 0.06f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = option.icon,
                    contentDescription = null,
                    tint = option.color.copy(alpha = if (enabled) 1f else 0.4f),
                    modifier = Modifier.size(20.dp)
                )
            }

            if (!enabled) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(AccentAmber.copy(alpha = 0.13f))
                        .border(1.dp, AccentAmber.copy(alpha = 0.3f), RoundedCornerShape(50))
                        .padding(horizontal = 7.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "Soon",
                        style = MaterialTheme.typography.labelSmall.copy(
                            color = AccentAmber,
                            fontWeight = FontWeight.SemiBold
                        )
                    )
                }
            }
        }

        Column {
            Text(
                text = option.title,
                style = MaterialTheme.typography.titleSmall.copy(
                    color = OnSurface.copy(alpha = if (enabled) 1f else 0.45f),
                    fontWeight = FontWeight.SemiBold
                )
            )
            Text(
                text = option.description,
                style = MaterialTheme.typography.bodySmall.copy(
                    color = OnSurfaceMuted.copy(alpha = if (enabled) 1f else 0.45f)
                ),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

// ─── Test History Card ────────────────────────────────────────────────────────

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TestHistoryCard(
    test: TestHistoryEntity,
    onStartTest: () -> Unit,
    onEditTest: () -> Unit,
    onShareTest: () -> Unit,
    onPublishTest: () -> Unit,
    onDeleteTest: () -> Unit,
    modifier: Modifier = Modifier
) {
    var showMenu by remember { mutableStateOf(false) }

    val bestScore = test.bestScore ?: 0
    val totalCount = test.questionCount.coerceAtLeast(1)
    val scoreFraction = (bestScore.toFloat() / totalCount.toFloat()).coerceIn(0f, 1f)

    val scoreColor = when {
        test.bestScore == null   -> OnSurfaceMuted
        scoreFraction >= 0.8f   -> AccentGreen
        scoreFraction >= 0.5f   -> AccentAmber
        else                    -> AccentRed
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(SurfaceElev1)
            .border(1.dp, Border, RoundedCornerShape(18.dp))
            .combinedClickable(
                onClick = onStartTest,
                onLongClick = { showMenu = true }
            )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {

            // Top: title + score % + menu
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = test.title,
                    style = MaterialTheme.typography.titleMedium.copy(
                        color = OnSurface,
                        fontWeight = FontWeight.SemiBold
                    ),
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.width(8.dp))

                // Score badge
                if (test.bestScorePercent != null) {
                    Text(
                        text = "${test.bestScorePercent.toInt()}%",
                        style = MaterialTheme.typography.titleMedium.copy(
                            color = scoreColor,
                            fontWeight = FontWeight.Bold
                        )
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                }

                Box {
                    IconButton(
                        onClick = { showMenu = !showMenu },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.MoreVert,
                            contentDescription = "More options",
                            tint = OnSurfaceMuted,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    DropdownMenu(
                        expanded = showMenu,
                        onDismissRequest = { showMenu = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text(if (test.lastTakenAt != null) "Retest" else "Start") },
                            onClick = { showMenu = false; onStartTest() }
                        )
                        DropdownMenuItem(
                            text = { Text("Edit") },
                            onClick = { showMenu = false; onEditTest() }
                        )
                        DropdownMenuItem(
                            text = { Text("Delete", color = AccentRed) },
                            onClick = { showMenu = false; onDeleteTest() }
                        )
                        DropdownMenuItem(
                            text = { Text("Share Link") },
                            leadingIcon = { Icon(Icons.Default.Share, null) },
                            onClick = { showMenu = false; onShareTest() }
                        )
                        DropdownMenuItem(
                            text = { Text("Publish Make Public") },
                            leadingIcon = { Icon(Icons.Default.Storefront, null, tint = Primary) },
                            onClick = { showMenu = false; onPublishTest() }
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Category + question count chips
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = test.category.ifBlank { "General" },
                    style = MaterialTheme.typography.labelSmall.copy(
                        color = OnSurfaceMuted,
                        fontWeight = FontWeight.Medium
                    )
                )
                Text(text = "•", color = OnSurfaceMuted, style = MaterialTheme.typography.labelSmall)
                Text(
                    text = "${test.questionCount ?: 0} questions",
                    style = MaterialTheme.typography.labelSmall.copy(color = OnSurfaceMuted)
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Progress bar
            val correct  = test.bestScore ?: 0
            val wrong    = test.wrongAnswers ?: 0
            val skipped  = (test.questionCount - correct - wrong).coerceAtLeast(0)
            ScoreBreakdownBar(
                correct = correct,
                wrong = wrong,
                skipped = skipped,
                total = test.questionCount,
                neverTaken = test.lastTakenAt == null,
                modifier = Modifier.padding(top = 6.dp, bottom = 2.dp)
            )

            if (test.lastTakenAt != null) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.padding(top = 4.dp)
                ) {
                    LegendDot(color = Color(0xFF4CAF50), label = "Correct $correct")
                    if (wrong > 0) LegendDot(color = Color(0xFFEF5350), label = "Wrong $wrong")
                    if (skipped > 0) LegendDot(color = Color(0xFFFFA726), label = "Skipped $skipped")
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Action buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = onStartTest,
                    modifier = Modifier.weight(1f).height(40.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Primary,
                        contentColor = Color.White
                    ),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = if (test.lastTakenAt != null) "Retest" else "Start",
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold)
                    )
                }

                OutlinedButton(
                    onClick = onEditTest,
                    modifier = Modifier.weight(1f).height(40.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = OnSurface),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(
                        text = "✏  Edit",
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium)
                    )
                }
            }
        }
    }
}

// ─── Legacy helper composables kept for compatibility ─────────────────────────

@Composable
fun StatChip(icon: ImageVector, value: String, label: String) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(SurfaceElev2)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(14.dp), tint = Primary)
        Text(text = value, style = MaterialTheme.typography.labelLarge.copy(color = Primary, fontWeight = FontWeight.Bold))
        Text(text = label, style = MaterialTheme.typography.labelSmall.copy(color = OnSurfaceMuted))
    }
}

@Composable
fun InputOptionCard(option: InputOption, onClick: () -> Unit) {
    BottomSheetOptionRow(option = option, onClick = onClick)
}

@Composable
fun InputSourceGrid(options: Map<String, List<InputOption>>, onOptionClick: (InputOption) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        options.values.flatten().forEach { option ->
            BottomSheetOptionRow(option = option, onClick = { onOptionClick(option) })
        }
    }
}

@Composable
fun MagicInputDialog(
    title: String,
    placeholder: String,
    isMultiline: Boolean = false,
    showJsonExtras: Boolean = false,
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit
) {
    var text by remember { mutableStateOf("") }
    val context = LocalContext.current

    val jsonLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            try {
                context.contentResolver.openInputStream(it)?.use { stream ->
                    text = stream.bufferedReader().use { it.readText() }
                }
            } catch (e: Exception) {
                // silent fail or you could add a toast here
            }
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceElev1),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp)
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontWeight = FontWeight.Bold,
                        color = OnSurface
                    )
                )
                Spacer(modifier = Modifier.height(16.dp))

                if (showJsonExtras) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        OutlinedButton(
                            onClick = { jsonLauncher.launch("application/json") },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(imageVector = Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Upload JSON", fontSize = 12.sp)
                        }

                        OutlinedButton(
                            onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                val clipData = clipboard.primaryClip
                                if (clipData != null && clipData.itemCount > 0) {
                                    text = clipData.getItemAt(0).text?.toString() ?: ""
                                }
                            },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(imageVector = Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Paste Clip", fontSize = 12.sp)
                        }
                    }
                }
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it },
                    placeholder = { Text(placeholder, color = OnSurfaceMuted) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(
                            min = if (isMultiline) 150.dp else 56.dp,
                            max = 400.dp
                        ),
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.Black),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Color.Black,
                        unfocusedTextColor = Color.Black,
                        cursorColor = Primary,
                        focusedBorderColor = Primary,
                        unfocusedBorderColor = Border
                    ),
                    shape = RoundedCornerShape(12.dp)
                )
                Spacer(modifier = Modifier.height(24.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    TextButton(onClick = onDismiss) {
                        Text("Cancel", color = OnSurfaceMuted)
                    }
                    Button(
                        onClick = { if (text.isNotBlank()) onSubmit(text) },
                        colors = ButtonDefaults.buttonColors(containerColor = Primary)
                    ) {
                        Text("Submit")
                    }
                }
            }
        }
    }
}

@Composable
fun ScoreBreakdownBar(
    correct: Int,
    wrong: Int,
    skipped: Int,
    total: Int,
    neverTaken: Boolean,
    modifier: Modifier = Modifier
) {
    if (neverTaken || total <= 0) {
        // Show a plain subtle track — "Not attempted yet"
        Box(
            modifier = modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(50))
                .background(Color(0xFFE0E0E0))  // light gray track
        )
        return
    }

    val totalF = total.toFloat()
    val correctFraction = (correct.toFloat() / totalF).coerceIn(0f, 1f)
    val wrongFraction   = (wrong.toFloat()   / totalF).coerceIn(0f, 1f - correctFraction)
    val skippedFraction = (skipped.toFloat() / totalF).coerceIn(0f, 1f - correctFraction - wrongFraction)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(6.dp)
            .clip(RoundedCornerShape(50))
    ) {
        // Green segment — correct
        if (correctFraction > 0f) {
            Box(
                modifier = Modifier
                    .weight(correctFraction)
                    .fillMaxHeight()
                    .background(Color(0xFF4CAF50))
            )
        }
        // Red segment — wrong
        if (wrongFraction > 0f) {
            Box(
                modifier = Modifier
                    .weight(wrongFraction)
                    .fillMaxHeight()
                    .background(Color(0xFFEF5350))
            )
        }
        // Amber segment — skipped
        if (skippedFraction > 0f) {
            Box(
                modifier = Modifier
                    .weight(skippedFraction)
                    .fillMaxHeight()
                    .background(Color(0xFFFFA726))
            )
        }
        // Gray segment — remainder
        val remainFraction = (1f - correctFraction - wrongFraction - skippedFraction).coerceAtLeast(0f)
        if (remainFraction > 0.001f) {
            Box(
                modifier = Modifier
                    .weight(remainFraction)
                    .fillMaxHeight()
                    .background(Color(0xFFE0E0E0))
            )
        }
    }
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .background(color, CircleShape)
        )
        Spacer(Modifier.width(4.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(
                fontSize = 10.sp,
                color = OnSurfaceMuted
            )
        )
    }
}

// ── Publish Dialog ────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PublishTestDialog(
    test: com.shiva.magics.data.local.TestHistoryEntity,
    onDismiss: () -> Unit,
    onPublish: (title: String, desc: String, category: String, diff: String, price: Int?) -> Unit
) {
    var title by remember { mutableStateOf(test.title) }
    var description by remember { mutableStateOf("A standard ${test.category} test.") }
    var priceStr by remember { mutableStateOf("") }
    var difficulty by remember { mutableStateOf("Medium") }
    
    val diffOptions = listOf("Easy", "Medium", "Hard")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Publish to Marketplace") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Title") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("Description") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = priceStr,
                    onValueChange = { priceStr = it },
                    label = { Text("Price (USD)") },
                    placeholder = { Text("e.g. 1.99 or leave blank for Free") },
                    modifier = Modifier.fillMaxWidth()
                )
                Column {
                    Text("Difficulty", style = MaterialTheme.typography.labelSmall)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        diffOptions.forEach { diff ->
                            FilterChip(
                                selected = difficulty == diff,
                                onClick = { difficulty = diff },
                                label = { Text(diff) }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                val parsedPrice = priceStr.toDoubleOrNull()?.let { (it * 100).toInt() }
                onPublish(title, description, test.category, difficulty, parsedPrice)
            }) {
                Text("Publish")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun StudyCoachSection(
    activePlan: com.shiva.magics.data.local.StudyPlanEntity?,
    revisionQueue: List<com.shiva.magics.data.local.RevisionQueueEntity>,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = SurfaceElev1),
        shape = RoundedCornerShape(24.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Border)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Daily Study Coach",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = OnSurface
                    )
                    Text(
                        text = "Your personalized roadmap",
                        style = MaterialTheme.typography.labelSmall,
                        color = OnSurfaceMuted
                    )
                }
                
                Icon(
                    imageVector = Icons.Default.AutoStories,
                    contentDescription = null,
                    tint = Primary,
                    modifier = Modifier.size(24.dp)
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Revision Queue (Week 2 Indicators)
            if (revisionQueue.isNotEmpty()) {
                Text(
                    text = "NEXT REVIEWS",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Black,
                    color = AccentAmber,
                    letterSpacing = 1.sp
                )
                Spacer(modifier = Modifier.height(12.dp))
                
                revisionQueue.take(3).forEach { item ->
                    val relativeTime = getRelativeTimeString(item.nextReviewAt)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = item.topic,
                            style = MaterialTheme.typography.bodyMedium,
                            color = OnSurface,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = relativeTime,
                            style = MaterialTheme.typography.bodySmall,
                            color = if (relativeTime == "Today") AccentRed else OnSurfaceMuted,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            } else {
                Text(
                    text = "No revisions pending. Keep it up! ✨",
                    style = MaterialTheme.typography.bodySmall,
                    color = OnSurfaceMuted
                )
            }

            if (activePlan != null) {
                Spacer(modifier = Modifier.height(20.dp))
                Divider(color = Border, thickness = 0.5.dp)
                Spacer(modifier = Modifier.height(16.dp))
                
                Text(
                    text = "Today's Target: ${activePlan.dailyTimeGoalMinutes} min",
                    style = MaterialTheme.typography.labelLarge,
                    color = Primary,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

fun getRelativeTimeString(timestamp: Long): String {
    val now = System.currentTimeMillis()
    val diffDays = ((timestamp - now) / (1000 * 60 * 60 * 24)).toInt()
    
    return when {
        diffDays <= 0 -> "Today"
        diffDays == 1 -> "Tomorrow"
        else -> "In $diffDays days"
    }
}

@Composable
fun DailyTaskChecklist(
    tasks: List<com.shiva.magics.data.local.DailyTaskEntity>,
    autoTests: List<com.shiva.magics.data.local.AutoGeneratedTestEntity> = emptyList(),
    onTaskToggle: (String, Boolean) -> Unit,
    onStartAutoTest: (Long) -> Unit = {},
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "Today's Tasks",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = OnSurface,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        // Autonomous Agent: Practice Tests
        autoTests.forEach { autoTest ->
            AutoTestItem(
                autoTest = autoTest,
                onStart = { onStartAutoTest(autoTest.testId) }
            )
            Spacer(modifier = Modifier.height(12.dp))
        }
        
        tasks.forEach { task ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (task.completed) SurfaceElev1.copy(alpha = 0.5f) else SurfaceElev2
                ),
                shape = RoundedCornerShape(16.dp)
            ) {
                Row(
                    modifier = Modifier
                        .padding(16.dp)
                        .fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = task.completed,
                        onCheckedChange = { onTaskToggle(task.id, it) },
                        colors = CheckboxDefaults.colors(
                            checkedColor = AccentGreen,
                            uncheckedColor = Border
                        )
                    )
                    
                    Spacer(modifier = Modifier.height(12.dp))
                    
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "${task.taskType} ${task.topic}",
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Bold,
                            color = if (task.completed) OnSurfaceMuted else OnSurface,
                            textDecoration = if (task.completed) androidx.compose.ui.text.style.TextDecoration.LineThrough else null
                        )
                        Text(
                            text = "Estimated: ${task.estimatedMinutes} min | ${task.priority}",
                            style = MaterialTheme.typography.labelSmall,
                            color = when (task.priority) {
                                "CRITICAL" -> AccentRed
                                "HIGH" -> AccentAmber
                                else -> OnSurfaceMuted
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DailyInsightCard(
    insight: com.shiva.magics.data.local.DailyInsightEntity,
    modifier: Modifier = Modifier
) {
    val backgroundColor = when (insight.priority) {
        "CRITICAL" -> Color(0xFF422020)
        "WARNING" -> Color(0xFF423720)
        else -> SurfaceElev1
    }
    val borderColor = when (insight.priority) {
        "CRITICAL" -> AccentRed.copy(alpha = 0.5f)
        "WARNING" -> AccentAmber.copy(alpha = 0.5f)
        else -> Border
    }
    val icon = when (insight.priority) {
        "CRITICAL" -> "⚠️"
        "WARNING" -> "📉"
        else -> "💡"
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(backgroundColor)
            .border(1.dp, borderColor, RoundedCornerShape(20.dp))
            .padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(text = icon, fontSize = 20.sp)
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = "Coach Insight",
                style = MaterialTheme.typography.labelLarge.copy(
                    color = OnSurface,
                    fontWeight = FontWeight.Bold
                )
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = insight.message,
            style = MaterialTheme.typography.bodyMedium.copy(
                color = OnSurface,
                lineHeight = 20.sp
            )
        )
    }
}

@Composable
private fun AutoTestItem(
    autoTest: com.shiva.magics.data.local.AutoGeneratedTestEntity,
    onStart: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceElev2),
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "🤖 AI Practice: ${autoTest.topic}",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontWeight = FontWeight.SemiBold,
                        color = OnSurface
                    )
                )
                Text(
                    text = "Auto-generated · Personalized Practice",
                    style = MaterialTheme.typography.bodySmall.copy(color = OnSurfaceMuted)
                )
            }
            Button(
                onClick = onStart,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryVariant),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Text("Start", color = Color.White, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun ReferralCard(
    referralCount: Int,
    onInviteClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(PrimaryVariant.copy(alpha = 0.8f), PrimaryVariant.copy(alpha = 0.6f))
                )
            )
            .clickable { onInviteClick() }
            .padding(20.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Refer & Earn Premium",
                style = MaterialTheme.typography.titleMedium.copy(
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )
            )
            Text(
                text = if (referralCount == 0) "Invite friends and get free premium!" else "You've invited $referralCount friends!",
                style = MaterialTheme.typography.bodySmall.copy(color = Color.White.copy(alpha = 0.8f))
            )
        }
        Button(
            onClick = onInviteClick,
            colors = ButtonDefaults.buttonColors(containerColor = Color.White),
            shape = RoundedCornerShape(12.dp),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Text("Invite", color = PrimaryVariant, fontWeight = FontWeight.Bold)
        }
    }
}
