package com.shiva.magics.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.shiva.magics.data.model.TestDefinition
import com.shiva.magics.data.repository.TestRepository
import com.shiva.magics.ui.navigation.AppRoutes
import com.shiva.magics.ui.theme.*
import com.shiva.magics.viewmodel.TestPlayerViewModel
import kotlinx.coroutines.launch

@Composable
fun TestPlayerScreen(
    navController: NavController,
    viewModel: TestPlayerViewModel,
    repository: TestRepository
) {
    val session by viewModel.session.collectAsState()
    val timerSeconds by viewModel.timerSeconds.collectAsState()
    val timerActive = timerSeconds > 0
    val definition = viewModel.definition

    var showExitDialog by remember { mutableStateOf(false) }
    var showSubmitDialog by remember { mutableStateOf(false) }
    val bookmarkedQuestions by viewModel.bookmarkedQuestions.collectAsState()
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    // Handle system back button
    BackHandler(enabled = navController.previousBackStackEntry != null) {
        showExitDialog = true
    }

    // Guard: if no test loaded, go back
    if (definition == null || session == null) {
        LaunchedEffect(Unit) { 
            if (navController.previousBackStackEntry != null) {
                navController.popBackStack() 
            } else {
                navController.navigate(AppRoutes.Home) {
                    popUpTo(AppRoutes.Home) { inclusive = true }
                }
            }
        }
        return
    }

    val questions = definition.questions
    val currentIndex = session!!.currentIndex
    val userAnswers = session!!.userAnswers
    val isSubmitted = session!!.isSubmitted
    val totalQuestions = questions.size
    val answeredCount = userAnswers.size

    // Auto-navigate to Results when submitted
    LaunchedEffect(isSubmitted) {
        if (isSubmitted) {
            navController.navigate(AppRoutes.Results) {
                launchSingleTop = true
            }
        }
    }

    // Scroll navigator to current question
    LaunchedEffect(currentIndex) {
        scope.launch { listState.animateScrollToItem(currentIndex) }
    }

    Scaffold(
        modifier = Modifier.background(Surface),
        topBar = {
            Card(
                modifier = Modifier.fillMaxWidth().wrapContentHeight(),
                colors = CardDefaults.cardColors(containerColor = SurfaceElev1),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    // Back button — pinned LEFT
                    IconButton(
                        onClick = { showExitDialog = true },
                        modifier = Modifier.size(32.dp).align(Alignment.CenterStart)
                    ) {
                        Icon(
                            Icons.Default.ArrowBack, contentDescription = "Back",
                            tint = OnSurface, modifier = Modifier.size(20.dp)
                        )
                    }

                    // Center column — question counter + timer chip
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "Question ${currentIndex + 1} / $totalQuestions",
                            style = MaterialTheme.typography.titleMedium.copy(
                                color = OnSurface, fontWeight = FontWeight.SemiBold
                            )
                        )
                        if (timerActive) {
                            Spacer(Modifier.height(2.dp))
                            TimerChip(seconds = timerSeconds)
                        }
                    }

                    // Submit — pinned RIGHT, NEVER moves
                    TextButton(
                        onClick = { showSubmitDialog = true },
                        modifier = Modifier.align(Alignment.CenterEnd)
                    ) {
                        Text(
                            text = "Submit",
                            style = MaterialTheme.typography.labelMedium.copy(
                                color = Primary, fontWeight = FontWeight.Medium
                            )
                        )
                    }
                }
            }
        },
        bottomBar = {
            Card(
                modifier = Modifier.fillMaxWidth().height(64.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceElev2),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(
                        onClick = { viewModel.previousQuestion() },
                        enabled = currentIndex > 0,
                        modifier = Modifier.height(36.dp).clip(RoundedCornerShape(50)),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Primary)
                    ) {
                        Text(
                            text = "← Prev",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium)
                        )
                    }

                    Card(
                        colors = CardDefaults.cardColors(containerColor = SurfaceElev3),
                        shape = RoundedCornerShape(50)
                    ) {
                        Text(
                            text = "$answeredCount answered / $totalQuestions total",
                            style = MaterialTheme.typography.labelMedium.copy(
                                color = OnSurfaceMuted,
                                fontWeight = FontWeight.Normal
                            ),
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                        )
                    }

                    val isLastQuestion = currentIndex == totalQuestions - 1

                    Button(
                        onClick = {
                            if (isLastQuestion) {
                                showSubmitDialog = true
                            } else {
                                viewModel.nextQuestion()
                            }
                        },
                        modifier = Modifier.height(36.dp).clip(RoundedCornerShape(50)),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isLastQuestion) AccentGreen else Primary,
                            contentColor = Color.White
                        )
                    ) {
                        Text(
                            text = if (isLastQuestion) "Submit ✓" else "Next →",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium)
                        )
                    }
                }
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier.fillMaxSize().padding(paddingValues)
        ) {
            // Question Navigator
            LazyRow(
                state = listState,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .background(SurfaceElev2),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(horizontal = 16.dp)
            ) {
                items(totalQuestions) { index ->
                    QuestionNavigatorItem(
                        questionNumber = index + 1,
                        isCurrent = index == currentIndex,
                        isAnswered = userAnswers.containsKey(index),
                        isBookmarked = index in bookmarkedQuestions,
                        onClick = { viewModel.goToQuestion(index) }
                    )
                }
            }

            // Question Content
            if (questions.isNotEmpty() && currentIndex < questions.size) {
                val question = questions[currentIndex]
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 24.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    item {
                        QuestionCard(
                            questionText = question.questionText,
                            questionNumber = currentIndex + 1,
                            options = question.options,
                            selectedIndex = userAnswers[currentIndex] ?: -1,
                            isSubmitted = isSubmitted,
                            correctIndex = question.correctAnswerIndex,
                            isBookmarked = currentIndex in bookmarkedQuestions,
                            onBookmarkToggle = {
                                viewModel.toggleBookmark(currentIndex)
                            },
                            onOptionSelect = { optIndex ->
                                if (!isSubmitted) viewModel.selectAnswer(optIndex)
                            }
                        )
                    }
                }
            }
        }
    }

    // Exit Dialog
    if (showExitDialog) {
        AlertDialog(
            onDismissRequest = { showExitDialog = false },
            title = {
                Text(
                    text = "Exit Test?",
                    style = MaterialTheme.typography.headlineSmall.copy(
                        color = OnSurface, fontWeight = FontWeight.Bold
                    )
                )
            },
            text = {
                Text(
                    text = "Your progress will be lost.",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = OnSurfaceMuted, fontWeight = FontWeight.Normal
                    )
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showExitDialog = false
                    viewModel.clearTest()
                    if (navController.previousBackStackEntry != null) {
                        navController.popBackStack()
                    } else {
                        navController.navigate(AppRoutes.Home) {
                            popUpTo(AppRoutes.Home) { inclusive = true }
                        }
                    }
                }) {
                    Text(
                        text = "Exit Anyway",
                        style = MaterialTheme.typography.labelMedium.copy(
                            color = AccentRed, fontWeight = FontWeight.Medium
                        )
                    )
                }
            },
            dismissButton = {
                Button(
                    onClick = { showExitDialog = false },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Primary, contentColor = Color.White
                    )
                ) {
                    Text(text = "Continue Test")
                }
            }
        )
    }

    // Submit Dialog
    if (showSubmitDialog) {
        val unanswered = totalQuestions - answeredCount
        AlertDialog(
            onDismissRequest = { showSubmitDialog = false },
            title = {
                Text(
                    text = "Submit Test?",
                    style = MaterialTheme.typography.headlineSmall.copy(
                        color = OnSurface, fontWeight = FontWeight.Bold
                    )
                )
            },
            text = {
                Text(
                    text = if (unanswered > 0)
                        "You have $unanswered unanswered question(s). Submit anyway?"
                    else
                        "All $totalQuestions questions answered. Ready to submit!",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = OnSurfaceMuted, fontWeight = FontWeight.Normal
                    )
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showSubmitDialog = false
                        viewModel.submitTest()
                        // Navigation handled by LaunchedEffect(isSubmitted)
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Primary, contentColor = Color.White
                    )
                ) {
                    Text(text = "Submit")
                }
            },
            dismissButton = {
                TextButton(onClick = { showSubmitDialog = false }) {
                    Text(
                        text = "Cancel",
                        style = MaterialTheme.typography.labelMedium.copy(
                            color = OnSurfaceMuted, fontWeight = FontWeight.Medium
                        )
                    )
                }
            }
        )
    }
}

