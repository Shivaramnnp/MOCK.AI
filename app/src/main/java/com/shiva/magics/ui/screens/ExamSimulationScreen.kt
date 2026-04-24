package com.shiva.magics.ui.screens

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation.NavController
import com.shiva.magics.ui.theme.*
import com.shiva.magics.viewmodel.ExamSimulationViewModel

fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamSimulationScreen(
    navController: NavController,
    templateId: String,
    viewModel: ExamSimulationViewModel
) {
    val context = LocalContext.current
    val activity = remember { context.findActivity() }
    val view = LocalView.current
    val violationCount by viewModel.violationCount.collectAsState()
    val isExamActive by viewModel.isExamActive.collectAsState()
    val remainingTime by viewModel.remainingTime.collectAsState()
    val activeWarning by viewModel.activeWarning.collectAsState()
    
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    
    var showExitDialog by remember { mutableStateOf(false) }

    // 1. Strict Mode: Immersive View + FLAG_SECURE
    DisposableEffect(Unit) {
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        
        val windowInsetsController = WindowCompat.getInsetsController(activity!!.window, view)
        windowInsetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        windowInsetsController.hide(WindowInsetsCompat.Type.systemBars())
        
        // Assuming templateId has a duration, for now using 60 mins placeholder
        viewModel.startExam(templateId, 60 * 60)

        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            windowInsetsController.show(WindowInsetsCompat.Type.systemBars())
            viewModel.endExam()
        }
    }

    // Handle Warnings
    LaunchedEffect(activeWarning) {
        activeWarning?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.dismissWarning()
        }
    }

    // 2. Strict Mode: App Background Detection
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.`Event`.ON_PAUSE) {
                viewModel.recordEvent("APP_BACKGROUND")
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    // 3. Strict Mode: Back Navigation Guard
    BackHandler(enabled = isExamActive) {
        showExitDialog = true
    }

    if (showExitDialog) {
        AlertDialog(
            onDismissRequest = { showExitDialog = false },
            title = { Text("Quit Exam?") },
            text = { Text("Leaving now will automatically submit your exam. This action cannot be undone.") },
            confirmButton = {
                Button(onClick = {
                    showExitDialog = false
                    viewModel.recordEvent("MANUAL_EXIT")
                    navController.popBackStack()
                }, colors = ButtonDefaults.buttonColors(containerColor = AccentRed)) {
                    Text("Confirm Submit")
                }
            },
            dismissButton = {
                TextButton(onClick = { showExitDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // 4. Content UI
    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { 
                    Column {
                        Text("Strict Exam Mode", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                        Text(
                            text = formatTime(remainingTime),
                            color = if (remainingTime < 300) AccentRed else Primary,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Black
                        )
                    }
                },
                actions = {
                    Badge(
                        containerColor = if (violationCount > 0) AccentRed else Color.Transparent,
                        modifier = Modifier.padding(end = 16.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Warning, null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Integrity: $violationCount / 3", fontWeight = FontWeight.Bold)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = SurfaceElev1)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Surface),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            if (!isExamActive && violationCount >= 3) {
                Text("EXAM TERMINATED", color = AccentRed, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Black)
                Text("Integrity threshold reached.", color = OnSurfaceMuted)
                Spacer(Modifier.height(24.dp))
                Button(onClick = { navController.popBackStack() }) {
                    Text("Return to Dashboard")
                }
            } else {
                Text("Simulation in Progress...", fontWeight = FontWeight.Bold)
                Text("Template ID: $templateId", style = MaterialTheme.typography.labelSmall, color = OnSurfaceMuted)
                
                Spacer(Modifier.height(48.dp))
                
                // Placeholder for Question View (Week 3)
                CircularProgressIndicator(color = Primary)
                
                Spacer(Modifier.height(24.dp))
                Text("Questions and Timer Engine will be enabled in Week 3.", textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(horizontal = 32.dp))
            }
        }
    }
}

fun formatTime(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return String.format("%02d:%02d", m, s)
}
