package com.shivasruthi.magics.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Reviews
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import kotlin.math.min
import com.shivasruthi.magics.data.repository.TestRepository
import com.shivasruthi.magics.ui.navigation.AppRoutes
import com.shivasruthi.magics.ui.theme.*
import com.shivasruthi.magics.viewmodel.TestPlayerViewModel
import kotlinx.coroutines.launch

@Composable
fun ResultsScreen(
    navController: NavController,
    viewModel: TestPlayerViewModel,
    repository: TestRepository
) {
    val definition = viewModel.definition
    val session by viewModel.session.collectAsState()
    
    // Guard: if no test data, return home
    if (definition == null || session == null) {
        LaunchedEffect(Unit) {
            navController.navigate(AppRoutes.Home) {
                popUpTo(AppRoutes.Home) { inclusive = true }
            }
        }
        return
    }

    val totalQuestions = definition.questions.size
    val score = viewModel.computeScore()
    val percentage = if (totalQuestions > 0) (score * 100) / totalQuestions else 0
    val correctAnswers = score
    val unansweredAnswers = viewModel.getUnansweredCount()
    val wrongAnswers = totalQuestions - correctAnswers - unansweredAnswers
    val elapsedSeconds by viewModel.elapsedSeconds.collectAsState()

    LaunchedEffect(Unit) {
        if (definition.dbId > 0) {
            repository.updateBestScore(
                id = definition.dbId,
                score = score,
                total = totalQuestions,
                wrong = wrongAnswers
            )
        }
    }

    // Handle system back button to go home safely
    BackHandler(enabled = navController.previousBackStackEntry != null) {
        navController.navigate(AppRoutes.Home) {
            popUpTo(AppRoutes.Home) { inclusive = false }
            launchSingleTop = true
        }
    }
    
    // Animated values
    val animatedScore by animateIntAsState(
        targetValue = score,
        animationSpec = tween(1500, easing = FastOutSlowInEasing),
        label = "score"
    )
    
    val animatedPercentage by animateIntAsState(
        targetValue = percentage,
        animationSpec = tween(1500, easing = FastOutSlowInEasing),
        label = "percentage"
    )
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Surface)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Hero Section with Animated Score Ring
            HeroScoreSection(
                score = animatedScore,
                totalQuestions = totalQuestions,
                percentage = animatedPercentage
            )
            
            Spacer(modifier = Modifier.height(32.dp))
            
            // Stats Grid
            StatsGrid(
                correctAnswers = correctAnswers,
                wrongAnswers = wrongAnswers,
                unansweredAnswers = unansweredAnswers,
                timeTaken = elapsedSeconds.toLong()
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // Accuracy Bar
            AccuracyBar(
                correctAnswers = correctAnswers,
                wrongAnswers = wrongAnswers,
                unansweredAnswers = unansweredAnswers,
                totalQuestions = totalQuestions
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // Performance Insight Card
            PerformanceInsightCard(
                percentage = percentage
            )
            
            Spacer(modifier = Modifier.height(32.dp))
            
            // Action Buttons
            ActionButtons(
                onRetakeTest = {
                    val defId = definition.dbId
                    viewModel.loadTestFromDb(defId, repository)
                    navController.navigate(AppRoutes.TestPlayerWithId(defId)) {
                        popUpTo(AppRoutes.Results) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onReviewAnswers = {
                    navController.navigate(AppRoutes.Review)
                },
                onBackToHome = {
                    navController.navigate(AppRoutes.Home) {
                        popUpTo(AppRoutes.Home) { inclusive = false }
                        launchSingleTop = true
                    }
                }
            )
        }
    }
}

@Composable
fun HeroScoreSection(
    score: Int,
    totalQuestions: Int,
    percentage: Int
) {
    val performanceLabel = when {
        percentage >= 80 -> "🏆 Excellent Work!"
        percentage >= 60 -> "⭐ Good Performance!"
        percentage >= 40 -> "📈 Keep Improving!"
        else -> "💪 Don't Give Up!"
    }
    
    val performanceColor = when {
        percentage >= 80 -> AccentGreen
        percentage >= 60 -> Primary
        percentage >= 40 -> AccentAmber
        else -> OnSurface
    }
    
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Animated Score Ring
        Box(
            modifier = Modifier.size(280.dp),
            contentAlignment = Alignment.Center
        ) {
            Canvas(
                modifier = Modifier.size(280.dp)
            ) {
                val canvasWidth = size.width
                val canvasHeight = size.height
                val strokeWidth = 12.dp.toPx()
                val radius = min(canvasWidth, canvasHeight) / 2 - strokeWidth
                val center = Offset(canvasWidth / 2, canvasHeight / 2)
                
                // Background ring
                drawCircle(
                    color = SurfaceElev3,
                    radius = radius,
                    center = center,
                    style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
                )
                
                // Progress ring
                val sweepAngle = (percentage.toFloat() / 100f) * 360f
                drawArc(
                    color = Primary,
                    startAngle = -90f,
                    sweepAngle = sweepAngle,
                    useCenter = false,
                    topLeft = Offset(center.x - radius, center.y - radius),
                    size = Size(radius * 2, radius * 2),
                    style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
                )
            }
            
            // Score text inside ring
            Column(
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Row(
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = "$score",
                        style = MaterialTheme.typography.displayLarge.copy(
                            color = Primary,
                            fontWeight = FontWeight.ExtraBold
                        )
                    )
                    Text(
                        text = "/$totalQuestions",
                        style = MaterialTheme.typography.headlineSmall.copy(
                            color = OnSurfaceMuted,
                            fontWeight = FontWeight.Normal
                        )
                    )
                }
                Text(
                    text = "correct",
                    style = MaterialTheme.typography.labelMedium.copy(
                        color = OnSurfaceMuted,
                        fontWeight = FontWeight.Normal
                    )
                )
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Performance label
        Text(
            text = performanceLabel,
            style = MaterialTheme.typography.headlineMedium.copy(
                color = performanceColor,
                fontWeight = FontWeight.Bold
            ),
            textAlign = TextAlign.Center
        )
    }
}

@Composable
fun StatsGrid(
    correctAnswers: Int,
    wrongAnswers: Int,
    unansweredAnswers: Int,
    timeTaken: Long
) {
    val minutes = timeTaken / 60
    val seconds = timeTaken % 60
    val timeText = if (minutes > 0) "${minutes}m ${seconds}s" else "${seconds}s"
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Correct Answers
        StatCard(
            modifier = Modifier.weight(1f),
            icon = "✅",
            value = "$correctAnswers",
            label = "Correct",
            color = AccentGreen
        )
        
        // Wrong Answers
        StatCard(
            modifier = Modifier.weight(1f),
            icon = "❌",
            value = "$wrongAnswers",
            label = "Wrong",
            color = AccentRed
        )
        
        // Unanswered Answers
        StatCard(
            modifier = Modifier.weight(1f),
            icon = "⏭",
            value = "$unansweredAnswers",
            label = "Unanswered",
            color = AccentAmber
        )
        
        // Time Taken
        StatCard(
            modifier = Modifier.weight(1f),
            icon = "⏱",
            value = timeText,
            label = "Time",
            color = Primary
        )
    }
}