@Composable
fun QuestionNavigatorItem(
    questionNumber: Int,
    isCurrent: Boolean,
    isAnswered: Boolean,
    isBookmarked: Boolean,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(
                color = when {
                    isCurrent -> Primary
                    isAnswered -> AccentGreen
                    else -> SurfaceElev3
                }
            )
            .border(
                width = if (!isAnswered && !isCurrent) 1.dp else 0.dp,
                color = Border,
                shape = CircleShape
            )
            .clickable { onClick() }
            .then(if (isCurrent) Modifier.shadow(4.dp, CircleShape) else Modifier),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "$questionNumber",
            color = if (isCurrent || isAnswered) Color.White else OnSurfaceMuted,
            style = MaterialTheme.typography.labelMedium.copy(
                fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal
            )
        )
        if (isBookmarked) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(AccentAmber, CircleShape)
                    .align(Alignment.TopEnd)
            )
        }
    }
}

@Composable
fun QuestionCard(
    questionText: String,
    questionNumber: Int,
    options: List<String>,
    selectedIndex: Int,
    isSubmitted: Boolean,
    correctIndex: Int,
    isBookmarked: Boolean,
    onBookmarkToggle: () -> Unit,
    onOptionSelect: (Int) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = SurfaceElev1),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Question $questionNumber",
                    style = MaterialTheme.typography.labelMedium.copy(
                        color = OnSurfaceMuted, fontWeight = FontWeight.Normal
                    )
                )
                IconButton(
                    onClick = onBookmarkToggle,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = if (isBookmarked) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                        contentDescription = "Bookmark",
                        tint = if (isBookmarked) AccentAmber else OnSurfaceMuted,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = questionText,
                style = MaterialTheme.typography.titleMedium.copy(
                    color = OnSurface,
                    fontWeight = FontWeight.Medium,
                    lineHeight = 24.sp
                )
            )

            Spacer(modifier = Modifier.height(24.dp))

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                options.forEachIndexed { index, option ->
                    val isCorrect: Boolean? = if (isSubmitted) index == correctIndex else null
                    val isWrong: Boolean? = if (isSubmitted && index == selectedIndex && index != correctIndex) true else null

                    OptionCard(
                        optionLetter = 'A' + index,
                        optionText = option,
                        isSelected = selectedIndex == index,
                        isCorrect = isCorrect,
                        isWrong = isWrong == true,
                        onClick = { onOptionSelect(index) }
                    )
                }
            }
        }
    }
}

