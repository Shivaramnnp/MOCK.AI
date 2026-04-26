import java.util.Properties

plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.kotlinAndroid)
    alias(libs.plugins.kotlinCompose)
    alias(libs.plugins.kotlinSerialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.secretsGradlePlugin)
    alias(libs.plugins.googleServicesPlugin)
}

android {
    namespace = "com.shiva.magics"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.shiva.magics"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a")
            isUniversalApk = false
        }
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    testOptions {
        unitTests.isReturnDefaultValues = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }

    val localProperties = Properties()
    val localPropertiesFile = rootProject.file("local.properties")
    if (localPropertiesFile.exists()) {
        localProperties.load(localPropertiesFile.inputStream())
    }

    fun getSafeProperty(key: String, default: String = ""): String {
        val raw = localProperties.getProperty(key, default)
        return raw.trim().removeSurrounding("\"").removeSurrounding("'")
    }

    defaultConfig {
        buildConfigField("String", "GEMINI_API_KEY", "\"${getSafeProperty("GEMINI_API_KEY")}\"")
        buildConfigField("String", "SUPABASE_URL", "\"${getSafeProperty("SUPABASE_URL")}\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"${getSafeProperty("SUPABASE_ANON_KEY")}\"")
        buildConfigField("String", "GROQ_API_KEY", "\"${getSafeProperty("GROQ_API_KEY")}\"")
        buildConfigField("String", "GEMINI_FLASH_LITE_KEY", "\"${getSafeProperty("GEMINI_FLASH_LITE_KEY")}\"")
        buildConfigField("String", "YOUTUBE_GEMINI_KEY", "\"${getSafeProperty("YOUTUBE_GEMINI_KEY")}\"")
        buildConfigField("String", "YOUTUBE_BACKEND_URL", "\"${getSafeProperty("YOUTUBE_BACKEND_URL", "http://localhost:5000")}\"")
        buildConfigField("String", "YOUTUBE_DATA_API_KEY", "\"${getSafeProperty("YOUTUBE_DATA_API_KEY")}\"")
        buildConfigField("String", "SUPADATA_API_KEY", "\"${getSafeProperty("SUPADATA_API_KEY")}\"")
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.androidx.compose.animation)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.splashscreen)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.compose.ui.text.google.fonts)
    implementation(libs.coil.compose)
    debugImplementation(libs.androidx.compose.ui.tooling)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.jsoup)
    implementation(libs.mlkit.text.recognition)
    implementation(libs.camerax.core)
    implementation(libs.camerax.camera2)
    implementation(libs.camerax.lifecycle)
    implementation(libs.camerax.view)
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.kotlinx)
    implementation(libs.androidx.webkit)
    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.guava)
    // Gap #8: AES-256 encrypted storage for API keys and tokens
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    // Required for Firestore suspend/await extension in SyncConflictResolver
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.7.3")
    // Proper LocalLifecycleOwner for CameraScreen
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation(libs.androidx.work)
}
