package com.shiva.magics

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.google.firebase.auth.FirebaseAuth
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.util.Consumer
import androidx.core.view.WindowCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxSize
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.shiva.magics.data.local.AppDatabase
import com.shiva.magics.data.remote.GeminiService
import com.shiva.magics.data.remote.YoutubeBackendService
import com.shiva.magics.data.repository.TestRepository
import com.shiva.magics.ui.navigation.AppRoutes
import com.shiva.magics.ui.screens.*
import com.shiva.magics.ui.screens.VoiceRecorderScreen
import com.shiva.magics.ui.theme.MagicSTheme
import com.shiva.magics.ui.theme.ThemePreference
import com.shiva.magics.util.NotificationHelper
import com.shiva.magics.viewmodel.AnalyticsViewModel
import com.shiva.magics.viewmodel.ClassroomViewModel
import com.shiva.magics.viewmodel.CreatorViewModel
import com.shiva.magics.viewmodel.EditorViewModel
import com.shiva.magics.viewmodel.HomeViewModel
import com.shiva.magics.viewmodel.MarketplaceViewModel
import com.shiva.magics.viewmodel.ProcessingViewModel
import com.shiva.magics.viewmodel.ProfileViewModel
import com.shiva.magics.viewmodel.TestPlayerViewModel

class MainActivity : ComponentActivity() {

    // Manual DI — no Hilt needed
    private val database by lazy { AppDatabase.getDatabase(this) }
    private val repository by lazy { TestRepository(database) }
    private val geminiService by lazy { GeminiService(BuildConfig.GEMINI_API_KEY, database.aiCostDao()) }
    private val youtubeBackendService by lazy { 
        YoutubeBackendService(
            backendBaseUrl = BuildConfig.YOUTUBE_BACKEND_URL
        ) 
    }
    
    private val groqService by lazy { com.shiva.magics.data.remote.GroqService() }
    private val flashLiteService by lazy { 
        com.shiva.magics.data.remote.GeminiFlashLiteService(BuildConfig.GEMINI_FLASH_LITE_KEY) 
    }
    private val aiProviderManager by lazy {
        com.shiva.magics.data.remote.AiProviderManager(
            geminiService = geminiService,
            groqService = groqService,
            flashLiteService = flashLiteService,
            groqApiKey = BuildConfig.GROQ_API_KEY,
            flashLiteApiKey = BuildConfig.GEMINI_FLASH_LITE_KEY
        )
    }
    // Phase 2: classroom
    private val classroomRepo by lazy { com.shiva.magics.data.repository.ClassroomRepository() }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        ThemePreference.applyToDelegate(ThemePreference.get(this))
        super.onCreate(savedInstanceState)
        
        NotificationHelper.createNotificationChannel(this)

        WindowCompat.setDecorFitsSystemWindows(window, false)   // Edge-to-edge
        enableEdgeToEdge()

