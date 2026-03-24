package com.shiva.magics.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
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
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.shiva.magics.ui.navigation.AppRoutes
import com.shiva.magics.ui.theme.*
import com.shiva.magics.viewmodel.EditorViewModel
import com.shiva.magics.viewmodel.ProcessingViewModel
import com.shiva.magics.viewmodel.ProcessingState
import com.shiva.magics.viewmodel.TestPlayerViewModel
import kotlinx.coroutines.delay
import kotlin.math.min
import kotlin.math.cos
import kotlin.math.sin

@Composable
fun ProcessingScreen(
    navController: NavController,
    viewModel: ProcessingViewModel,
    editorViewModel: EditorViewModel,
    testPlayerViewModel: TestPlayerViewModel
) {
    val processingState by viewModel.state.collectAsState()
    var showCancelDialog by remember { mutableStateOf(false) }
    
    // Animated particles
    val particleAnimation by rememberInfiniteTransition().animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(3000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "particles"
    )
    
    val statusMessages = viewModel.statusMessages
    var currentMessageIndex by remember { mutableIntStateOf(0) }
    
    LaunchedEffect(statusMessages.size) {
        if (statusMessages.isNotEmpty()) {
            while(true) {
                delay(2000)
                currentMessageIndex = (currentMessageIndex + 1) % statusMessages.size
            }
        }
    }
    
    // Auto-navigate on success
    LaunchedEffect(processingState) {
        val state = processingState
        if (state is ProcessingState.Success) {
            delay(1200)
            editorViewModel.setQuestions(state.questions)
            navController.navigate(AppRoutes.Editor) {
                popUpTo(AppRoutes.Home) { inclusive = false }
            }
        }
    }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Surface)
    ) {
        // Animated particle background
        AnimatedParticleBackground(
            animationProgress = particleAnimation
        )
        
        // Main content
        Column(
            modifier = Modifier
                .fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            val state = processingState
            when (state) {
                is ProcessingState.Loading -> {
                    val stage = currentMessageIndex.coerceAtMost(3)
                    val message = statusMessages.getOrElse(currentMessageIndex) { "Processing..." }

                    LoadingContent(
                        statusMessage = message,
                        technicalStatus = state.status,
                        currentStage = stage,
                        showCancelDialog = { showCancelDialog = true }
                    )
                }
                is ProcessingState.Success -> {
                    SuccessContent()
                }
                is ProcessingState.Error -> {
                    ErrorContent(
                        error = state.message,
                        onRetry = { viewModel.retry() },
                        onGoBack = { 
                            if (navController.previousBackStackEntry != null) {
                                navController.popBackStack() 
                            }
                        }
                    )
                }
                else -> {
                    // Idle state - shouldn't happen in normal flow
                    LoadingContent(
                        statusMessage = "Initializing...",
                        technicalStatus = "Starting AI engine...",
                        currentStage = 0,
                        showCancelDialog = { showCancelDialog = true }
                    )
                }
            }
        }
    }
    
    // Cancel dialog
    if (showCancelDialog) {
        AlertDialog(
            onDismissRequest = { showCancelDialog = false },
            title = {
                Text(
                    text = "Cancel Processing?",
                    style = MaterialTheme.typography.headlineSmall.copy(
                        color = OnSurface,
                        fontWeight = FontWeight.Bold
                    )
                )
            },
            text = {
                Text(
                    text = "Are you sure you want to cancel? All progress will be lost.",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = OnSurfaceMuted,
                        fontWeight = FontWeight.Normal
                    )
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showCancelDialog = false
                        viewModel.cancel()
                        if (navController.previousBackStackEntry != null) {
                            navController.popBackStack()
                        }
                    }
                ) {
                    Text(
                        text = "Cancel Anyway",
                        style = MaterialTheme.typography.labelMedium.copy(
                            color = AccentRed,
                            fontWeight = FontWeight.Medium
                        )
                    )
                }
            },
            dismissButton = {
                Button(
                    onClick = { showCancelDialog = false },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Primary,
                        contentColor = Color.White
                    )
                ) {
                    Text(
                        text = "Continue",
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontWeight = FontWeight.Medium
                        )
                    )
                }
            }
        )
    }
}

