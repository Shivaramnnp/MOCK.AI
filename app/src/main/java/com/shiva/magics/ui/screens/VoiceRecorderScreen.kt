package com.shiva.magics.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.navigation.NavController
import com.shiva.magics.ui.navigation.AppRoutes
import com.shiva.magics.viewmodel.ProcessingViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

// ─── Voice Recorder Screen ────────────────────────────────────────────────────
// Self-contained: handles permission, recording, and hands audio bytes to
// ProcessingViewModel.processFileBytes() — same path every other source uses.
// Does NOT touch any other screen, route, or ViewModel logic.

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VoiceRecorderScreen(
    navController: NavController,
    processingViewModel: ProcessingViewModel
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // ── State ──────────────────────────────────────────────────────────────────
    var hasPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED
        )
    }
    var isRecording by remember { mutableStateOf(false) }
    var recordingDoneFile by remember { mutableStateOf<File?>(null) }
    var elapsedSeconds by remember { mutableIntStateOf(0) }
    var amplitude by remember { mutableFloatStateOf(0f) }   // 0..1 for animation
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // MediaRecorder held as a mutable ref so it survives recomposition
    val recorderRef = remember { mutableStateOf<MediaRecorder?>(null) }
    val outputFileRef = remember { mutableStateOf<File?>(null) }

    // ── Permission launcher ────────────────────────────────────────────────────
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> hasPermission = granted }

    // ── Elapsed timer + amplitude polling while recording ─────────────────────
    LaunchedEffect(isRecording) {
        if (!isRecording) return@LaunchedEffect
        elapsedSeconds = 0
        while (isRecording) {
            delay(1000)
            elapsedSeconds++
            // Poll amplitude from MediaRecorder (0–32767 range → normalise to 0–1)
            val raw = recorderRef.value?.maxAmplitude?.toFloat() ?: 0f
            amplitude = (raw / 32767f).coerceIn(0f, 1f)
            // Auto-stop at 5 minutes to avoid huge files
            if (elapsedSeconds >= 300) {
                isRecording = false
                stopRecorder(recorderRef, outputFileRef) { file ->
                    recordingDoneFile = file
                }
            }
        }
    }

    // ── Pulsing animation when recording ──────────────────────────────────────
    val pulseAnim = rememberInfiniteTransition(label = "pulse")
    val pulseScale by pulseAnim.animateFloat(
        initialValue = 1f,
        targetValue = if (isRecording) 1.18f + amplitude * 0.3f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseScale"
    )

    // ── UI ─────────────────────────────────────────────────────────────────────
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Voice Input", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = {
                        // Clean up if user leaves mid-recording
                        if (isRecording) {
                            isRecording = false
                            recorderRef.value?.stop()
                            recorderRef.value?.release()
                            recorderRef.value = null
                            outputFileRef.value?.delete()
                        }
                        if (navController.previousBackStackEntry != null) {
                            navController.popBackStack()
                        }
                    }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(40.dp))

            // ── No permission state ────────────────────────────────────────────
            if (!hasPermission) {
                PermissionPrompt(onRequest = {
                    permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                })
                return@Column
            }

            // ── Done state (recording stopped, ready to send) ──────────────────
            if (recordingDoneFile != null) {
                RecordingDoneUI(
                    file = recordingDoneFile!!,
                    elapsedSeconds = elapsedSeconds,
                    onDiscard = {
                        recordingDoneFile?.delete()
                        recordingDoneFile = null
                        elapsedSeconds = 0
                    },
                    onGenerate = {
                        scope.launch {
                            val bytes = withContext(Dispatchers.IO) {
                                recordingDoneFile!!.readBytes()
                            }
                            // Use same processFileBytes path every other source uses
                            processingViewModel.processFileBytes(
                                bytes = bytes,
                                mimeType = "audio/mp4",
                                fileName = "voice_recording.m4a"
                            )
                            recordingDoneFile?.delete()
                            navController.navigate(AppRoutes.Processing)
                        }
                    }
                )
                return@Column
            }

            // ── Main record / recording UI ─────────────────────────────────────
            Text(
                text = when {
                    isRecording -> "Recording…"
                    else -> "Tap to start recording"
                },
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
            )

            Spacer(Modifier.height(12.dp))

            // Timer
            if (isRecording || elapsedSeconds > 0) {
                Text(
                    text = formatDuration(elapsedSeconds),
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.Bold,
                    color = if (isRecording) Color(0xFFAA66FF) else MaterialTheme.colorScheme.onSurface
                )
            }

            Spacer(Modifier.height(48.dp))

            // ── Record button with pulse ───────────────────────────────────────
            Box(contentAlignment = Alignment.Center) {
                // Outer glow ring (only while recording)
                if (isRecording) {
                    Box(
                        modifier = Modifier
                            .size(140.dp)
                            .scale(pulseScale)
                            .background(
                                Color(0xFFAA66FF).copy(alpha = 0.18f),
                                CircleShape
                            )
                    )
                }
                // Main button
                FilledIconButton(
                    onClick = {
                        if (!isRecording) {
                            // ── Start recording ────────────────────────────────
                            errorMessage = null
                            val outFile = File(
                                context.cacheDir,
                                "voice_${System.currentTimeMillis()}.m4a"
                            )
                            outputFileRef.value = outFile
                            try {
                                val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                    MediaRecorder(context)
                                } else {
                                    @Suppress("DEPRECATION")
                                    MediaRecorder()
                                }
                                recorder.apply {
                                    setAudioSource(MediaRecorder.AudioSource.MIC)
                                    setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                                    setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                                    setAudioEncodingBitRate(128_000)
                                    setAudioSamplingRate(44100)
                                    setOutputFile(outFile.absolutePath)
                                    prepare()
                                    start()
                                }
                                recorderRef.value = recorder
                                isRecording = true
                            } catch (e: Exception) {
                                errorMessage = "Failed to start recording: ${e.message}"
                                outputFileRef.value?.delete()
                            }
                        } else {
                            // ── Stop recording ─────────────────────────────────
                            isRecording = false
                            stopRecorder(recorderRef, outputFileRef) { file ->
                                recordingDoneFile = file
                            }
                        }
                    },
                    modifier = Modifier.size(100.dp),
                    colors = IconButtonDefaults.filledIconButtonColors(
                        containerColor = if (isRecording) Color(0xFFE53935) else Color(0xFFAA66FF)
                    ),
                    shape = CircleShape
                ) {
                    Icon(
                        imageVector = if (isRecording) Icons.Default.Stop else Icons.Default.Mic,
                        contentDescription = if (isRecording) "Stop" else "Record",
                        modifier = Modifier.size(44.dp),
                        tint = Color.White
                    )
                }
            }

            Spacer(Modifier.height(32.dp))

            Text(
                text = if (isRecording)
                    "Tap ■ to stop and generate questions"
                else
                    "Speak your study material, lecture notes,\nor read aloud from your textbook",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                textAlign = TextAlign.Center
            )

            // Max duration hint
            if (isRecording) {
                Spacer(Modifier.height(12.dp))
                Text(
                    text = "Max 5 minutes",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f)
                )
            }

            // Error snack
            errorMessage?.let { msg ->
                Spacer(Modifier.height(16.dp))
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = msg,
                        modifier = Modifier.padding(12.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    }
}