        setContent {
            MagicSTheme {
                val navController = rememberNavController()

                // Shared ViewModels — scoped to Activity
                val homeViewModel: HomeViewModel = viewModel(
                    factory = HomeViewModel.Factory(repository)
                )
                val processingViewModel: ProcessingViewModel = viewModel(
                    factory = ProcessingViewModel.Factory(aiProviderManager, youtubeBackendService, geminiService, this)
                )
                val editorViewModel: EditorViewModel = viewModel(
                    factory = EditorViewModel.Factory(geminiService)
                )
                val testPlayerViewModel: TestPlayerViewModel = viewModel()
                val profileViewModel: ProfileViewModel = viewModel(
                    factory = ProfileViewModel.Factory(this)
                )
                val classroomViewModel: ClassroomViewModel = viewModel(
                    factory = ClassroomViewModel.Factory(classroomRepo)
                )
                val analyticsViewModel: AnalyticsViewModel = viewModel(
                    factory = AnalyticsViewModel.Factory(repository)
                )
                val creatorViewModel: CreatorViewModel = viewModel(
                    factory = CreatorViewModel.Factory(repository)
                )
                val marketplaceViewModel: MarketplaceViewModel = viewModel(
                    factory = MarketplaceViewModel.Factory(repository)
                )

                LaunchedEffect(Unit) {
                    // Initialize Feature Flags for Launch
                    val flags = listOf(
                        com.shiva.magics.util.ConfigManager.FEATURE_AUTO_GENERATION,
                        com.shiva.magics.util.ConfigManager.FEATURE_REFERRALS,
                        com.shiva.magics.util.ConfigManager.FEATURE_MARKETPLACE,
                        com.shiva.magics.util.ConfigManager.FEATURE_AI_COACH
                    )
                    flags.forEach { flag ->
                        if (repository.getAllFeatureFlagsOnce().none { it.featureName == flag }) {
                            repository.setFeatureFlag(flag, true)
                        }
                    }

                    repository.syncStreak(geminiService)
                    com.shiva.magics.util.StreakReminderWorker.schedule(this@MainActivity)
                }


                DisposableEffect(Unit) {
                    val handleIntent = { intent: Intent ->
                        if (intent.action == Intent.ACTION_SEND) {
                            val type = intent.type ?: ""
                            if (type == "text/plain" || type == "application/json") {
                                val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
                                if (sharedText != null && sharedText.trim().startsWith("{")) {
                                    processingViewModel.generateQuestionsFromText(
                                        sharedText,
                                        com.shiva.magics.data.model.InputSource.Json,
                                        "Shared Test"
                                    )
                                    if (navController.currentDestination?.route != AppRoutes.Processing.toString()) {
                                        navController.navigate(AppRoutes.Processing)
                                    }
                                } else if (sharedText != null) {
                                    val isUrl = android.util.Patterns.WEB_URL.matcher(sharedText).matches()
                                    if (isUrl && (sharedText.contains("youtube.com") || sharedText.contains("youtu.be"))) {
                                        processingViewModel.processYouTubeUrl(sharedText)
                                    } else if (isUrl) {
                                        processingViewModel.processWebUrl(sharedText)
                                    } else {
                                        processingViewModel.generateQuestionsFromText(sharedText, com.shiva.magics.data.model.InputSource.Manual, "Shared Text")
                                    }
                                    if (navController.currentDestination?.route != AppRoutes.Processing.toString()) {
                                        navController.navigate(AppRoutes.Processing)
                                    }
                                }
                            } else if (type.startsWith("image/") || type == "application/pdf") {
                 val uri = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                intent?.getParcelableExtra(android.content.Intent.EXTRA_STREAM, android.net.Uri::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent?.getParcelableExtra<android.net.Uri>(android.content.Intent.EXTRA_STREAM)
            }
                                if (uri != null) {
                                    val contentResolver = contentResolver
                                    val mimeType = contentResolver.getType(uri) ?: type
                                    val cursor = contentResolver.query(uri, null, null, null, null)
                                    var name = "shared_file"
                                    cursor?.use {
                                        if (it.moveToFirst()) {
                                            val index = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                                            if (index != -1) name = it.getString(index)
                                        }
                                    }
                                    processingViewModel.processFile(this@MainActivity, uri, mimeType, name)
                                    if (navController.currentDestination?.route != AppRoutes.Processing.toString()) {
                                        navController.navigate(AppRoutes.Processing)
                                    }
                                }
                            }
                        }
                    }

                    handleIntent(intent)
                    val listener = Consumer<Intent> { handleIntent(it) }
                    addOnNewIntentListener(listener)
                    onDispose { removeOnNewIntentListener(listener) }
                }


                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    // ── Session Restoration: reactive auth state listener
                    // Defers NavHost until Firebase has finished restoring the
                    // persisted session. Avoids the race where currentUser is
                    // transiently null on process recreation.
                    val auth = remember { FirebaseAuth.getInstance() }
                    var startDestination by remember { mutableStateOf<AppRoutes?>(null) }

                    DisposableEffect(auth) {
                        val listener = FirebaseAuth.AuthStateListener { firebaseAuth ->
                            val user = firebaseAuth.currentUser
                            val prefs = getSharedPreferences("app_settings", android.content.Context.MODE_PRIVATE)
                            val onboardingCompleted = prefs.getBoolean("onboarding_completed", false)
                            startDestination = when {
                                !onboardingCompleted -> AppRoutes.Onboarding
                                user == null -> AppRoutes.Login
                                profileViewModel.roleSelected.value -> AppRoutes.Home
                                else -> AppRoutes.RoleSelection
                            }
                        }
                        auth.addAuthStateListener(listener)
                        onDispose { auth.removeAuthStateListener(listener) }
                    }

                    if (startDestination != null) {
                        NavHost(
                            navController = navController,
                            startDestination = startDestination!!
                        ) {
                        composable<AppRoutes.Onboarding> {
                            com.shiva.magics.ui.screens.OnboardingScreen(navController = navController)
                        }
                        composable<AppRoutes.Login> {
                            val authViewModel: com.shiva.magics.ui.screens.AuthViewModel = viewModel()
                            LoginScreen(
                                viewModel = authViewModel,
                                onNavigateToHome = {
                                    navController.navigate(AppRoutes.Home) {
                                        popUpTo(AppRoutes.Login) { inclusive = true }
                                    }
                                },
                                onNavigateToForgotPassword = {
                                    navController.navigate(AppRoutes.ForgotPassword)
                                },
                                onNavigateToOtpVerification = { email ->
                                    navController.navigate(AppRoutes.OtpVerification(email))
                                }
                            )
                        }
                        composable<AppRoutes.ForgotPassword> {
                            ForgotPasswordScreen(
                                onNavigateBack = { navController.popBackStack() }
                            )
                        }
                        composable<AppRoutes.OtpVerification> {
                            val route = it.toRoute<AppRoutes.OtpVerification>()
                            // Retrieve the same AuthViewModel that was created on the Login backstack entry
                            val loginEntry = remember(it) {
                                navController.getBackStackEntry(AppRoutes.Login)
                            }
                            val authViewModel: com.shiva.magics.ui.screens.AuthViewModel = viewModel(loginEntry)
                            OtpVerificationScreen(
                                email = route.email,
                                viewModel = authViewModel,
                                onNavigateToHome = {
                                    // New user: pick role first. Existing user: go home.
                                    val dest = if (profileViewModel.roleSelected.value)
                                        AppRoutes.Home else AppRoutes.RoleSelection
                                    navController.navigate(dest) {
                                        popUpTo(AppRoutes.Login) { inclusive = true }
                                    }
                                },
                                onNavigateBack = { navController.popBackStack() }
                            )
                        }
                        composable<AppRoutes.Home> {
                            com.shiva.magics.ui.screens.HomeScreen(
                                navController        = navController,
                                homeViewModel        = homeViewModel,
                                profileViewModel     = profileViewModel,
                                editorViewModel      = editorViewModel,
                                processingViewModel  = processingViewModel,
                                testPlayerViewModel  = testPlayerViewModel,
                                marketplaceViewModel = marketplaceViewModel,
                                repository           = repository
                            )
                        }
                        composable<AppRoutes.RoleSelection> {
                            com.shiva.magics.ui.screens.RoleSelectionScreen(
                                profileViewModel = profileViewModel,
                                onRoleSelected = {
                                    navController.navigate(AppRoutes.Home) {
                                        popUpTo(AppRoutes.RoleSelection) { inclusive = true }
                                    }
                                }
                            )
                        }
                        composable<AppRoutes.Profile> {
                            val tests by homeViewModel.tests.collectAsState()
                            val avgScore = if (tests.isNotEmpty())
                                tests.mapNotNull { it.bestScorePercent }.let { s ->
                                    if (s.isNotEmpty()) s.average().toInt() else 0
                                } else 0
                            com.shiva.magics.ui.screens.ProfileScreen(
                                profileViewModel = profileViewModel,
                                onNavigateBack = { navController.popBackStack() },
                                onSignOut = {
                                    navController.navigate(AppRoutes.Login) {
                                        popUpTo(0) { inclusive = true }
                                    }
                                },
                                testsCount = tests.size,
                                avgScore = avgScore
                            )
                        }
                        composable<AppRoutes.Processing> {
                            ProcessingScreen(
                                navController = navController,
                                viewModel = processingViewModel,
                                editorViewModel = editorViewModel,
                                testPlayerViewModel = testPlayerViewModel
                            )
                        }
                        composable<AppRoutes.Editor> {
                            EditorScreen(
                                navController = navController,
                                viewModel = editorViewModel,
                                repository = repository
                            )
                        }
                        composable<AppRoutes.TestPlayerWithId> {
                            val route = it.toRoute<AppRoutes.TestPlayerWithId>()
                            LaunchedEffect(route.id) {
                                testPlayerViewModel.loadTestFromDb(route.id, repository)
                            }
                            TestPlayerScreen(
                                navController = navController,
                                viewModel = testPlayerViewModel,
                                repository = repository
                            )
                        }
                        // Assignment-based TestPlayer (questions pre-loaded into VM)
                        composable<AppRoutes.TestPlayer> {
                            TestPlayerScreen(
                                navController = navController,
                                viewModel = testPlayerViewModel,
                                repository = repository
                            )
                        }
                        composable<AppRoutes.Results> {
                            ResultsScreen(
                                navController = navController,
                                viewModel = testPlayerViewModel,
                                repository = repository,
                                classroomViewModel = classroomViewModel
                            )
                        }
                        composable<AppRoutes.Review> {
                            ReviewScreen(
                                navController = navController,
                                viewModel = testPlayerViewModel
                            )
                        }
                        composable<AppRoutes.Camera> {
                            CameraScreen(
                                navController = navController,
                                processingViewModel = processingViewModel
                            )
                        }
                        composable<AppRoutes.VoiceRecorder> {
                            VoiceRecorderScreen(
                                navController = navController,
                                processingViewModel = processingViewModel
                            )
                        }
                        composable<AppRoutes.Settings> {
                            SettingsScreen(
                                navController = navController,
                                repository = repository
                            )
                        }
                        // ── Phase 4 routes ──────────────────────────────────
                        composable<AppRoutes.Marketplace> {
                            com.shiva.magics.ui.screens.MarketplaceScreen(
                                navController = navController,
                                viewModel     = marketplaceViewModel
                            )
                        }
                        composable<AppRoutes.CreatorDashboard> {
                            com.shiva.magics.ui.screens.CreatorDashboardScreen(
                                navController    = navController,
                                viewModel        = creatorViewModel
                            )
                        }
                        // ── Phase 2 routes ──────────────────────────────────
                        composable<AppRoutes.Classroom> {
                            com.shiva.magics.ui.screens.ClassroomScreen(
                                navController      = navController,
                                classroomViewModel = classroomViewModel,
                                profileViewModel   = profileViewModel
                            )
                        }
                        composable<AppRoutes.ClassDetail> {
                            com.shiva.magics.ui.screens.ClassDetailScreen(
                                navController      = navController,
                                classroomViewModel = classroomViewModel,
                                profileViewModel   = profileViewModel,
                                testPlayerViewModel = testPlayerViewModel
                            )
                        }
                        composable<AppRoutes.TeacherDashboard> {
                            com.shiva.magics.ui.screens.TeacherDashboardScreen(
                                navController      = navController,
                                classroomViewModel = classroomViewModel,
                                profileViewModel   = profileViewModel
                            )
                        }
                        composable<AppRoutes.StudentAssignments> {
                            com.shiva.magics.ui.screens.StudentAssignmentsScreen(
                                navController      = navController,
                                classroomViewModel = classroomViewModel,
                                profileViewModel   = profileViewModel,
                                testPlayerViewModel = testPlayerViewModel
                            )
                        }
                        // ── Phase 3 routes ──────────────────────────────────
                        composable<AppRoutes.Analytics> {
                            com.shiva.magics.ui.screens.AnalyticsScreen(
                                navController      = navController,
                                analyticsViewModel = analyticsViewModel,
                                profileViewModel   = profileViewModel
                            )
                        }
                    }
                    } // end if (startDestination != null)
                }
            }
        }
    }
}