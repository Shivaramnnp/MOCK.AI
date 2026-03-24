package com.shiva.magics.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.shiva.magics.ui.navigation.AppRoutes
import com.shiva.magics.data.model.Question
import com.shiva.magics.data.repository.TestRepository
import androidx.compose.ui.platform.LocalContext
import android.content.Context
import com.shiva.magics.ui.theme.*
import com.shiva.magics.viewmodel.EditorViewModel

@Composable
fun EditorScreen(
    navController: NavController,
    viewModel: EditorViewModel,
    repository: TestRepository
) {
    BackHandler(enabled = navController.previousBackStackEntry != null) {
        navController.popBackStack()
    }
    
    val questions by viewModel.questions.collectAsState()
    val isFixingAll by viewModel.isFixingAll.collectAsState()
    var showSaveDialog by remember { mutableStateOf(false) }
    
    // Calculate stats
    val validQuestions = questions.count { it.questionText.isNotBlank() && it.options.all { it.isNotBlank() } && it.correctAnswerIndex in 0..3 }
    val flaggedQuestions = questions.count { it.questionText.isBlank() || it.options.any { it.isBlank() } || it.correctAnswerIndex !in 0..3 }
    
    Scaffold(
        modifier = Modifier.background(Surface),
        topBar = {
            EditorTopBar(
                questionCount = questions.size,
                validCount = validQuestions,
                flaggedCount = flaggedQuestions,
                onSaveClick = { showSaveDialog = true },
                onFixAllClick = { viewModel.fixAllQuestionsWithAi() },
                onBackClick = { 
                    if (navController.previousBackStackEntry != null) {
                        navController.popBackStack() 
                    }
                }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            if (questions.isEmpty()) {
                EmptyState(
                    onAddQuestion = { viewModel.addQuestion() }
                )
            } else {
                Column(
                    modifier = Modifier.fillMaxSize()
                ) {
                    // Fix All button (if needed)
                    if (flaggedQuestions > 0) {
                        FixAllButton(
                            flaggedCount = flaggedQuestions,
                            isFixing = isFixingAll,
                            onFixAll = { viewModel.fixAllQuestionsWithAi() }
                        )
                    }
                    
                    // Questions list
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        itemsIndexed(questions) { index, question ->
                            QuestionCard(
                                question = question,
                                index = index,
                                isFixing = isFixingAll,
                                onQuestionChange = { updatedQuestion -> 
                                    viewModel.updateQuestion(index, updatedQuestion) 
                                },
                                onDelete = { viewModel.deleteQuestion(index) },
                                onMoveUp = { if (index > 0) viewModel.moveQuestion(index, index - 1) },
                                onMoveDown = { if (index < questions.size - 1) viewModel.moveQuestion(index, index + 1) }
                            )
                        }
                        
                        // Add space for floating action button
                        item {
                            Spacer(modifier = Modifier.height(80.dp))
                        }
                    }
                }
            }
            
            // Floating Action Button
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                contentAlignment = Alignment.BottomEnd
            ) {
                FloatingActionButton(
                    onClick = { viewModel.addQuestion() },
                    containerColor = Primary,
                    contentColor = Color.White
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = "Add Question"
                    )
                }
            }
        }
    }
    
    // Save Dialog
    if (showSaveDialog) {
        SaveTestDialog(
            questionCount = questions.size,
            validCount = validQuestions,
            onSave = { title, category, timeLimitMinutes ->
                val timeLimitSec = if (timeLimitMinutes > 0) timeLimitMinutes * 60 else null
                viewModel.saveTest(title, category, timeLimitSec, repository)
                showSaveDialog = false
                navController.navigate(AppRoutes.Home) {
                    popUpTo(AppRoutes.Home) { inclusive = false }
                    launchSingleTop = true
                }
            },
            onCancel = { showSaveDialog = false }
        )
    }
}

@Composable
fun EditorTopBar(
    questionCount: Int,
    validCount: Int,
    flaggedCount: Int,
    onSaveClick: () -> Unit,
    onFixAllClick: () -> Unit,
    onBackClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(80.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceElev1),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            // Top row: Back button and actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = onBackClick,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.ArrowBack,
                        contentDescription = "Back",
                        tint = OnSurface,
                        modifier = Modifier.size(20.dp)
                    )
                }
                
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (flaggedCount > 0) {
                        IconButton(
                            onClick = onFixAllClick,
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.AutoFixHigh,
                                contentDescription = "Fix All",
                                tint = Primary,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                    
                    IconButton(
                        onClick = onSaveClick,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Save,
                            contentDescription = "Save",
                            tint = Primary,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }
            
            // Bottom row: Stats
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Review Questions",
                    style = MaterialTheme.typography.titleLarge.copy(
                        color = OnSurface,
                        fontWeight = FontWeight.SemiBold
                    )
                )
                
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    StatBadge(text = "$questionCount questions", color = OnSurfaceMuted)
                    StatBadge(text = "$validCount ✓", color = AccentGreen)
                    if (flaggedCount > 0) {
                        StatBadge(text = "$flaggedCount ⚠", color = AccentAmber)
                    }
                }
            }
        }
    }
}

