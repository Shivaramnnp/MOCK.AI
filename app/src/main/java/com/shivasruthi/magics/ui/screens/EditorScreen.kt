package com.shivasruthi.magics.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.shivasruthi.magics.data.model.Question
import com.shivasruthi.magics.data.model.SaveState
import com.shivasruthi.magics.data.repository.TestRepository
import com.shivasruthi.magics.ui.navigation.AppRoutes
import com.shivasruthi.magics.viewmodel.EditorViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditorScreen(
    navController: NavController,
    viewModel: EditorViewModel,
    repository: TestRepository
) {
    val questions by viewModel.questions.collectAsState()
    val saveState by viewModel.saveState.collectAsState()
    var showSaveDialog by remember { mutableStateOf(false) }
    var testTitle by remember { mutableStateOf("") }
    var testCategory by remember { mutableStateOf("Other") }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(saveState) {
        if (saveState is SaveState.Success) {
            navController.navigate(AppRoutes.Home) {
                popUpTo(AppRoutes.Home) { inclusive = true }
            }
            viewModel.resetSaveState()
        }
        if (saveState is SaveState.Error) {
            snackbarHostState.showSnackbar((saveState as SaveState.Error).message)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Edit Test (${questions.size} questions)") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { showSaveDialog = true }) {
                        Icon(Icons.Default.Save, contentDescription = "Save")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        floatingActionButton = {
            FloatingActionButton(onClick = { viewModel.addQuestion() }) {
                Icon(Icons.Default.Add, contentDescription = "Add Question")
            }
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(bottom = 100.dp)
        ) {
            itemsIndexed(questions, key = { _, q -> q.hashCode() }) { index, question ->
                QuestionEditCard(
                    questionIndex = index,
                    question = question,
                    viewModel = viewModel,
                    modifier = Modifier.animateItem()
                )
            }
        }

        if (showSaveDialog) {
            AlertDialog(
                onDismissRequest = { showSaveDialog = false },
                title = { Text("Save Test") },
                text = {
                    Column {
                        OutlinedTextField(
                            value = testTitle,
                            onValueChange = { testTitle = it },
                            label = { Text("Test Title *") },
                            isError = testTitle.isBlank(),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        
                        var expanded by remember { mutableStateOf(false) }
                        val categories = listOf("Biology", "Physics", "Chemistry", "Mathematics", "History", "Geography", "English", "Computer Science", "Other")
                        
                        ExposedDropdownMenuBox(
                            expanded = expanded,
                            onExpandedChange = { expanded = it }
                        ) {
                            OutlinedTextField(
                                value = testCategory,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Category") },
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                            )
                            ExposedDropdownMenu(
                                expanded = expanded,
                                onDismissRequest = { expanded = false }
                            ) {
                                categories.forEach { cat ->
                                    DropdownMenuItem(
                                        text = { Text(cat) },
                                        onClick = {
                                            testCategory = cat
                                            expanded = false
                                        }
                                    )
                                }
                            }
                        }
                        
                        if (viewModel.hasValidationErrors()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                "⚠ ${viewModel.validationErrorCount()} questions have issues",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            if (testTitle.isNotBlank()) {
                                showSaveDialog = false
                                viewModel.saveTest(testTitle, testCategory, repository)
                            }
                        }
                    ) {
                        Text("Save")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showSaveDialog = false }) { Text("Cancel") }
                }
            )
        }
    }
}

@Composable
fun QuestionEditCard(
    questionIndex: Int,
    question: Question,
    viewModel: EditorViewModel,
    modifier: Modifier = Modifier
) {
    ElevatedCard(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                AssistChip(onClick = {}, label = { Text("Q ${questionIndex + 1}") })
                IconButton(onClick = { viewModel.deleteQuestion(questionIndex) }) {
                    Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                }
            }

            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = question.questionText,
                onValueChange = { viewModel.onQuestionTextChanged(questionIndex, it) },
                label = { Text("Question Text") },
                isError = question.questionText.isBlank(),
                supportingText = {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        if (question.questionText.isBlank()) {
                            Text("Required", color = MaterialTheme.colorScheme.error)
                        } else {
                            Text("")
                        }
                        Text("${question.questionText.length} chars", style = MaterialTheme.typography.labelSmall)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2
            )

            Spacer(modifier = Modifier.height(12.dp))
            Text(
                "Options (tap circle to mark correct answer)",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
            )
            Spacer(modifier = Modifier.height(8.dp))

            question.options.forEachIndexed { oi, optionText ->
                val isSelected = question.correctAnswerIndex == oi
                val circleColor by animateColorAsState(
                    targetValue = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                    label = "circleColor"
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(vertical = 4.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface)
                            .border(1.5.dp, circleColor, CircleShape)
                            .clickable { viewModel.onCorrectAnswerSelected(questionIndex, oi) },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "${'A' + oi}",
                            style = MaterialTheme.typography.labelMedium,
                            color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    OutlinedTextField(
                        value = optionText,
                        onValueChange = { viewModel.onOptionChanged(questionIndex, oi, it) },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        label = { Text("Option ${'A' + oi}") }
                    )
                }
            }

            if (question.correctAnswerIndex == -1) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "⚠ Tap a circle above to select the correct answer",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFFE67E22)
                )
            }
        }
    }
}
