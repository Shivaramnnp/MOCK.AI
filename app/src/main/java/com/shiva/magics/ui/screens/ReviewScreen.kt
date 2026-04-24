package com.shiva.magics.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.shiva.magics.ui.theme.*
import com.shiva.magics.viewmodel.TestPlayerViewModel
import com.shiva.magics.data.model.ReviewItem
import com.shiva.magics.data.model.Question
import com.shiva.magics.ui.components.CitationBadge
import com.shiva.magics.ui.components.EvidenceBottomSheet
import androidx.activity.compose.BackHandler

@Composable
fun ReviewScreen(
    navController: NavController,
    viewModel: TestPlayerViewModel
) {
    var selectedFilter by remember { mutableStateOf("All") }
    val bookmarkedQuestions by viewModel.bookmarkedQuestions.collectAsState()
    var expandedExplanations by remember { mutableStateOf(setOf<Int>()) }
    
    val filters = listOf("All", "Correct ✓", "Wrong ✗", "Skipped ⏭", "Bookmarked 🔖")
    
    val session by viewModel.session.collectAsState()
    val definition = viewModel.definition
    
    val reviewItems by viewModel.reviewItems.collectAsState()
    
    val filteredItems = remember(reviewItems, selectedFilter, bookmarkedQuestions) {
        reviewItems.filter { item ->
            when (selectedFilter) {
                "Correct ✓" -> item.isCorrect
                "Wrong ✗" -> !item.isCorrect && item.userAnswerIndex != null
                "Skipped ⏭" -> item.userAnswerIndex == null
                "Bookmarked 🔖" -> item.index in bookmarkedQuestions
                else -> true
            }
        }
    }
    
    BackHandler(enabled = navController.previousBackStackEntry != null) {
        navController.popBackStack()
    }
    
    Scaffold(
        modifier = Modifier.background(Surface),
        topBar = {
            ReviewTopBar(
                onExit = { 
                    if (navController.previousBackStackEntry != null) {
                        navController.popBackStack() 
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Filter chips
            FilterChipsRow(
                filters = filters,
                selectedFilter = selectedFilter,
                onFilterSelected = { selectedFilter = it }
            )
            
            // Questions list
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                items(filteredItems) { item ->
                    val index = item.index
                    val isCorrect = item.isCorrect
                    val isSkipped = item.userAnswerIndex == null
                    val isBookmarked = index in bookmarkedQuestions
                    val isExpanded = index in expandedExplanations
                    
                    ReviewQuestionCard(
                        questionNumber = index + 1,
                        question = item.question,
                        userAnswer = item.userAnswerIndex ?: -1,
                        isCorrect = isCorrect,
                        isSkipped = isSkipped,
                        isBookmarked = isBookmarked,
                        isExpanded = isExpanded,
                        onBookmarkToggle = {
                            viewModel.toggleBookmark(index)
                        },
                        onExplanationToggle = {
                            expandedExplanations = if (index in expandedExplanations) {
                                expandedExplanations - index
                            } else {
                                expandedExplanations + index
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun ReviewTopBar(
    onExit: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceElev1),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp)
        ) {
            IconButton(
                onClick = onExit,
                modifier = Modifier.size(32.dp).align(Alignment.CenterStart)
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = OnSurface,
                    modifier = Modifier.size(20.dp)
                )
            }
            
            Text(
                text = "Review Answers",
                style = MaterialTheme.typography.titleLarge.copy(
                    color = OnSurface,
                    fontWeight = FontWeight.SemiBold
                )
            )
            
            Spacer(modifier = Modifier.width(32.dp))
        }
    }
}

@Composable
fun FilterChipsRow(
    filters: List<String>,
    selectedFilter: String,
    onFilterSelected: (String) -> Unit
) {
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(filters) { filter ->
            FilterChip(
                selected = filter == selectedFilter,
                onClick = { onFilterSelected(filter) },
                label = { 
                    Text(
                        text = filter,
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontWeight = FontWeight.Medium
                        )
                    )
                }
            )
        }
    }
}

@Composable
fun ReviewQuestionCard(
    questionNumber: Int,
    question: Question,
    userAnswer: Int,
    isCorrect: Boolean,
    isSkipped: Boolean,
    isBookmarked: Boolean,
    isExpanded: Boolean,
    onBookmarkToggle: () -> Unit,
    onExplanationToggle: () -> Unit
) {
    val questionText = question.questionText
    val accentColor = when {
        isSkipped -> AccentAmber
        isCorrect -> AccentGreen
        else -> AccentRed
    }
    
    val outcomeText = when {
        isSkipped -> "— Skipped"
        isCorrect -> "✓ Correct"
        else -> "✗ Wrong"
    }
    var showEvidence by remember { mutableStateOf(false) }

    if (showEvidence && question.citation != null) {
        EvidenceBottomSheet(
            citation = question.citation,
            trustScore = question.trustScore,
            status = question.verificationStatus,
            onDismiss = { showEvidence = false }
        )
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = SurfaceElev1),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp)
        ) {
            // Header row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Question number
                Text(
                    text = "Q.$questionNumber",
                    style = MaterialTheme.typography.labelMedium.copy(
                        color = OnSurfaceMuted,
                        fontWeight = FontWeight.Normal
                    )
                )
                
                // Outcome badge
                Card(
                    colors = CardDefaults.cardColors(containerColor = accentColor.copy(alpha = 0.1f)),
                    shape = RoundedCornerShape(50)
                ) {
                    Text(
                        text = outcomeText,
                        style = MaterialTheme.typography.labelSmall.copy(
                            color = accentColor,
                            fontWeight = FontWeight.Medium
                        ),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Question text
            Text(
                text = questionText,
                style = MaterialTheme.typography.titleMedium.copy(
                    color = OnSurface,
                    fontWeight = FontWeight.Medium,
                    lineHeight = 22.sp
                )
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                question.options.forEachIndexed { index, option ->
                    ReviewOptionRow(
                        letter = 'A' + index,
                        optionText = option,
                        isCorrectAnswer = index == question.correctAnswerIndex,
                        isUserAnswer = userAnswer == index,
                        isWrongUserAnswer = !isCorrect && userAnswer == index
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Action row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Bookmark button
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
                
                // Explanation toggle button
                TextButton(
                    onClick = onExplanationToggle,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = Primary
                    )
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = if (isExpanded) "Hide Explanation" else "See Explanation",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Medium
                            )
                        )
                        Icon(
                            imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
            
            // Explanation section (expandable)
            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                Column {
                    Spacer(modifier = Modifier.height(16.dp))
                    ExplanationSection(question = question, onBadgeClick = { showEvidence = true })
                }
            }
        }
    }
}

@Composable
fun ReviewOptionRow(
    letter: Char,
    optionText: String,
    isCorrectAnswer: Boolean,
    isUserAnswer: Boolean,
    isWrongUserAnswer: Boolean
) {
    val backgroundColor = when {
        isCorrectAnswer -> AccentGreen.copy(alpha = 0.1f)
        isWrongUserAnswer -> AccentRed.copy(alpha = 0.1f)
        else -> SurfaceElev2
    }
    
    val letterColor = when {
        isCorrectAnswer -> AccentGreen
        isWrongUserAnswer -> AccentRed
        else -> OnSurfaceMuted
    }
    
    val letterBackground = when {
        isCorrectAnswer -> AccentGreen
        isWrongUserAnswer -> AccentRed
        else -> SurfaceElev3
    }
    
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(32.dp)
            .background(backgroundColor, RoundedCornerShape(8.dp))
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Letter badge
        Box(
            modifier = Modifier
                .size(20.dp)
                .background(
                    color = letterBackground,
                    RoundedCornerShape(50)
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = letter.toString(),
                color = Color.White,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Bold
                )
            )
        }
        
        // Option text
        Text(
            text = optionText,
            style = MaterialTheme.typography.bodySmall.copy(
                color = OnSurface,
                fontWeight = FontWeight.Normal
            ),
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        
        // Suffix indicator
        when {
            isCorrectAnswer -> {
                Text(
                    text = "✓",
                    color = AccentGreen,
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold
                    )
                )
            }
            isWrongUserAnswer -> {
                Text(
                    text = "✗",
                    color = AccentRed,
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold
                    )
                )
            }
        }
    }
}

@Composable
fun ExplanationSection(
    question: Question,
    onBadgeClick: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = SurfaceElev3),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "💡",
                    style = MaterialTheme.typography.titleSmall.copy(
                        color = Primary,
                        fontWeight = FontWeight.Bold
                    )
                )
                Text(
                    text = "Explanation",
                    style = MaterialTheme.typography.titleSmall.copy(
                        color = OnSurface,
                        fontWeight = FontWeight.SemiBold
                    )
                )
            }
            
            Text(
                text = "This question tests your understanding of the fundamental concepts. The correct answer is option B because it accurately represents the core principle being tested.",
                style = MaterialTheme.typography.bodySmall.copy(
                    color = OnSurfaceMuted,
                    fontWeight = FontWeight.Normal,
                    lineHeight = 18.sp
                )
            )

            Spacer(modifier = Modifier.height(8.dp))
            
            CitationBadge(
                status = question.verificationStatus,
                citation = question.citation,
                onClick = onBadgeClick
            )
        }
    }
}
