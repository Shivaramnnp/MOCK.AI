package com.shivasruthi.magics.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.navigation.NavController
import com.shivasruthi.magics.data.local.TestHistoryEntity
import com.shivasruthi.magics.data.model.Question
import com.shivasruthi.magics.data.model.TestDefinition
import com.shivasruthi.magics.data.repository.TestRepository
import com.shivasruthi.magics.ui.navigation.AppRoutes
import com.shivasruthi.magics.viewmodel.EditorViewModel
import com.shivasruthi.magics.viewmodel.HomeViewModel
import com.shivasruthi.magics.viewmodel.ProcessingViewModel
import com.shivasruthi.magics.viewmodel.TestPlayerViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import com.shivasruthi.magics.data.model.InputSource

data class InputOption(
    val title: String,
    val description: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val category: String,
    val isImplemented: Boolean = false,
    val onClick: () -> Unit
)

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
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
    var selectedTest by remember { mutableStateOf<TestHistoryEntity?>(null) }
    var selectedTimerSeconds by remember { mutableIntStateOf(0) }
    var showDeleteDialog by remember { mutableStateOf<TestHistoryEntity?>(null) }
    
    // Bottom Sheet State
    var showBottomSheet by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    var searchQuery by remember { mutableStateOf("") }
    
    // Dialog States
    var showJsonDialog by remember { mutableStateOf(false) }
    var showTopicDialog by remember { mutableStateOf(false) }
    var showUrlDialog by remember { mutableStateOf(false) }
    var showYouTubeDialog by remember { mutableStateOf(false) }
    var showVoiceDialog by remember { mutableStateOf(false) }
    
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val pdfLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            showBottomSheet = false
            processingViewModel.processFile(context, uri, "application/pdf", "document.pdf")
            navController.navigate(AppRoutes.Processing)
        }
    }

    val docxLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            showBottomSheet = false
            val contentResolver = context.contentResolver
            val mimeType = contentResolver.getType(uri) ?: ""
            val cursor = contentResolver.query(uri, null, null, null, null)
            var name = "document"
            cursor?.use {
                if (it.moveToFirst()) {
                    val index = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    if (index != -1) {
                        name = it.getString(index)
                    }
                }
            }
            processingViewModel.processFile(context, uri, mimeType, name)
            navController.navigate(AppRoutes.Processing)
        }
    }

    val galleryLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) {
            showBottomSheet = false
            processingViewModel.processFile(context, uri, "image/jpeg", "image.jpg")
            navController.navigate(AppRoutes.Processing)
        }
    }

    // --- Input Options Configuration ---
    val allOptions = remember {
        listOf(
            // From File
            InputOption("PDF", "Upload a PDF document", Icons.Default.PictureAsPdf, "From File", true) { pdfLauncher.launch(arrayOf("application/pdf")) },
            InputOption("Word / PPT", "Upload DOCX or PPTX", Icons.Default.AutoStories, "From File", true) { 
                docxLauncher.launch(
                    arrayOf(
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                    )
                ) 
            },
            InputOption("JSON", "Paste or upload JSON", Icons.Default.Edit, "From File", true) { showJsonDialog = true },
            
            // From Internet
            InputOption("Web URL", "Scrape text from a webpage", Icons.Default.AutoStories, "From Internet", true) { showUrlDialog = true },
            InputOption("YouTube", "Extract transcript from video", Icons.Default.AutoStories, "From Internet", true) { showYouTubeDialog = true },
            InputOption("Topic", "Just type a topic name", Icons.Default.Edit, "From Internet", true) { showTopicDialog = true },

            // From Device
            InputOption("Image", "Upload from gallery", Icons.Default.Image, "From Device", true) { galleryLauncher.launch("image/*") },
            InputOption("Camera", "Scan a physical page", Icons.Default.Image, "From Device", true) { 
                showBottomSheet = false
                navController.navigate(AppRoutes.Camera) 
            },
            InputOption("Voice", "Record audio or upload file", Icons.Default.AutoStories, "From Device", true) { showVoiceDialog = true },
            InputOption("Manual Entry", "Write questions yourself", Icons.Default.Edit, "From Device", true) {
                showBottomSheet = false
                editorViewModel.setQuestions(listOf(Question("", List(4) { "" }, -1)))
                navController.navigate(AppRoutes.Editor)
            }
        )
    }

    val filteredCategories = allOptions
        .filter { it.title.contains(searchQuery, ignoreCase = true) || it.description.contains(searchQuery, ignoreCase = true) }
        .groupBy { it.category }

    Scaffold(
        floatingActionButtonPosition = FabPosition.End,
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showBottomSheet = true },
                icon = { Icon(Icons.Default.Add, contentDescription = "Create") },
                text = { Text("Create Test") }
            )
        }
    ) { paddingValues ->
        Column(modifier = Modifier.fillMaxSize().padding(paddingValues)) {
            // Header
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(start = 24.dp, end = 24.dp, top = 32.dp, bottom = 16.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.AutoStories,
                        contentDescription = "Logo",
                        modifier = Modifier.size(32.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(16.dp))
                    Column {
                        Text(
                            text = "MagicS",
                            style = MaterialTheme.typography.displaySmall,
                            fontWeight = FontWeight.ExtraBold
                        )
                        Text(
                            text = "Turn any document into a mock test",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                    }
                }
            }

            // Test List
            LazyColumn(
                modifier = Modifier.fillMaxWidth().weight(1f),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 100.dp)
            ) {
                if (tests.isEmpty()) {
                    item {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(top = 64.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            val surfaceVariant = MaterialTheme.colorScheme.surfaceVariant
                            val outline = MaterialTheme.colorScheme.outline
                            val surface = MaterialTheme.colorScheme.surface
                            Canvas(modifier = Modifier.size(200.dp, 180.dp)) {
                                drawRoundRect(
                                    color = surfaceVariant,
                                    topLeft = Offset(24f, 24f),
                                    size = Size(size.width - 24f, size.height - 24f),
                                    cornerRadius = CornerRadius(24f, 24f)
                                )
                                drawRoundRect(
                                    color = surfaceVariant.copy(alpha = 0.8f),
                                    topLeft = Offset(12f, 12f),
                                    size = Size(size.width - 24f, size.height - 24f),
                                    cornerRadius = CornerRadius(24f, 24f)
                                )
                                drawRoundRect(
                                    color = surface,
                                    topLeft = Offset(0f, 0f),
                                    size = Size(size.width - 24f, size.height - 24f),
                                    cornerRadius = CornerRadius(24f, 24f)
                                )
                                drawLine(
                                    color = outline.copy(alpha = 0.4f),
                                    start = Offset(40f, 60f),
                                    end = Offset(size.width - 64f, 60f),
                                    strokeWidth = 8f
                                )
                                drawLine(
                                    color = outline.copy(alpha = 0.4f),
                                    start = Offset(40f, 100f),
                                    end = Offset(size.width - 100f, 100f),
                                    strokeWidth = 8f
                                )
                                drawLine(
                                    color = outline.copy(alpha = 0.4f),
                                    start = Offset(40f, 140f),
                                    end = Offset(size.width - 64f, 140f),
                                    strokeWidth = 8f
                                )
                            }
                            Spacer(modifier = Modifier.height(24.dp))
                            Text("No tests yet", style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
                            Text(
                                "Tap + to create your first test",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                } else {
                    item {
                        Text(
                            text = "Your Tests",
                            style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.padding(vertical = 16.dp)
                        )
                    }
                    items(tests, key = { it.id }) { test ->
                        TestHistoryCard(
                            test = test,
                            isSelected = selectedTest?.id == test.id,
                            onClick = { selectedTest = if (selectedTest?.id == test.id) null else test },
                            onLongClick = { showDeleteDialog = test },
                            modifier = Modifier.animateItem()
                        )
                    }
                }
            }

            AnimatedVisibility(visible = selectedTest != null, enter = slideInVertically { it }) {
                selectedTest?.let { test ->
                    ElevatedCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        elevation = CardDefaults.elevatedCardElevation(8.dp)
                    ) {
                        Column(modifier = Modifier.padding(20.dp)) {
                            Text(test.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                AssistChip(onClick = {}, label = { Text("${test.questionCount} Questions") })
                                AssistChip(onClick = {}, label = { Text("~${(test.questionCount * 1.5).toInt()} min") })
                                AssistChip(
                                    onClick = {},
                                    label = { Text(test.bestScorePercent?.let { "Best: ${it.toInt()}%" } ?: "Not taken") }
                                )
                            }
                            Spacer(modifier = Modifier.height(16.dp))
                            Text("Timer", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                            Spacer(modifier = Modifier.height(8.dp))
                            
                            var customTimer by remember { mutableStateOf(false) }
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                item { FilterChip(selected = selectedTimerSeconds == 0 && !customTimer, onClick = { selectedTimerSeconds = 0; customTimer = false }, label = { Text("No Timer") }) }
                                item { FilterChip(selected = selectedTimerSeconds == 1800 && !customTimer, onClick = { selectedTimerSeconds = 1800; customTimer = false }, label = { Text("30 min") }) }
                                item { FilterChip(selected = selectedTimerSeconds == 2700 && !customTimer, onClick = { selectedTimerSeconds = 2700; customTimer = false }, label = { Text("45 min") }) }
                                item { FilterChip(selected = selectedTimerSeconds == 3600 && !customTimer, onClick = { selectedTimerSeconds = 3600; customTimer = false }, label = { Text("60 min") }) }
                                item { FilterChip(selected = customTimer, onClick = { customTimer = true }, label = { Text("Custom") }) }
                            }
                            AnimatedVisibility(visible = customTimer) {
                                Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                                    var sliderValue by remember { mutableFloatStateOf(selectedTimerSeconds / 60f) }
                                    if (sliderValue < 5f) sliderValue = 5f
                                    Slider(
                                        value = sliderValue,
                                        onValueChange = { sliderValue = it; selectedTimerSeconds = (it * 60).toInt() },
                                        valueRange = 5f..180f,
                                        steps = 34
                                    )
                                    Text("${selectedTimerSeconds / 60} minutes", style = MaterialTheme.typography.labelMedium, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
                                }
                            }

                            Spacer(modifier = Modifier.height(16.dp))
                            Button(
                                modifier = Modifier.fillMaxWidth(),
                                onClick = {
                                    scope.launch {
                                        val testWithQ = repository.getTestWithQuestions(test.id).first()
                                        val definitions = with(repository) {
                                            testWithQ.questions.map { it.toQuestion() }
                                        }
                                        testPlayerViewModel.loadTest(
                                            definition = TestDefinition(
                                                dbId = test.id,
                                                title = test.title,
                                                category = test.category,
                                                questions = definitions
                                            ),
                                            timerDurationSeconds = selectedTimerSeconds
                                        )
                                        navController.navigate(AppRoutes.TestPlayer)
                                    }
                                }
                            ) {
                                Text("Start Test", style = MaterialTheme.typography.titleMedium)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showBottomSheet) {
        ModalBottomSheet(
            onDismissRequest = { showBottomSheet = false; searchQuery = "" },
            sheetState = sheetState,
            dragHandle = { BottomSheetDefaults.DragHandle() }
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp)
                    .padding(bottom = 32.dp)
            ) {
                Text(
                    text = "Create Mock Test",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 16.dp)
                )

                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Search input types...") },
                    leadingIcon = { Icon(Icons.Default.AutoStories, contentDescription = "Search") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 24.dp),
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp)
                )

                LazyColumn(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(24.dp)
                ) {
                    filteredCategories.forEach { (category, options) ->
                        item {
                            Text(
                                text = category,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(bottom = 8.dp)
                            )
                        }
                        
                        // We use a DIY grid here since LazyVerticalGrid inside a LazyColumn 
                        // sometimes has measurement issues
                        val columns = 2
                        val chunkedOptions = options.chunked(columns)
                        
                        items(chunkedOptions) { rowOptions ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                for (option in rowOptions) {
                                    ElevatedCard(
                                        onClick = option.onClick,
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(16.dp),
                                        colors = CardDefaults.elevatedCardColors(
                                            containerColor = if (option.isImplemented) 
                                                MaterialTheme.colorScheme.surfaceColorAtElevation(2.dp) 
                                            else 
                                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                                        )
                                    ) {
                                        Column(
                                            modifier = Modifier.padding(16.dp),
                                            horizontalAlignment = Alignment.Start
                                        ) {
                                            Icon(
                                                imageVector = option.icon,
                                                contentDescription = option.title,
                                                tint = if (option.isImplemented) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                                modifier = Modifier.padding(bottom = 12.dp)
                                            )
                                            Text(
                                                text = option.title,
                                                style = MaterialTheme.typography.bodyLarge,
                                                fontWeight = FontWeight.SemiBold,
                                                modifier = Modifier.padding(bottom = 4.dp),
                                                color = if (!option.isImplemented) MaterialTheme.colorScheme.onSurfaceVariant else Color.Unspecified
                                            )
                                            Text(
                                                text = option.description,
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                                                maxLines = 2,
                                                lineHeight = androidx.compose.ui.unit.TextUnit(14f, androidx.compose.ui.unit.TextUnitType.Sp)
                                            )
                                        }
                                    }
                                }
                                // Fill empty spaces if the row isn't full
                                val emptySpaces = columns - rowOptions.size
                                for (i in 0 until emptySpaces) {
                                    Spacer(modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showDeleteDialog != null) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = null },
            title = { Text("Delete Test") },
            text = { Text("Delete \"${showDeleteDialog!!.title}\"? This cannot be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    homeViewModel.deleteTest(showDeleteDialog!!.id)
                    showDeleteDialog = null
                    selectedTest = null
                }) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = null }) { Text("Cancel") }
            }
        )
    }

    if (showJsonDialog) {
        var jsonText by remember { mutableStateOf("") }
        val jsonLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            if (uri != null) {
                showJsonDialog = false
                showBottomSheet = false
                scope.launch {
                    val text = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } ?: ""
                    processingViewModel.generateQuestionsFromText(text, InputSource.Json, "file.json")
                    navController.navigate(AppRoutes.Processing)
                }
            }
        }

        AlertDialog(
            onDismissRequest = { showJsonDialog = false },
            title = { Text("From JSON") },
            text = {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text("Paste raw JSON below or upload a .json file.", style = MaterialTheme.typography.bodyMedium)
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedTextField(
                        value = jsonText,
                        onValueChange = { jsonText = it },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(150.dp),
                        placeholder = { Text("{\n  \"questions\": [\n    ...\n  ]\n}") }
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedButton(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { jsonLauncher.launch(arrayOf("application/json", "*/*")) }
                    ) {
                        Text("Upload .json File")
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (jsonText.isNotBlank()) {
                            showJsonDialog = false
                            showBottomSheet = false
                            processingViewModel.generateQuestionsFromText(jsonText, InputSource.Json, "Pasted JSON")
                            navController.navigate(AppRoutes.Processing)
                        }
                    },
                    enabled = jsonText.isNotBlank()
                ) {
                    Text("Parse JSON")
                }
            },
            dismissButton = {
                TextButton(onClick = { showJsonDialog = false }) { Text("Cancel") }
            }
        )
    }

    if (showTopicDialog) {
        var topicText by remember { mutableStateOf("") }

        AlertDialog(
            onDismissRequest = { showTopicDialog = false },
            title = { Text("From Topic") },
            text = {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text("Enter any topic and the AI will generate questions for you.", style = MaterialTheme.typography.bodyMedium)
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedTextField(
                        value = topicText,
                        onValueChange = { topicText = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("e.g. Photosynthesis, Indian History...") },
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Examples:", style = MaterialTheme.typography.labelMedium)
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.padding(top = 8.dp)
                    ) {
                        item { AssistChip(onClick = { topicText = "Photosynthesis" }, label = { Text("Photosynthesis") }) }
                        item { AssistChip(onClick = { topicText = "Indian History" }, label = { Text("Indian History") }) }
                        item { AssistChip(onClick = { topicText = "Trigonometry" }, label = { Text("Trigonometry") }) }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (topicText.isNotBlank()) {
                            showTopicDialog = false
                            showBottomSheet = false
                            processingViewModel.generateQuestionsFromText(topicText, InputSource.Topic, "Topic: $topicText")
                            navController.navigate(AppRoutes.Processing)
                        }
                    },
                    enabled = topicText.isNotBlank()
                ) {
                    Text("Generate")
                }
            },
            dismissButton = {
                TextButton(onClick = { showTopicDialog = false }) { Text("Cancel") }
            }
        )
    }

    if (showUrlDialog) {
        var urlText by remember { mutableStateOf("") }

        AlertDialog(
            onDismissRequest = { showUrlDialog = false },
            title = { Text("From Web URL") },
            text = {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text("Paste a link to any article, blog post, or Wikipedia page.", style = MaterialTheme.typography.bodyMedium)
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedTextField(
                        value = urlText,
                        onValueChange = { urlText = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("https://example.com/article...") },
                        singleLine = true,
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Uri)
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (urlText.isNotBlank()) {
                            showUrlDialog = false
                            showBottomSheet = false
                            processingViewModel.processWebUrl(urlText)
                            navController.navigate(AppRoutes.Processing)
                        }
                    },
                    enabled = urlText.isNotBlank() && android.util.Patterns.WEB_URL.matcher(urlText).matches()
                ) {
                    Text("Extract")
                }
            },
            dismissButton = {
                TextButton(onClick = { showUrlDialog = false }) { Text("Cancel") }
            }
        )
    }

    if (showYouTubeDialog) {
        var ytUrlText by remember { mutableStateOf("") }

        AlertDialog(
            onDismissRequest = { showYouTubeDialog = false },
            title = { Text("From YouTube") },
            text = {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text("Paste a link to any YouTube video with captions.", style = MaterialTheme.typography.bodyMedium)
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedTextField(
                        value = ytUrlText,
                        onValueChange = { ytUrlText = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("https://youtube.com/watch?v=...") },
                        singleLine = true,
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Uri)
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (ytUrlText.isNotBlank()) {
                            showYouTubeDialog = false
                            showBottomSheet = false
                            processingViewModel.processYouTubeUrl(ytUrlText)
                            navController.navigate(AppRoutes.Processing)
                        }
                    },
                    enabled = ytUrlText.isNotBlank() && (ytUrlText.contains("youtube.com") || ytUrlText.contains("youtu.be"))
                ) {
                    Text("Extract")
                }
            },
            dismissButton = {
                TextButton(onClick = { showYouTubeDialog = false }) { Text("Cancel") }
            }
        )
    }

    if (showVoiceDialog) {
        var voiceText by remember { mutableStateOf("") }
        var isListening by remember { mutableStateOf(false) }

        val speechRecognizer = remember { android.speech.SpeechRecognizer.createSpeechRecognizer(context) }
        val speechRecognizerIntent = remember {
            android.content.Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(android.speech.RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            }
        }

        DisposableEffect(Unit) {
            val listener = object : android.speech.RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() { isListening = false }
                override fun onError(error: Int) { isListening = false }
                override fun onResults(results: Bundle?) {
                    val matches = results?.getStringArrayList(android.speech.SpeechRecognizer.RESULTS_RECOGNITION)
                    if (!matches.isNullOrEmpty()) {
                        voiceText = matches[0]
                    }
                    isListening = false
                }
                override fun onPartialResults(partialResults: Bundle?) {
                    val matches = partialResults?.getStringArrayList(android.speech.SpeechRecognizer.RESULTS_RECOGNITION)
                    if (!matches.isNullOrEmpty()) {
                        voiceText = matches[0]
                    }
                }
                override fun onEvent(eventType: Int, params: Bundle?) {}
            }
            speechRecognizer.setRecognitionListener(listener)
            onDispose {
                speechRecognizer.destroy()
            }
        }

        val audioPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                isListening = true
                speechRecognizer.startListening(speechRecognizerIntent)
            }
        }

        AlertDialog(
            onDismissRequest = { 
                if (isListening) speechRecognizer.stopListening()
                showVoiceDialog = false 
            },
            title = { Text("From Voice") },
            text = {
                Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Dictate text to generate questions.", style = MaterialTheme.typography.bodyMedium)
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedTextField(
                        value = voiceText,
                        onValueChange = { voiceText = it },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(150.dp),
                        placeholder = { Text("Tap microphone to start speaking...") }
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    FloatingActionButton(
                        onClick = {
                            if (isListening) {
                                speechRecognizer.stopListening()
                                isListening = false
                            } else {
                                if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                                    isListening = true
                                    speechRecognizer.startListening(speechRecognizerIntent)
                                } else {
                                    audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                }
                            }
                        },
                        containerColor = if (isListening) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer
                    ) {
                        Icon(
                            imageVector = if (isListening) Icons.Default.Stop else Icons.Default.Mic,
                            contentDescription = if (isListening) "Stop" else "Listen",
                            tint = if (isListening) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (voiceText.isNotBlank()) {
                            if (isListening) speechRecognizer.stopListening()
                            showVoiceDialog = false
                            showBottomSheet = false
                            processingViewModel.generateQuestionsFromText(voiceText, InputSource.Audio, "Dictated Audio")
                            navController.navigate(AppRoutes.Processing)
                        }
                    },
                    enabled = voiceText.isNotBlank() && !isListening
                ) {
                    Text("Generate")
                }
            },
            dismissButton = {
                TextButton(onClick = { 
                    if (isListening) speechRecognizer.stopListening()
                    showVoiceDialog = false 
                }) { Text("Cancel") }
            }
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TestHistoryCard(
    test: TestHistoryEntity,
    isSelected: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ElevatedCard(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .border(
                width = if (isSelected) 2.dp else 0.dp,
                color = if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent,
                shape = RoundedCornerShape(16.dp)
            ),
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(
            modifier = Modifier
                .combinedClickable(onClick = onClick, onLongClick = onLongClick)
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = test.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "${test.questionCount} questions · ${test.category}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
                Spacer(modifier = Modifier.height(8.dp))
                SuggestionChip(
                    onClick = {},
                    label = {
                        Text(
                            text = if (test.lastTakenAt == null) "Never taken"
                            else "Last taken: ${formatRelativeDate(test.lastTakenAt)}"
                        )
                    }
                )
            }
            if (test.bestScorePercent != null) {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.size(52.dp)) {
                    CircularProgressIndicator(
                        progress = { test.bestScorePercent / 100f },
                        modifier = Modifier.size(52.dp),
                        color = if (test.bestScorePercent >= 60f) Color(0xFF2D7A4A) else Color(0xFFC0432A),
                        strokeWidth = 4.dp,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                    Text(
                        text = "${test.bestScorePercent.toInt()}%",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

fun formatRelativeDate(timestamp: Long): String {
    val format = SimpleDateFormat("MMM dd, yyyy", Locale.getDefault())
    return format.format(Date(timestamp))
}