@Composable
fun StatCard(
    modifier: Modifier = Modifier,
    icon: String,
    value: String,
    label: String,
    color: Color
) {
    Card(
        modifier = modifier.height(80.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceElev1),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = icon,
                style = MaterialTheme.typography.titleMedium.copy(
                    color = color,
                    fontWeight = FontWeight.Bold
                )
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.titleLarge.copy(
                    color = color,
                    fontWeight = FontWeight.Bold
                )
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall.copy(
                    color = OnSurfaceMuted,
                    fontWeight = FontWeight.Normal
                )
            )
        }
    }
}

@Composable
fun AccuracyBar(
    correctAnswers: Int,
    wrongAnswers: Int,
    unansweredAnswers: Int,
    totalQuestions: Int
) {
    val correctPercentage = if (totalQuestions > 0) (correctAnswers * 100) / totalQuestions else 0
    val wrongPercentage = if (totalQuestions > 0) (wrongAnswers * 100) / totalQuestions else 0
    val unansweredPercentage = if (totalQuestions > 0) (unansweredAnswers * 100) / totalQuestions else 0
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .wrapContentHeight(),
        colors = CardDefaults.cardColors(containerColor = SurfaceElev1),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            Text(
                text = "Score Breakdown",
                style = MaterialTheme.typography.titleMedium.copy(
                    color = OnSurface,
                    fontWeight = FontWeight.SemiBold
                )
            )
            
            Spacer(modifier = Modifier.height(12.dp))
            
            // Segmented bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .background(SurfaceElev3, RoundedCornerShape(4.dp))
                    .clip(RoundedCornerShape(4.dp))
            ) {
                if (correctPercentage > 0) {
                    Box(
                        modifier = Modifier
                            .weight(correctPercentage.toFloat())
                            .fillMaxHeight()
                            .background(AccentGreen)
                    )
                }
                if (wrongPercentage > 0) {
                    Box(
                        modifier = Modifier
                            .weight(wrongPercentage.toFloat())
                            .fillMaxHeight()
                            .background(AccentRed)
                    )
                }
                if (unansweredPercentage > 0) {
                    Box(
                        modifier = Modifier
                            .weight(unansweredPercentage.toFloat())
                            .fillMaxHeight()
                            .background(AccentAmber)
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            
            // Legend
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                LegendItem(color = AccentGreen, label = "Correct", percentage = correctPercentage)
                LegendItem(color = AccentRed, label = "Wrong", percentage = wrongPercentage)
                LegendItem(color = AccentAmber, label = "Unanswered", percentage = unansweredPercentage)
            }
        }
    }
}