@Composable
fun OptionCard(
    optionLetter: Char,
    optionText: String,
    isSelected: Boolean,
    isCorrect: Boolean?,
    isWrong: Boolean,
    onClick: () -> Unit
) {
    val borderColor = when {
        isCorrect == true -> AccentGreen
        isWrong -> AccentRed
        isSelected -> Primary
        else -> Border
    }
    val backgroundColor = when {
        isCorrect == true -> AccentGreen.copy(alpha = 0.1f)
        isWrong -> AccentRed.copy(alpha = 0.1f)
        isSelected -> SurfaceElev2
        else -> SurfaceElev1
    }
    val letterColor = when {
        isCorrect == true -> AccentGreen
        isWrong -> AccentRed
        isSelected -> Primary
        else -> OnSurfaceMuted
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .border(1.dp, borderColor, RoundedCornerShape(12.dp)),
        colors = CardDefaults.cardColors(containerColor = backgroundColor),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(color = if (isSelected || isCorrect == true || isWrong) letterColor else SurfaceElev3),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = optionLetter.toString(),
                    color = if (isSelected || isCorrect == true || isWrong) Color.White else OnSurfaceMuted,
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Text(
                text = optionText,
                style = MaterialTheme.typography.bodyLarge.copy(
                    color = OnSurface, fontWeight = FontWeight.Normal
                ),
                modifier = Modifier.weight(1f)
            )

            if (isCorrect == true) {
                Text("✓", color = AccentGreen,
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold))
            } else if (isWrong) {
                Text("✗", color = AccentRed,
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold))
            }
        }
    }
}

@Composable
private fun TimerChip(seconds: Int) {
    // Warning thresholds
    val isWarning = seconds <= 30   // yellow
    val isDanger  = seconds <= 10   // red + flash

    // Flashing animation — only when isDanger
    val flashAnim = rememberInfiniteTransition(label = "flash")
    val flashAlpha by flashAnim.animateFloat(
        initialValue = 1f,
        targetValue  = if (isDanger) 0.2f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(400, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "flashAlpha"
    )

    val chipColor = when {
        isDanger  -> Color(0xFFE53935)   // red
        isWarning -> Color(0xFFF59E0B)   // amber
        else      -> Color(0xFF534AB7)   // purple (matches app Primary)
    }

    val minutes = seconds / 60
    val secs    = seconds % 60
    val label   = if (minutes > 0) "%d:%02d".format(minutes, secs)
                  else             "0:%02d".format(secs)

    Surface(
        shape  = RoundedCornerShape(50),
        color  = chipColor.copy(alpha = 0.15f),
        border = BorderStroke(1.dp, if (isDanger) chipColor.copy(alpha = flashAlpha) else chipColor),
        modifier = Modifier.height(22.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 10.dp)
        ) {
            // Clock icon ⏱
            Text("⏱", fontSize = 11.sp,
                modifier = Modifier.graphicsLayer(alpha = if (isDanger) flashAlpha else 1f))
            Spacer(Modifier.width(4.dp))
            Text(
                text  = label,
                style = MaterialTheme.typography.labelSmall.copy(
                    color      = if (isDanger) chipColor.copy(alpha = flashAlpha) else chipColor,
                    fontWeight = FontWeight.Bold,
                    fontSize   = 12.sp
                )
            )
        }
    }
}
