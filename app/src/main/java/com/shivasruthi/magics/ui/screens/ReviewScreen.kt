package com.shivasruthi.magics.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.shivasruthi.magics.ui.navigation.AppRoutes
import com.shivasruthi.magics.ui.theme.DmMonoFamily
import com.shivasruthi.magics.viewmodel.TestPlayerViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReviewScreen(
    navController: NavController,
    viewModel: TestPlayerViewModel
) {
    val reviewItems by viewModel.reviewItems.collectAsState()
    val score = reviewItems.count { it.isCorrect }
    val total = reviewItems.size
    val percent = if (total > 0) score.toFloat() / total else 0f

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Review Answers") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier.padding(paddingValues),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 80.dp)
        ) {
            item {
                Box(modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp), contentAlignment = Alignment.Center) {
                    val surfaceVariant = MaterialTheme.colorScheme.surfaceVariant
                    val Rust40 = Color(0xFFC0432A)
                    val arcColor = if (percent >= 0.6f) Color(0xFF2D7A4A) else Rust40
                    
                    Canvas(modifier = Modifier.size(160.dp)) {
                        val strokeWidth = 16.dp.toPx()
                        drawArc(
                            color = surfaceVariant,
                            startAngle = -210f,
                            sweepAngle = 300f,
                            useCenter = false,
                            style = Stroke(strokeWidth, cap = StrokeCap.Round)
                        )
                        drawArc(
                            color = arcColor,
                            startAngle = -210f,
                            sweepAngle = 300f * percent,
                            useCenter = false,
                            style = Stroke(strokeWidth, cap = StrokeCap.Round)
                        )
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "${(percent * 100).toInt()}%",
                            style = MaterialTheme.typography.headlineLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = "$score / $total",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                        )
                    }
                }
            }

            items(reviewItems) { item ->
                ElevatedCard(modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            AssistChip(onClick = {}, label = { Text("Q ${item.index + 1}") })
                            when {
                                item.userAnswerIndex == null -> SuggestionChip(onClick = {}, label = { Text("Skipped") })
                                item.isCorrect -> SuggestionChip(
                                    onClick = {},
                                    label = { Text("✓ Correct") },
                                    colors = SuggestionChipDefaults.suggestionChipColors(containerColor = Color(0xFFC8E6C9))
                                )
                                else -> SuggestionChip(
                                    onClick = {},
                                    label = { Text("✗ Wrong") },
                                    colors = SuggestionChipDefaults.suggestionChipColors(containerColor = Color(0xFFFFDAD4))
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(item.question.questionText, style = MaterialTheme.typography.titleSmall)
                        Spacer(modifier = Modifier.height(12.dp))

                        item.question.options.forEachIndexed { oi, option ->
                            val isUserAnswer = item.userAnswerIndex == oi
                            val isCorrectAnswer = item.question.correctAnswerIndex == oi

                            val bgColor = when {
                                isUserAnswer && item.isCorrect -> Color(0xFFE8F5E9)
                                isUserAnswer && !item.isCorrect -> Color(0xFFFFDAD4)
                                isCorrectAnswer && !item.isCorrect -> Color(0xFFE8F5E9)
                                else -> Color.Transparent
                            }

                            val outlineColor = MaterialTheme.colorScheme.outline
                            val borderColor = when {
                                isCorrectAnswer && !item.isCorrect -> Color(0xFF2D7A4A)
                                isUserAnswer && !item.isCorrect -> Color(0xFFC0432A)
                                else -> outlineColor.copy(alpha = 0.2f)
                            }
                            
                            val borderWidth = if (isCorrectAnswer && !item.isCorrect) 1.5.dp else 1.dp

                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 3.dp)
                                    .background(bgColor, RoundedCornerShape(8.dp))
                                    .border(borderWidth, borderColor, RoundedCornerShape(8.dp))
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "${'A' + oi}",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontFamily = DmMonoFamily,
                                    color = if (isCorrectAnswer || isUserAnswer) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = option,
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.weight(1f)
                                )
                                if (isUserAnswer && !item.isCorrect) Text(
                                    "✗",
                                    color = Color(0xFFC0432A),
                                    fontWeight = FontWeight.Bold
                                )
                                if (isUserAnswer && item.isCorrect) Text(
                                    "✓",
                                    color = Color(0xFF2D7A4A),
                                    fontWeight = FontWeight.Bold
                                )
                                if (isCorrectAnswer && !item.isCorrect) Text(
                                    "Correct",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color(0xFF2D7A4A)
                                )
                            }
                        }
                    }
                }
            }

            item {
                Button(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 16.dp),
                    onClick = {
                        viewModel.clearTest()
                        navController.navigate(AppRoutes.Home) { popUpTo(AppRoutes.Home) { inclusive = true } }
                    }
                ) {
                    Text("Done")
                }
            }
        }
    }
}