@Composable
fun LegendItem(
    color: Color,
    label: String,
    percentage: Int
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(color, RoundedCornerShape(50))
        )
        Text(
            text = "$label $percentage%",
            style = MaterialTheme.typography.labelSmall.copy(
                color = OnSurfaceMuted,
                fontWeight = FontWeight.Normal
            )
        )
    }
}

@Composable
fun PerformanceInsightCard(
    percentage: Int
) {
    val insightMessage = when {
        percentage < 40 -> "Focus on fundamentals — review chapter basics before attempting more mocks. Try shorter 10-question sessions."
        percentage < 60 -> "Good foundation! Work on time management — practice timed sessions and identify your weak topics."
        percentage < 80 -> "Strong performance! Push for speed — practice previous year papers and attempt harder questions."
        else -> "Outstanding! Maintain consistency — try full-length mock tests and mixed-topic challenges."
    }
    
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = SurfaceElev1),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "📋",
                    style = MaterialTheme.typography.titleMedium.copy(
                        color = Primary,
                        fontWeight = FontWeight.Bold
                    )
                )
                Text(
                    text = "Performance Insight",
                    style = MaterialTheme.typography.titleMedium.copy(
                        color = OnSurface,
                        fontWeight = FontWeight.SemiBold
                    )
                )
            }
            
            Spacer(modifier = Modifier.height(12.dp))
            
            Text(
                text = insightMessage,
                style = MaterialTheme.typography.bodyMedium.copy(
                    color = OnSurface,
                    fontWeight = FontWeight.Normal,
                    lineHeight = 20.sp
                )
            )
        }
    }
}

@Composable
fun ActionButtons(
    onRetakeTest: () -> Unit,
    onReviewAnswers: () -> Unit,
    onBackToHome: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Button(
            onClick = onRetakeTest,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Primary,
                contentColor = Color.White
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text(
                text = "🔁 Retake Test",
                style = MaterialTheme.typography.labelLarge.copy(
                    fontWeight = FontWeight.Medium
                )
            )
        }
        
        OutlinedButton(
            onClick = onReviewAnswers,
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = Primary
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text(
                text = "📋 Review Answers",
                style = MaterialTheme.typography.labelLarge.copy(
                    fontWeight = FontWeight.Medium
                )
            )
        }
        
        TextButton(
            onClick = onBackToHome,
            modifier = Modifier
                .fillMaxWidth()
                .height(40.dp)
        ) {
            Text(
                text = "🏠 Back to Home",
                style = MaterialTheme.typography.labelMedium.copy(
                    color = OnSurfaceMuted,
                    fontWeight = FontWeight.Normal
                )
            )
        }
    }
}
