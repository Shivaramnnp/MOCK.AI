package com.shivasruthi.magics.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.InfiniteRepeatableSpec
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.shivasruthi.magics.ui.navigation.AppRoutes
import com.shivasruthi.magics.viewmodel.EditorViewModel
import com.shivasruthi.magics.viewmodel.ProcessingState
import com.shivasruthi.magics.viewmodel.ProcessingViewModel
import kotlinx.coroutines.delay

@Composable
fun ProcessingScreen(
    navController: NavController,
    viewModel: ProcessingViewModel,
    editorViewModel: EditorViewModel
) {
    val state by viewModel.state.collectAsState()
    var statusIndex by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) {
        while (true) {
            delay(3000)
            statusIndex = (statusIndex + 1) % viewModel.statusMessages.size
        }
    }

    Scaffold(
        topBar = {
            if (state !is ProcessingState.Loading && state !is ProcessingState.Idle) {
                @OptIn(ExperimentalMaterial3Api::class)
                TopAppBar(title = { Text("Processing") })
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentAlignment = Alignment.Center
        ) {
            when (val s = state) {
                is ProcessingState.Idle, is ProcessingState.Loading -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        val infiniteTransition = rememberInfiniteTransition(label = "spin")
                        val rotation by infiniteTransition.animateFloat(
                            initialValue = 0f,
                            targetValue = 360f,
                            animationSpec = InfiniteRepeatableSpec(
                                animation = tween(2000, easing = LinearEasing)
                            ),
                            label = "spin"
                        )

                        Icon(
                            imageVector = Icons.Default.AutoAwesome,
                            contentDescription = "Loading",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .size(72.dp)
                                .graphicsLayer { rotationZ = rotation }
                        )
                        Spacer(modifier = Modifier.height(32.dp))
                        AnimatedContent(
                            targetState = viewModel.statusMessages[statusIndex],
                            label = "status_text"
                        ) { targetText ->
                            Text(
                                text = targetText,
                                style = MaterialTheme.typography.titleMedium,
                                textAlign = TextAlign.Center
                            )
                        }
                        Spacer(modifier = Modifier.height(24.dp))
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth(0.6f))
                        Spacer(modifier = Modifier.height(32.dp))
                        OutlinedButton(
                            onClick = {
                                viewModel.cancel()
                                navController.popBackStack()
                            }
                        ) {
                            Text("Cancel")
                        }
                    }
                }
                is ProcessingState.Success -> {
                    var visible by remember { mutableStateOf(false) }
                    LaunchedEffect(Unit) { visible = true }
                    val scale by animateFloatAsState(
                        targetValue = if (visible) 1f else 0f,
                        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
                        label = "scale"
                    )

                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = "Success",
                            tint = Color(0xFF2D7A4A),
                            modifier = Modifier
                                .size(80.dp)
                                .scale(scale)
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("Found ${s.questions.size} questions!", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.primary, textAlign = TextAlign.Center)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("from ${s.fileName}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Spacer(modifier = Modifier.height(24.dp))
                        
                        Text("Preview:", style = MaterialTheme.typography.labelLarge, modifier = Modifier.align(Alignment.Start))
                        Spacer(modifier = Modifier.height(8.dp))
                        
                        s.questions.take(3).forEachIndexed { i, q ->
                            ElevatedCard(modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)) {
                                Text("${i + 1}. ${q.questionText}", style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(12.dp))
                            }
                        }
                        if (s.questions.size > 3) {
                            Text("+ ${s.questions.size - 3} more questions", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), modifier = Modifier.padding(top = 8.dp))
                        }
                        Spacer(modifier = Modifier.height(32.dp))
                        
                        Button(
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                editorViewModel.setQuestions(s.questions)
                                navController.navigate(AppRoutes.Editor)
                            }
                        ) {
                            Text("Review & Edit")
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedButton(
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                editorViewModel.setQuestions(s.questions)
                                viewModel.reset()
                                navController.navigate(AppRoutes.Home) { 
                                    popUpTo(AppRoutes.Home) { inclusive = true } 
                                }
                            }
                        ) {
                            Text("Use Directly")
                        }
                    }
                }
                is ProcessingState.Error -> {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Default.ErrorOutline,
                            contentDescription = "Error",
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(72.dp)
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("Something went wrong", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(s.message, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                        Spacer(modifier = Modifier.height(32.dp))
                        
                        Button(
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                viewModel.reset()
                                navController.popBackStack()
                            }
                        ) {
                            Text("Try Again")
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedButton(
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                viewModel.reset()
                                navController.popBackStack()
                            }
                        ) {
                            Text("Go Back")
                        }
                    }
                }
            }
        }
    }
}
