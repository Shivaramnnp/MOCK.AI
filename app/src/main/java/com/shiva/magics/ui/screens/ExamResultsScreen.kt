package com.shiva.magics.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.shiva.magics.data.local.ExamAnalyticsEntity
import com.shiva.magics.ui.theme.*
import com.shiva.magics.util.ExamAnalyticsEngine

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamResultsScreen(
    navController: NavController,
    analytics: ExamAnalyticsEntity
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Exam Performance", fontWeight = FontWeight.Black) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = SurfaceElev1)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Surface)
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // 1. Unified Score Card
            val readinessColor = when (analytics.readinessStatus) {
                "READY" -> Primary
                "NEAR_READY" -> Color(0xFFFFB300)
                else -> AccentRed
            }

            Surface(
                color = SurfaceElev1,
                shape = MaterialTheme.shapes.extraLarge,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Overall Score", style = MaterialTheme.typography.labelLarge, color = OnSurfaceMuted)
                    Text(
                        text = "${analytics.score.toInt()}%",
                        style = MaterialTheme.typography.displayLarge,
                        fontWeight = FontWeight.Black,
                        color = readinessColor
                    )
                    Spacer(Modifier.height(8.dp))
                    Surface(
                        color = readinessColor.copy(alpha = 0.1f),
                        shape = MaterialTheme.shapes.medium
                    ) {
                        Text(
                            text = analytics.readinessStatus,
                            color = readinessColor,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            // 2. Metrics Grid
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                MetricCard(
                    modifier = Modifier.weight(1f),
                    title = "Efficiency",
                    value = ExamAnalyticsEngine.classifyEfficiency(analytics.averageTimePerQuestion),
                    icon = Icons.Default.Speed,
                    color = Primary
                )
                MetricCard(
                    modifier = Modifier.weight(1f),
                    title = "Stress Index",
                    value = analytics.stressIndex.toInt().toString(),
                    icon = Icons.Default.Timeline,
                    color = Color(0xFF9C27B0)
                )
            }

            Spacer(Modifier.height(32.dp))

            // 3. Feedback Section
            Text(
                "Academic Insights",
                modifier = Modifier.align(Alignment.Start),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(16.dp))

            AnalyticsFeedbackCard(analytics)

            Spacer(Modifier.height(48.dp))

            Button(
                onClick = { navController.popBackStack() },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Primary)
            ) {
                Text("Return to Dashboard", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun MetricCard(
    modifier: Modifier,
    title: String,
    value: String,
    icon: ImageVector,
    color: Color
) {
    Surface(
        modifier = modifier,
        color = SurfaceElev1,
        shape = MaterialTheme.shapes.large
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Icon(icon, null, tint = color, modifier = Modifier.size(24.dp))
            Spacer(Modifier.height(12.dp))
            Text(title, style = MaterialTheme.typography.labelSmall, color = OnSurfaceMuted)
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
fun AnalyticsFeedbackCard(analytics: ExamAnalyticsEntity) {
    val feedback = when {
        analytics.score >= 80 && analytics.stressIndex < 40 -> "Exceptional performance. You are maintaining accuracy under pressure."
        analytics.score >= 65 -> "Strong foundation. Focus on reducing time per question to reach 'Ready' status."
        analytics.stressIndex > 60 -> "High stress detected. Your accuracy drops significantly in the final minutes."
        else -> "Significant work needed on core concepts before the next simulation."
    }

    Surface(
        color = SurfaceElev2,
        shape = MaterialTheme.shapes.large,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(modifier = Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Assessment, null, tint = OnSurfaceMuted)
            Spacer(Modifier.width(16.dp))
            Text(feedback, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
