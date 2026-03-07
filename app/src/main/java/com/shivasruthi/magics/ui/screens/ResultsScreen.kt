package com.shivasruthi.magics.ui.screens

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.shivasruthi.magics.data.repository.TestRepository
import com.shivasruthi.magics.ui.navigation.AppRoutes
import com.shivasruthi.magics.viewmodel.TestPlayerViewModel

@Composable
fun ResultsScreen(
    navController: NavController,
    viewModel: TestPlayerViewModel,
    repository: TestRepository
) {
    val definition = viewModel.definition
    val session by viewModel.session.collectAsState()
    val actualScore = viewModel.computeScore()
    val totalQ = definition?.questions?.size ?: 0
    val percent = if (totalQ > 0) (actualScore * 100f / totalQ) else 0f
    val skipped = viewModel.getSkippedCount()
    val wrong = totalQ - actualScore - skipped

    LaunchedEffect(Unit) {
        if (definition?.dbId != null && definition.dbId != 0L) {
            repository.updateBestScore(definition.dbId, actualScore, totalQ)
        }
    }

    var targetScore by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) { targetScore = actualScore }
    val animatedScore by animateIntAsState(
        targetValue = targetScore,
        animationSpec = tween(1500, easing = FastOutSlowInEasing),
        label = "animatedScore"
    )

    Box(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(
                            MaterialTheme.colorScheme.surface,
                            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)
                        )
                    )
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(48.dp))
            Text("Test Complete!", style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center)
            Spacer(modifier = Modifier.height(32.dp))

            Text("$animatedScore", style = MaterialTheme.typography.displayLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.ExtraBold)
            Text("out of $totalQ", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            Spacer(modifier = Modifier.height(8.dp))
            Text("${percent.toInt()}%", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(24.dp))

            val badgeInfo = when {
                percent >= 80 -> Triple("Excellent! \uD83C\uDFC6", Color(0xFF1B5E20), Color(0xFFC8E6C9))
                percent >= 60 -> Triple("Good job! \uD83D\uDC4D", Color(0xFFF57F17), Color(0xFFFFF9C4))
                percent >= 40 -> Triple("Keep practising \uD83D\uDCDA", Color(0xFFE65100), Color(0xFFFFE0B2))
                else -> Triple("More practice needed \uD83D\uDCAA", MaterialTheme.colorScheme.onErrorContainer, MaterialTheme.colorScheme.errorContainer)
            }
            
            Surface(color = badgeInfo.third, shape = RoundedCornerShape(50)) {
                Text(
                    text = badgeInfo.first,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp),
                    style = MaterialTheme.typography.titleMedium,
                    color = badgeInfo.second
                )
            }

            Spacer(modifier = Modifier.height(32.dp))
            
            Row(modifier = Modifier.fillMaxWidth()) {
                StatColumn("Correct", "$actualScore", Color(0xFF2D7A4A), Modifier.weight(1f))
                StatColumn("Wrong", "$wrong", Color(0xFFC0432A), Modifier.weight(1f))
                StatColumn("Skipped", "$skipped", MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), Modifier.weight(1f))
            }

            Spacer(modifier = Modifier.height(40.dp))
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = { navController.navigate(AppRoutes.Review) }
            ) {
                Text("Review Answers")
            }
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    viewModel.clearTest()
                    navController.navigate(AppRoutes.Home) { popUpTo(AppRoutes.Home) { inclusive = true } }
                }
            ) {
                Text("Finish")
            }
        }
    }
}

@Composable
fun StatColumn(label: String, value: String, color: Color, modifier: Modifier = Modifier) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = modifier) {
        Text(value, style = MaterialTheme.typography.headlineMedium, color = color, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
    }
}