@Composable
fun StatBadge(
    text: String,
    color: Color
) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall.copy(
            color = color,
            fontWeight = FontWeight.Medium
        )
    )
}

@Composable
fun FixAllButton(
    flaggedCount: Int,
    isFixing: Boolean,
    onFixAll: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceElev2),
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { if (!isFixing) onFixAll() }
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.AutoFixHigh,
                    contentDescription = null,
                    tint = Primary,
                    modifier = Modifier.size(24.dp)
                )
                
                Column {
                    Text(
                        text = "Fix All with AI",
                        style = MaterialTheme.typography.titleMedium.copy(
                            color = OnSurface,
                            fontWeight = FontWeight.SemiBold
                        )
                    )
                    if (isFixing) {
                        Text(
                            text = "Fixing questions...",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = OnSurfaceMuted,
                                fontWeight = FontWeight.Normal
                            )
                        )
                    } else {
                        Text(
                            text = "$flaggedCount issues found",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = OnSurfaceMuted,
                                fontWeight = FontWeight.Normal
                            )
                        )
                    }
                }
            }
            
            if (isFixing) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    color = Primary,
                    strokeWidth = 2.dp
                )
            }
        }
    }
}

@Composable
fun EmptyState(
    onAddQuestion: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Settings,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = OnSurfaceMuted
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Text(
            text = "No questions yet",
            style = MaterialTheme.typography.headlineSmall.copy(
                color = OnSurface,
                fontWeight = FontWeight.Medium
            )
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "Add your first question to get started",
            style = MaterialTheme.typography.bodyMedium.copy(
                color = OnSurfaceMuted,
                fontWeight = FontWeight.Normal
            )
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Button(
            onClick = onAddQuestion,
            colors = ButtonDefaults.buttonColors(
                containerColor = Primary,
                contentColor = Color.White
            )
        ) {
            Text(
                text = "Add Question",
                style = MaterialTheme.typography.labelMedium.copy(
                    fontWeight = FontWeight.Medium
                )
            )
        }
    }
}

@Composable
fun QuestionCard(
    question: Question,
    index: Int,
    isFixing: Boolean,
    onQuestionChange: (Question) -> Unit,
    onDelete: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val isValid = question.questionText.isNotBlank() && question.options.all { it.isNotBlank() } && question.correctAnswerIndex in 0..3
    val statusColor = when {
        isValid -> AccentGreen
        question.questionText.isBlank() || question.options.any { it.isBlank() } -> AccentAmber
        else -> AccentRed
    }
    val statusText = when {
        isValid -> "✓ Valid"
        question.questionText.isBlank() || question.options.any { it.isBlank() } -> "⚠ Check"
        else -> "✕ Error"
    }
    
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = SurfaceElev1),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            // Header row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Question index badge
                Card(
                    colors = CardDefaults.cardColors(containerColor = SurfaceElev3),
                    shape = RoundedCornerShape(50)
                ) {
                    Text(
                        text = "Q.${index + 1}",
                        style = MaterialTheme.typography.labelMedium.copy(
                            color = Primary,
                            fontWeight = FontWeight.SemiBold
                        ),
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                }
                
                // Status indicator
                Card(
                    colors = CardDefaults.cardColors(containerColor = statusColor.copy(alpha = 0.1f)),
                    shape = RoundedCornerShape(50)
                ) {
                    Text(
                        text = statusText,
                        style = MaterialTheme.typography.labelSmall.copy(
                            color = statusColor,
                            fontWeight = FontWeight.Medium
                        ),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
                
                Spacer(modifier = Modifier.weight(1f))
                
                // Expand/collapse button
                IconButton(
                    onClick = { expanded = !expanded },
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.DragHandle,
                        contentDescription = if (expanded) "Collapse" else "Expand",
                        tint = OnSurfaceMuted,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(12.dp))
            
            // Question text
            QuestionTextField(
                value = question.questionText,
                onValueChange = { onQuestionChange(question.copy(questionText = it)) },
                placeholder = "Enter question text...",
                isError = question.questionText.isBlank()
            )
            
            Spacer(modifier = Modifier.height(12.dp))
            
            // Answer options
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                question.options.forEachIndexed { optionIndex, option ->
                    OptionRow(
                        letter = 'A' + optionIndex,
                        value = option,
                        onValueChange = { newOption ->
                            val newOptions = question.options.toMutableList()
                            newOptions[optionIndex] = newOption
                            onQuestionChange(question.copy(options = newOptions))
                        },
                        isCorrect = question.correctAnswerIndex == optionIndex,
                        onCorrectSelect = { 
                            onQuestionChange(question.copy(correctAnswerIndex = optionIndex)) 
                        },
                        isError = option.isBlank()
                    )
                }
            }
            
            if (expanded) {
                Spacer(modifier = Modifier.height(12.dp))
                
                // Action buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // AI Fix button
                    OutlinedButton(
                        onClick = { /* TODO: AI fix single question */ },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = Primary
                        )
                    ) {
                        Text(
                            text = "✨ AI Fix",
                            style = MaterialTheme.typography.labelMedium.copy(
                                fontWeight = FontWeight.Medium
                            )
                        )
                    }
                    
                    // Delete button
                    OutlinedButton(
                        onClick = onDelete,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = AccentRed
                        )
                    ) {
                        Text(
                            text = "🗑 Delete",
                            style = MaterialTheme.typography.labelMedium.copy(
                                fontWeight = FontWeight.Medium
                            )
                        )
                    }
                    
                    Spacer(modifier = Modifier.width(8.dp))
                    
                    // Move buttons
                    // Move Up
                    IconButton(
                        onClick = onMoveUp,
                        enabled = index > 0,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.KeyboardArrowUp,
                            contentDescription = "Move Up",
                            tint = if (index > 0) Primary else OnSurfaceMuted,
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    // Move Down
                    IconButton(
                        onClick = onMoveDown,
                        enabled = true,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.KeyboardArrowDown,
                            contentDescription = "Move Down",
                            tint = Primary,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }
            
            // Shimmer overlay if fixing
            if (isFixing) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(60.dp)
                        .background(
                            brush = androidx.compose.ui.graphics.Brush.horizontalGradient(
                                colors = listOf(
                                    SurfaceElev1,
                                    SurfaceElev2,
                                    SurfaceElev1
                                )
                            )
                        )
                        .clip(RoundedCornerShape(8.dp))
                )
            }
        }
    }
}