@Composable
fun AnimatedParticleBackground(
    animationProgress: Float
) {
    Canvas(
        modifier = Modifier.fillMaxSize()
    ) {
        val canvasWidth = size.width
        val canvasHeight = size.height
        val particleSize = 4.dp.toPx()
        val rows = 3
        val cols = 5
        val spacingX = canvasWidth / (cols + 1)
        val spacingY = canvasHeight / (rows + 1)
        
        for (row in 0 until rows) {
            for (col in 0 until cols) {
                val x = spacingX * (col + 1)
                val y = spacingY * (row + 1)
                
                // Calculate pulse effect
                val delay = (row * cols + col) * 0.1f
                val progress = (animationProgress + delay) % 1f
                val alpha = sin(progress * Math.PI).toFloat() * 0.3f
                val scale = 1f + progress * 0.5f
                
                drawCircle(
                    color = Primary.copy(alpha = alpha),
                    radius = particleSize * scale / 2,
                    center = Offset(x, y)
                )
            }
        }
    }
}

@Composable
fun LoadingContent(
    statusMessage: String,
    technicalStatus: String,
    currentStage: Int,
    showCancelDialog: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        // Animated icon area
        Box(
            modifier = Modifier.size(80.dp),
            contentAlignment = Alignment.Center
        ) {
            // Rotating dashed circle
            val rotation by rememberInfiniteTransition().animateFloat(
                initialValue = 0f,
                targetValue = 360f,
                animationSpec = infiniteRepeatable(
                    animation = tween(2000, easing = LinearEasing),
                    repeatMode = RepeatMode.Restart
                ),
                label = "rotation"
            )
            
            Canvas(
                modifier = Modifier.size(80.dp)
            ) {
                val canvasWidth = size.width
                val canvasHeight = size.height
                val radius = min(canvasWidth, canvasHeight) / 2 - 4.dp.toPx()
                val center = Offset(canvasWidth / 2, canvasHeight / 2)
                
                // Dashed circle
                drawArc(
                    color = Primary,
                    startAngle = rotation,
                    sweepAngle = 270f,
                    useCenter = false,
                    topLeft = Offset(center.x - radius, center.y - radius),
                    size = Size(radius * 2, radius * 2),
                    style = Stroke(
                        width = 2.dp.toPx(),
                        cap = StrokeCap.Round,
                        pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(
                            floatArrayOf(10f, 10f), 0f
                        )
                    )
                )
            }
            
            // Central icon
            Icon(
                imageVector = Icons.Default.AutoAwesome,
                contentDescription = null,
                modifier = Modifier.size(40.dp),
                tint = Primary
            )
        }
        
        // Status title with animation
        AnimatedContent(
            targetState = statusMessage,
            transitionSpec = {
                (slideInVertically { height -> height } + fadeIn()) togetherWith
                (slideOutVertically { height -> -height } + fadeOut())
            },
            label = "status"
        ) { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.headlineMedium.copy(
                    color = OnSurface,
                    fontWeight = FontWeight.Bold
                ),
                textAlign = TextAlign.Center
            )
        }
        
        // Sub-status
        Text(
            text = technicalStatus,
            style = MaterialTheme.typography.bodyMedium.copy(
                color = OnSurfaceMuted,
                fontWeight = FontWeight.Normal
            ),
            textAlign = TextAlign.Center,
            maxLines = 2
        )
        
        // Progress section
        ProgressSection(
            currentStage = currentStage,
            totalStages = 4
        )
        
        // Cancel button
        TextButton(
            onClick = showCancelDialog
        ) {
            Text(
                text = "Cancel Processing",
                style = MaterialTheme.typography.labelMedium.copy(
                    color = AccentRed,
                    fontWeight = FontWeight.Medium
                )
            )
        }
    }
}