// ── Permission prompt ──────────────────────────────────────────────────────────
@Composable
private fun PermissionPrompt(onRequest: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        Icon(
            imageVector = Icons.Default.Mic,
            contentDescription = null,
            modifier = Modifier.size(72.dp),
            tint = Color(0xFFAA66FF)
        )
        Spacer(Modifier.height(20.dp))
        Text(
            "Microphone Permission Required",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "To record audio, this app needs access to your microphone.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = onRequest,
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFAA66FF))
        ) {
            Text("Grant Permission")
        }
    }
}

// ── Recording done — confirm / discard ────────────────────────────────────────
@Composable
private fun RecordingDoneUI(
    file: File,
    elapsedSeconds: Int,
    onDiscard: () -> Unit,
    onGenerate: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        // Big tick
        Surface(
            shape = CircleShape,
            color = Color(0xFFAA66FF).copy(alpha = 0.12f),
            modifier = Modifier.size(100.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text("✓", fontSize = 44.sp, color = Color(0xFFAA66FF))
            }
        }

        Spacer(Modifier.height(20.dp))

        Text(
            "Recording Complete",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )

        Spacer(Modifier.height(8.dp))

        Text(
            "Duration: ${formatDuration(elapsedSeconds)}  ·  Size: ${fileSizeLabel(file)}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
        )

        Spacer(Modifier.height(36.dp))

        Button(
            onClick = onGenerate,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFAA66FF)),
            shape = RoundedCornerShape(14.dp)
        ) {
            Text("Generate Questions", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        }

        Spacer(Modifier.height(12.dp))

        OutlinedButton(
            onClick = onDiscard,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = RoundedCornerShape(14.dp)
        ) {
            Text("Record Again")
        }
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Safely stops and releases the recorder, then hands the file back. */
private fun stopRecorder(
    recorderRef: MutableState<MediaRecorder?>,
    outputFileRef: MutableState<File?>,
    onDone: (File) -> Unit
) {
    try {
        recorderRef.value?.stop()
    } catch (_: Exception) { /* ignore IllegalStateException if nothing was recorded */ }
    recorderRef.value?.release()
    recorderRef.value = null
    val file = outputFileRef.value
    outputFileRef.value = null
    if (file != null && file.exists() && file.length() > 0) {
        onDone(file)
    }
}

private fun formatDuration(totalSeconds: Int): String {
    val m = totalSeconds / 60
    val s = totalSeconds % 60
    return "%d:%02d".format(m, s)
}

private fun fileSizeLabel(file: File): String {
    val kb = file.length() / 1024
    return if (kb < 1024) "${kb} KB" else "%.1f MB".format(kb / 1024f)
}
