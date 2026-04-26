package com.shiva.magics.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ── Spacing System (Phase 1) ───────────────────────────────────────────────
object MockAiSpacing {
    val Grid = 8.dp
    val Padding = 16.dp
    val Section = 24.dp
    val Component = 12.dp
}

// ── Button Standardization (Phase 1) ───────────────────────────────────────
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isLoading: Boolean = false,
    icon: ImageVector? = null
) {
    Button(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .height(48.dp),
        shape = RoundedCornerShape(12.dp),
        enabled = enabled && !isLoading,
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            disabledContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
        )
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(24.dp),
                color = MaterialTheme.colorScheme.onPrimary,
                strokeWidth = 2.dp
            )
        } else {
            if (icon != null) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
            }
            Text(
                text = text,
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold)
            )
        }
    }
}

@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isLoading: Boolean = false,
    icon: ImageVector? = null
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .height(48.dp),
        shape = RoundedCornerShape(12.dp),
        enabled = enabled && !isLoading,
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            if (enabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
        )
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(24.dp),
                color = MaterialTheme.colorScheme.primary,
                strokeWidth = 2.dp
            )
        } else {
            if (icon != null) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
            }
            Text(
                text = text,
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold)
            )
        }
    }
}

// ── Typography Helpers (Phase 1) ───────────────────────────────────────────
@Composable
fun ScreenTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.headlineLarge.copy(
            fontSize = 22.sp,
            fontWeight = FontWeight.SemiBold
        ),
        color = MaterialTheme.colorScheme.onBackground,
        modifier = modifier
    )
}

@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.headlineSmall.copy(
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold
        ),
        color = MaterialTheme.colorScheme.onBackground,
        modifier = modifier
    )
}

// ── Empty State Standardization (Phase 2) ──────────────────────────────────
@Composable
fun EmptyStateView(
    title: String,
    message: String,
    icon: ImageVector,
    buttonText: String? = null,
    onButtonClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(MockAiSpacing.Section),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f),
            modifier = Modifier.size(80.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.size(40.dp),
                    tint = MaterialTheme.colorScheme.primary
                )
            }
        }
        
        Spacer(modifier = Modifier.height(MockAiSpacing.Section))
        
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onBackground
        )
        
        Spacer(modifier = Modifier.height(MockAiSpacing.Grid))
        
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp),
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
        )
        
        if (buttonText != null && onButtonClick != null) {
            Spacer(modifier = Modifier.height(MockAiSpacing.Section))
            PrimaryButton(
                text = buttonText,
                onClick = onButtonClick,
                modifier = Modifier.widthIn(max = 240.dp)
            )
        }
    }
}

// ── Error State Standardization (Phase 1 & 5) ──────────────────────────────
@Composable
fun ErrorStateView(
    rawError: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    // Phase 1: Replace Technical Errors with User-Friendly Messages
    val friendlyMessage = when {
        rawError.contains("PERMISSION_DENIED", ignoreCase = true) -> 
            "Unable to access this data. Please check your permissions and try again."
        rawError.contains("FAILED_PRECONDITION", ignoreCase = true) -> 
            "The system is currently setting up this feature. Please try again in a few moments."
        rawError.contains("EXCEPTION", ignoreCase = true) || rawError.contains("ERROR_CODE", ignoreCase = true) -> 
            "Something went wrong while connecting to the server. Please try again."
        rawError.contains("NULL", ignoreCase = true) -> 
            "We couldn't find the requested information."
        rawError.contains("network", ignoreCase = true) -> 
            "You seem to be offline. Please check your internet connection."
        else -> "An unexpected error occurred. Please try again."
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(MockAiSpacing.Section),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Warning,
            contentDescription = "Error",
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.error
        )
        
        Spacer(modifier = Modifier.height(MockAiSpacing.Padding))
        
        Text(
            text = "Oops! Something went wrong",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onBackground
        )
        
        Spacer(modifier = Modifier.height(MockAiSpacing.Grid))
        
        Text(
            text = friendlyMessage,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
        )
        
        Spacer(modifier = Modifier.height(MockAiSpacing.Section))
        
        SecondaryButton(
            text = "Retry",
            onClick = onRetry,
            modifier = Modifier.widthIn(max = 160.dp),
            icon = Icons.Default.Refresh
        )
    }
}

// ── Loading Feedback Standardization (Phase 1) ─────────────────────────────
@Composable
fun FullScreenLoading(message: String = "Loading...") {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(MockAiSpacing.Section),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(MockAiSpacing.Padding))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
            )
        }
    }
}
