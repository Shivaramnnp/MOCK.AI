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
import com.shiva.magics.viewmodel.EditorViewModel
import com.shiva.magics.viewmodel.HomeViewModel
import com.shiva.magics.viewmodel.ProcessingViewModel
import com.shiva.magics.viewmodel.TestPlayerViewModel
import android.content.Context
import android.content.ClipboardManager
import android.content.ClipData

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
    testPlayerViewModel: TestPlayerViewModel,
    processingViewModel: ProcessingViewModel,
    editorViewModel: EditorViewModel,
    repository: TestRepository
) {
    val tests by homeViewModel.tests.collectAsState()
    val avgScore = remember(tests) {
        if (tests.isNotEmpty()) {
            tests.mapNotNull { it.bestScorePercent }.let { scores ->
                if (scores.isNotEmpty()) scores.average().toInt() else 0
            }
        } else 0
    }
    val streak = remember(tests) { computeStreak(tests) }

    var showBottomSheet by remember { mutableStateOf(false) }
    
    // Dialog States
    var showJsonDialog by remember { mutableStateOf(false) }
    var showTopicDialog by remember { mutableStateOf(false) }
    var showUrlDialog by remember { mutableStateOf(false) }
    var showYouTubeDialog by remember { mutableStateOf(false) }
    
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
                    streak = streak
                )
            }

            // ── Hero: Create New Test ─────────────────────────────────────
            item {
                CreateNewTestHero(
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                    onClick = { showBottomSheet = true }
                )
            }

            // ── Your Tests Header ─────────────────────────────────────────
            item {
                Spacer(modifier = Modifier.height(12.dp))
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

                val fromFile = allOptions.filter { it.title in listOf("PDF", "Word / PPT", "JSON") }
                val fromInternet = allOptions.filter { it.title in listOf("Web URL", "YouTube", "Topic") }
                val fromDevice = allOptions.filter { it.title in listOf("Image", "Camera", "Voice", "Manual Entry") }

                BottomSheetGroup(title = "📁  From File", options = fromFile) { option ->
                    showBottomSheet = false
                    if (option.implemented) option.onClick()
                }
                Spacer(modifier = Modifier.height(20.dp))
                BottomSheetGroup(title = "🌐  From Internet", options = fromInternet) { option ->
                    showBottomSheet = false
                    if (option.implemented) option.onClick()
                }
                Spacer(modifier = Modifier.height(20.dp))
                BottomSheetGroup(title = "📱  From Device", options = fromDevice) { option ->
                    showBottomSheet = false
                    if (option.implemented) option.onClick()
                }
            }
        }
    }
}

// ─── Header ──────────────────────────────────────────────────────────────────

@Composable
private fun HomeHeader(navController: NavController, testsCount: Int, avgScore: Int, streak: Int) {
    val hour = remember {
        java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
    }
    val greeting = when {
        hour < 12 -> "Good morning"
        hour < 17 -> "Good afternoon"
        else      -> "Good evening"
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
            Column {
                Text(
                    text = "$greeting 👋",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = OnSurfaceMuted
                    )
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "Ready to Practice?",
                    style = MaterialTheme.typography.headlineMedium.copy(
                        color = OnSurface,
                        fontWeight = FontWeight.Bold
                    )
                )
            }

            // Home actions (Settings)
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { navController.navigate(AppRoutes.Settings) }) {
                    Icon(
                        imageVector = Icons.Default.Settings,
                        contentDescription = "Settings",
                        tint = OnSurfaceMuted,
                        modifier = Modifier.size(24.dp)
                    )
                }
                Spacer(modifier = Modifier.width(8.dp))
                // App badge
                Box(
                    modifier = Modifier
                        .size(46.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(
                            Brush.linearGradient(listOf(Primary, PrimaryVariant))
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "M",
                        style = MaterialTheme.typography.headlineSmall.copy(
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

private fun computeStreak(tests: List<TestHistoryEntity>): Int {
    val calendar = java.util.Calendar.getInstance()
    val takenDays = tests
        .mapNotNull { it.lastTakenAt }
        .map { ms ->
            calendar.timeInMillis = ms
            Triple(
                calendar.get(java.util.Calendar.YEAR),
                calendar.get(java.util.Calendar.MONTH),
                calendar.get(java.util.Calendar.DAY_OF_MONTH)
            )
        }
        .toSet()
    
    if (takenDays.isEmpty()) return 0
    
    var streak = 0
    val today = java.util.Calendar.getInstance()
    while (true) {
        val key = Triple(
            today.get(java.util.Calendar.YEAR),
            today.get(java.util.Calendar.MONTH),
            today.get(java.util.Calendar.DAY_OF_MONTH)
        )
        if (key !in takenDays) break
        streak++
        today.add(java.util.Calendar.DAY_OF_MONTH, -1)
    }
    return streak
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
                            text = { Text("Share Test") },
                            leadingIcon = { Icon(Icons.Default.Share, null) },
                            onClick = {
                                showMenu = false
                                onShareTest()
                            }
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
