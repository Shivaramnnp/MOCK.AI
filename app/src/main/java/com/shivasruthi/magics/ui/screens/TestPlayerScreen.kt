package com.shivasruthi.magics.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.InfiniteRepeatableSpec
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.shivasruthi.magics.ui.navigation.AppRoutes
import com.shivasruthi.magics.ui.theme.DmMonoFamily
import com.shivasruthi.magics.data.repository.TestRepository
import com.shivasruthi.magics.viewmodel.TestPlayerViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TestPlayerScreen(
    navController: NavController,
    viewModel: TestPlayerViewModel,
    repository: TestRepository
) {
    val session by viewModel.session.collectAsState()
    val definition = viewModel.definition
    val timerSeconds by viewModel.timerSeconds.collectAsState()
    var showExitDialog by remember { mutableStateOf(false) }
    var showSubmitDialog by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()

    LaunchedEffect(session?.isSubmitted) {
        if (session?.isSubmitted == true) {
            navController.navigate(AppRoutes.Results) {
                popUpTo(AppRoutes.Home)
            }
        }
    }

    LaunchedEffect(session?.currentIndex) {
        session?.currentIndex?.let {
            coroutineScope.launch {
                listState.animateScrollToItem(it)
            }
        }
    }

    BackHandler {
        showExitDialog = true
    }

    if (definition == null || session == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    val timerActive = session!!.timerRemainingSeconds > 0
    val timerColor by animateColorAsState(
        targetValue = when {
            timerSeconds == 0 || !timerActive -> MaterialTheme.colorScheme.onSurface
            timerSeconds < 60 -> Color(0xFFE74C3C)
            timerSeconds < 300 -> Color(0xFFE67E22)
            else -> MaterialTheme.colorScheme.onSurface
        },
        label = "timerColor"
    )

    val timerAlpha by rememberInfiniteTransition(label = "timerAlpha").animateFloat(
        initialValue = 1f,
        targetValue = if (timerSeconds in 1..30) 0.3f else 1f,
        animationSpec = InfiniteRepeatableSpec(tween(500)),
        label = "timerAlpha"
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(definition.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    IconButton(onClick = { showExitDialog = true }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Exit")
                    }
                },
                actions = {
                    if (timerActive) {
                        Text(
                            text = formatTime(timerSeconds),
                            style = MaterialTheme.typography.labelLarge,
                            fontFamily = DmMonoFamily,
                            color = timerColor,
                            modifier = Modifier
                                .alpha(timerAlpha)
                                .padding(end = 16.dp)
                        )
                    }
                }
            )
        },
        bottomBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                OutlinedButton(
                    onClick = { viewModel.previousQuestion() },
                    enabled = session!!.currentIndex > 0
                ) {
                    Text("Previous")
                }
                
                if (session!!.currentIndex == definition.questions.size - 1) {
                    Button(onClick = { showSubmitDialog = true }) {
                        Text("Submit")
                    }
                } else {
                    Button(onClick = { viewModel.nextQuestion() }) {
                        Text("Next")
                    }
                }
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Progress Section
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    Text(
                        "Q ${session!!.currentIndex + 1} of ${definition.questions.size}",
                        style = MaterialTheme.typography.labelMedium
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                LinearProgressIndicator(
                    progress = { (session!!.currentIndex + 1f) / definition.questions.size },
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.primary,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )
            }

            val currentQuestion = definition.questions[session!!.currentIndex]

            // Question Card
            ElevatedCard(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                elevation = CardDefaults.elevatedCardElevation(4.dp)
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    AssistChip(onClick = {}, label = { Text("Question ${session!!.currentIndex + 1}") })
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(currentQuestion.questionText, style = MaterialTheme.typography.titleMedium)
                }
            }

            // Options List
            com.shivasruthi.magics.ui.screens.LazyColumnWithSpacing(currentQuestion, session, viewModel)

            // Question Navigator Dots
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                LazyRow(
                    state = listState,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp)
                ) {
                    items(definition.questions.size) { index ->
                        val isAnswered = session!!.userAnswers.containsKey(index)
                        val isCurrent = session!!.currentIndex == index
                        
                        Box(
                            modifier = Modifier
                                .size(if (isCurrent) 20.dp else 16.dp)
                                .clip(CircleShape)
                                .background(
                                    color = if (isAnswered || isCurrent) MaterialTheme.colorScheme.primary else Color.Transparent
                                )
                                .border(
                                    width = 1.dp,
                                    color = MaterialTheme.colorScheme.primary,
                                    shape = CircleShape
                                )
                                .clickable { viewModel.goToQuestion(index) }
                                .then(if (isCurrent) Modifier.shadow(4.dp, CircleShape) else Modifier)
                        )
                    }
                }
            }
        }

        if (showExitDialog) {
            AlertDialog(
                onDismissRequest = { showExitDialog = false },
                title = { Text("Leave Test?") },
                text = { Text("Your progress will be lost if you leave.") },
                confirmButton = {
                    TextButton(onClick = {
                        viewModel.clearTest()
                        navController.popBackStack()
                    }) {
                        Text("Leave", color = MaterialTheme.colorScheme.error)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showExitDialog = false }) {
                        Text("Stay")
                    }
                }
            )
        }

        if (showSubmitDialog) {
            val skipped = viewModel.getSkippedCount()
            AlertDialog(
                onDismissRequest = { showSubmitDialog = false },
                title = { Text("Submit Test?") },
                text = {
                    Text(
                        if (skipped > 0) "$skipped question(s) unanswered. Submit anyway?"
                        else "Submit this test?"
                    )
                },
                confirmButton = {
                    Button(onClick = {
                        viewModel.submitTest()
                        showSubmitDialog = false
                    }) {
                        Text("Submit")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showSubmitDialog = false }) {
                        Text("Review")
                    }
                }
            )
        }
    }
}

@Composable
private fun LazyColumnWithSpacing(
    currentQuestion: com.shivasruthi.magics.data.model.Question,
    session: com.shivasruthi.magics.data.model.SessionState?,
    viewModel: TestPlayerViewModel
) {
    androidx.compose.foundation.lazy.LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
    ) {
        items(currentQuestion.options.size) { i ->
            val option = currentQuestion.options[i]
            val isSelected = session!!.userAnswers[session.currentIndex] == i
            
            val bgColor by animateColorAsState(
                targetValue = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                label = "bgColor"
            )
            val borderColor by animateColorAsState(
                targetValue = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline.copy(alpha = 0.5f),
                label = "borderColor"
            )

            OutlinedCard(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                onClick = { viewModel.selectAnswer(i) },
                border = BorderStroke(if (isSelected) 2.dp else 1.dp, borderColor),
                colors = CardDefaults.outlinedCardColors(containerColor = bgColor)
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface)
                            .border(1.dp, borderColor, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "${'A' + i}",
                            color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                        )
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = option,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

fun formatTime(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return String.format("%02d:%02d", m, s)
}