@Composable
fun QuestionTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    isError: Boolean
) {
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        textStyle = MaterialTheme.typography.bodyLarge.copy(
            color = OnSurface,
            fontWeight = FontWeight.Normal
        ),
        cursorBrush = SolidColor(Primary),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(
                color = if (isError) AccentRed.copy(alpha = 0.08f) else SurfaceElev2,
            )
            .border(
                width = 1.dp,
                color = if (isError) AccentRed else Border,
                shape = RoundedCornerShape(12.dp)
            )
            .padding(14.dp)
    ) { innerTextField ->
        Box {
            if (value.isEmpty()) {
                Text(
                    text = placeholder,
                    style = MaterialTheme.typography.bodyLarge.copy(
                        color = OnSurfaceMuted,
                        fontWeight = FontWeight.Normal
                    )
                )
            }
            innerTextField()
        }
    }
}


@Composable
fun OptionRow(
    letter: Char,
    value: String,
    onValueChange: (String) -> Unit,
    isCorrect: Boolean,
    onCorrectSelect: () -> Unit,
    isError: Boolean
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Letter badge
        Box(
            modifier = Modifier
                .size(28.dp)
                .background(
                    color = if (isCorrect) AccentGreen else SurfaceElev3,
                    CircleShape
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = letter.toString(),
                color = if (isCorrect) Color.White else OnSurfaceMuted,
                style = MaterialTheme.typography.labelMedium.copy(
                    fontWeight = FontWeight.Bold
                )
            )
        }
        
        // Option text field
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            textStyle = MaterialTheme.typography.bodyMedium.copy(
                color = OnSurface,
                fontWeight = FontWeight.Normal
            ),
            cursorBrush = SolidColor(Primary),
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(8.dp))
                .background(
                    color = if (isCorrect) AccentGreen.copy(alpha = 0.07f)
                    else if (isError) AccentRed.copy(alpha = 0.08f)
                    else SurfaceElev2,
                )
                .border(
                    width = 1.dp,
                    color = if (isCorrect) AccentGreen.copy(alpha = 0.4f)
                    else if (isError) AccentRed else Border,
                    shape = RoundedCornerShape(8.dp)
                )
                .padding(12.dp)
        ) { innerTextField ->
            Box {
                if (value.isEmpty()) {
                    Text(
                        text = "Option $letter",
                        style = MaterialTheme.typography.bodyMedium.copy(
                            color = OnSurfaceMuted,
                            fontWeight = FontWeight.Normal
                        )
                    )
                }
                innerTextField()
            }
        }
        
        // Correct indicator
        if (isCorrect) {
            Text(
                text = "✓",
                color = AccentGreen,
                style = MaterialTheme.typography.labelMedium.copy(
                    fontWeight = FontWeight.Bold
                )
            )
        }
        
        // Select as correct button
        IconButton(
            onClick = onCorrectSelect,
            modifier = Modifier.size(32.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(20.dp)
                    .background(
                        color = if (isCorrect) AccentGreen else SurfaceElev3,
                        CircleShape
                    )
                    .border(
                        width = 1.dp,
                        color = Border,
                        shape = CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                if (isCorrect) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .background(Color.White, CircleShape)
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SaveTestDialog(
    questionCount: Int,
    validCount: Int,
    onSave: (String, String, Int) -> Unit,
    onCancel: () -> Unit
) {
    val context = LocalContext.current
    val timerPerQuestion = remember(context) {
        context.getSharedPreferences("app_settings", Context.MODE_PRIVATE)
            .getInt("timer_seconds", 60)
    }
    val autoMinutes = (timerPerQuestion.toLong() * questionCount) / 60
    val initialMinutes = if (autoMinutes > 0) autoMinutes.toInt() else questionCount

    var testName by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf("JEE") }
    var timeLimitEnabled by remember { mutableStateOf(false) }
    var timeLimitMinutes by remember { mutableIntStateOf(initialMinutes) }
    
    val categories = listOf("JEE", "NEET", "UPSC", "Banking", "SSC", "Other")
    
    ModalBottomSheet(
        onDismissRequest = onCancel,
        sheetState = rememberModalBottomSheetState(
            skipPartiallyExpanded = true
        ),
        containerColor = SurfaceElev1,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // Title
            Text(
                text = "Save Test",
                style = MaterialTheme.typography.headlineMedium.copy(
                    color = OnSurface,
                    fontWeight = FontWeight.Bold
                )
            )
            
            // Test name field
            OutlinedTextField(
                value = testName,
                onValueChange = { testName = it },
                label = { Text("Test Name") },
                placeholder = { Text("e.g. Chemistry Chapter 5 Test") },
                modifier = Modifier.fillMaxWidth(),
                textStyle = MaterialTheme.typography.bodyMedium.copy(
                    color = OnSurface
                )
            )
            
            // Category selection
            Column {
                Text(
                    text = "Category",
                    style = MaterialTheme.typography.titleSmall.copy(
                        color = OnSurface,
                        fontWeight = FontWeight.Medium
                    )
                )
                Spacer(modifier = Modifier.height(8.dp))
                
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(categories) { category ->
                        FilterChip(
                            selected = selectedCategory == category,
                            onClick = { selectedCategory = category },
                            label = { Text(category) }
                        )
                    }
                }
            }
            
            // Time limit
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "⏱ Time Limit",
                    style = MaterialTheme.typography.titleSmall.copy(
                        color = OnSurface,
                        fontWeight = FontWeight.Medium
                    )
                )
                
                Switch(
                    checked = timeLimitEnabled,
                    onCheckedChange = { enabled ->
                        timeLimitEnabled = enabled
                        if (enabled) timeLimitMinutes = initialMinutes
                    }
                )
            }
            
            if (timeLimitEnabled) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = { if (timeLimitMinutes > 5) timeLimitMinutes -= 5 }
                    ) {
                        Text(
                            text = "-",
                            style = MaterialTheme.typography.titleLarge.copy(
                                color = Primary,
                                fontWeight = FontWeight.Bold
                            )
                        )
                    }
                    
                    Text(
                        text = "$timeLimitMinutes min",
                        style = MaterialTheme.typography.titleMedium.copy(
                            color = OnSurface,
                            fontWeight = FontWeight.SemiBold
                        ),
                        modifier = Modifier.padding(horizontal = 32.dp)
                    )
                    
                    IconButton(
                        onClick = { if (timeLimitMinutes < 180) timeLimitMinutes += 5 }
                    ) {
                        Text(
                            text = "+",
                            style = MaterialTheme.typography.titleLarge.copy(
                                color = Primary,
                                fontWeight = FontWeight.Bold
                            )
                        )
                    }
                }
            }
            
            // Question count summary
            Text(
                text = "$questionCount questions will be saved",
                style = MaterialTheme.typography.bodyMedium.copy(
                    color = OnSurfaceMuted,
                    fontWeight = FontWeight.Normal
                ),
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center
            )
            
            // Save button
            Button(
                onClick = { 
                    if (testName.isNotBlank() && validCount > 0) {
                        onSave(
                            testName,
                            selectedCategory,
                            if (timeLimitEnabled) timeLimitMinutes else 0
                        )
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                enabled = testName.isNotBlank() && validCount > 0,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Primary,
                    contentColor = Color.White
                ),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    text = "Save Test →",
                    style = MaterialTheme.typography.labelLarge.copy(
                        fontWeight = FontWeight.Medium
                    )
                )
            }
        }
    }
}