@Composable
fun ProgressSection(
    currentStage: Int,
    totalStages: Int
) {
    val stages = listOf("Read", "Extract", "Generate", "Format")
    
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Segmented progress bar
        Row(
            modifier = Modifier.width(240.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            repeat(totalStages) { index ->
                val isActive = index < currentStage
                val isCurrent = index == currentStage
                val pulse by rememberInfiniteTransition(label = "pulse$index").animateFloat(
                    initialValue = 0.5f,
                    targetValue = 1f,
                    animationSpec = infiniteRepeatable(
                        animation = tween(700, easing = LinearEasing),
                        repeatMode = RepeatMode.Reverse
                    ),
                    label = "pulse_alpha$index"
                )

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(
                            color = when {
                                isActive -> Primary
                                isCurrent -> Primary.copy(alpha = pulse)
                                else -> SurfaceElev3
                            }
                        )
                )
            }
        }
        
        // Stage labels
        Row(
            modifier = Modifier.width(240.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            stages.forEachIndexed { index, label ->
                val isActive = index < currentStage
                val isCurrent = index == currentStage
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall.copy(
                        color = when {
                            isActive -> Primary
                            isCurrent -> PrimaryVariant
                            else -> OnSurfaceMuted
                        },
                        fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal
                    )
                )
            }
        }
    }
}

@Composable
fun SuccessContent() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        // Success animation
        val scale by animateFloatAsState(
            targetValue = 1f,
            animationSpec = spring(
                dampingRatio = Spring.DampingRatioMediumBouncy,
                stiffness = Spring.StiffnessLow
            ),
            label = "successScale"
        )
        
        val density = LocalDensity.current
        val successBrush = remember(density) {
            androidx.compose.ui.graphics.Brush.radialGradient(
                colors = listOf(
                    AccentGreen.copy(alpha = 0.2f),
                    Color.Transparent
                ),
                center = Offset(with(density) { 40.dp.toPx() }, with(density) { 40.dp.toPx() }),
                radius = with(density) { 40.dp.toPx() }
            )
        }
        
        Box(
            modifier = Modifier.size(80.dp),
            contentAlignment = Alignment.Center
        ) {
            // Success circle with gradient
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .background(brush = successBrush),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = null,
                    modifier = Modifier.size(40.dp),
                    tint = AccentGreen
                )
            }
        }
        
        Text(
            text = "Questions Generated!",
            style = MaterialTheme.typography.headlineMedium.copy(
                color = OnSurface,
                fontWeight = FontWeight.Bold
            ),
            textAlign = TextAlign.Center
        )
        
        Text(
            text = "Preparing your test...",
            style = MaterialTheme.typography.bodyMedium.copy(
                color = OnSurfaceMuted,
                fontWeight = FontWeight.Normal
            ),
            textAlign = TextAlign.Center
        )
    }
}

@Composable
fun ErrorContent(
    error: String,
    onRetry: () -> Unit,
    onGoBack: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        // Error icon with shake animation
        val shake by rememberInfiniteTransition().animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = keyframes {
                    0f at 0 with LinearEasing
                    0.1f at 100 with LinearEasing
                    -0.1f at 200 with LinearEasing
                    0f at 300 with LinearEasing
                },
                repeatMode = RepeatMode.Restart
            ),
            label = "shake"
        )
        
        Box(
            modifier = Modifier
                .size(80.dp)
                .offset { IntOffset(x = (shake * 4.dp.toPx()).toInt(), y = 0) },
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.ErrorOutline,
                contentDescription = null,
                modifier = Modifier.size(40.dp),
                tint = AccentRed
            )
        }
        
        Text(
            text = "Something went wrong",
            style = MaterialTheme.typography.headlineMedium.copy(
                color = OnSurface,
                fontWeight = FontWeight.Bold
            ),
            textAlign = TextAlign.Center
        )
        
        // Error card
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceElev2),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = OnSurfaceMuted,
                        fontWeight = FontWeight.Normal
                    ),
                    textAlign = TextAlign.Center
                )
            }
        }
        
        // Action buttons
        Row(
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Primary,
                    contentColor = Color.White
                )
            ) {
                Text(
                    text = "Try Again",
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontWeight = FontWeight.Medium
                    )
                )
            }
            
            OutlinedButton(
                onClick = onGoBack,
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = OnSurfaceMuted
                )
            ) {
                Text(
                    text = "Go Back",
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontWeight = FontWeight.Medium
                    )
                )
            }
        }
    }
}
