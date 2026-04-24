package com.shiva.magics.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.shiva.magics.ui.components.MockAiBottomNav
import com.shiva.magics.ui.theme.*
import com.shiva.magics.viewmodel.AnalyticsViewModel
import com.shiva.magics.viewmodel.ProfileViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnalyticsScreen(
    navController: NavController,
    analyticsViewModel: AnalyticsViewModel,
    profileViewModel: ProfileViewModel
) {
    val state by analyticsViewModel.state.collectAsState()
    val profile by profileViewModel.profile.collectAsState()

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = { MockAiBottomNav(navController = navController, role = profile.role) }
    ) { padding ->
        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Primary)
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(bottom = 24.dp)
        ) {
            // Header
            item {
                Box(
                    modifier = Modifier.fillMaxWidth()
                        .background(
                            Brush.verticalGradient(
                                listOf(Primary.copy(alpha = 0.12f), Color.Transparent)
                            )
                        )
                        .padding(start = 24.dp, end = 24.dp, top = 52.dp, bottom = 20.dp)
                ) {
                    Column {
                        Text("📈", fontSize = 40.sp)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "My Analytics",
                            style = MaterialTheme.typography.headlineMedium.copy(
                                fontWeight = FontWeight.ExtraBold,
                                color = MaterialTheme.colorScheme.onBackground
                            )
                        )
                        Text(
                            "Track your performance & identify weak spots",
                            style = MaterialTheme.typography.bodySmall.copy(
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        )
                    }
                }
            }

            if (state.totalTestsTaken == 0) {
                item {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(48.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("🧗", fontSize = 48.sp)
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("No Data Yet", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                        Text(
                            "Complete some tests to unlock your performance insights.",
                            style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant),
                            textAlign = TextAlign.Center
                        )
                    }
                }
            } else {
                // Key Stats
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        StatCard(
                            modifier = Modifier.weight(1f),
                            label = "Tests Taken",
                            value = state.totalTestsTaken.toString(),
                            emoji = "📝"
                        )
                        StatCard(
                            modifier = Modifier.weight(1f),
                            label = "Average",
                            value = "${state.averageScorePercent.toInt()}%",
                            emoji = "🎯"
                        )
                    }
                }

                // Performance Trend Chart
                item {
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        "Performance Trend",
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface
                        ),
                        modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)
                    )
                    LineChartCard(
                        data = state.recentScores,
                        modifier = Modifier.padding(horizontal = 24.dp).height(200.dp)
                    )
                }

                // Weak Topics
                if (state.weakTopics.isNotEmpty()) {
                    item {
                        Spacer(modifier = Modifier.height(24.dp))
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)
                        ) {
                            Text(
                                "Weak Topics",
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface
                                ),
                                modifier = Modifier.weight(1f)
                            )
                            Icon(Icons.Default.Warning, null, tint = AccentAmber, modifier = Modifier.size(20.dp))
                        }
                    }

                    val maxWrong = state.weakTopics.values.maxOrNull() ?: 1
                    items(state.weakTopics.entries.toList().take(5)) { entry ->
                        WeakTopicBar(
                            topic = entry.key,
                            wrongCount = entry.value,
                            maxCount = maxWrong,
                            modifier = Modifier.padding(horizontal = 24.dp, vertical = 6.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatCard(modifier: Modifier = Modifier, label: String, value: String, emoji: String) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(emoji, fontSize = 24.sp)
            Spacer(modifier = Modifier.height(8.dp))
            Text(value, style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Black))
            Text(label, style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant))
        }
    }
}

@Composable
private fun LineChartCard(data: List<Float>, modifier: Modifier = Modifier) {
    if (data.size < 2) {
        Card(
            modifier = modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
            shape = RoundedCornerShape(16.dp)
        ) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                Text(
                    "Takes at least 2 tests to show trends",
                    style = MaterialTheme.typography.labelMedium.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
                )
            }
        }
        return
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Box(modifier = Modifier.padding(24.dp).fillMaxSize()) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val stepX = size.width / (data.size - 1)
                val maxScore = 100f
                
                val path = Path()
                var previousOffset: Offset? = null

                // Draw Grid
                val gridLines = 4
                for (i in 0..gridLines) {
                    val y = size.height - (i * (size.height / gridLines))
                    drawLine(
                        color = Color.LightGray.copy(alpha = 0.3f),
                        start = Offset(0f, y),
                        end = Offset(size.width, y),
                        strokeWidth = 1f
                    )
                }

                data.forEachIndexed { index, score ->
                    val x = index * stepX
                    val y = size.height - ((score / maxScore) * size.height)
                    val currentOffset = Offset(x, y)

                    if (index == 0) {
                        path.moveTo(x, y)
                    } else {
                        // Smooth curves
                        if (previousOffset != null) {
                            val controlPoint1 = Offset(previousOffset!!.x + stepX / 2, previousOffset!!.y)
                            val controlPoint2 = Offset(x - stepX / 2, y)
                            path.cubicTo(
                                controlPoint1.x, controlPoint1.y,
                                controlPoint2.x, controlPoint2.y,
                                x, y
                            )
                        }
                    }

                    // Dots
                    drawCircle(
                        color = Primary,
                        radius = 6.dp.toPx(),
                        center = currentOffset
                    )
                    drawCircle(
                        color = Color.White,
                        radius = 3.dp.toPx(),
                        center = currentOffset
                    )
                    
                    previousOffset = currentOffset
                }

                drawPath(
                    path = path,
                    color = Primary,
                    style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                )
            }
        }
    }
}

@Composable
private fun WeakTopicBar(topic: String, wrongCount: Int, maxCount: Int, modifier: Modifier = Modifier) {
    val progress = if (maxCount > 0) wrongCount.toFloat() / maxCount else 0f
    
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                topic,
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold)
            )
            Text(
                "$wrongCount mistakes",
                style = MaterialTheme.typography.labelSmall.copy(color = AccentRed)
            )
        }
        Box(
            modifier = Modifier.fillMaxWidth().height(10.dp)
                .clip(RoundedCornerShape(50))
                .background(AccentRed.copy(alpha = 0.15f))
        ) {
            Box(
                modifier = Modifier.fillMaxWidth(fraction = progress).fillMaxHeight()
                    .clip(RoundedCornerShape(50))
                    .background(AccentRed)
            )
        }
    }
}
