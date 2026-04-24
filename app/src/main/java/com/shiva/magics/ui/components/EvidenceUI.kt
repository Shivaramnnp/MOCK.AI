package com.shiva.magics.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.shiva.magics.data.model.Citation
import com.shiva.magics.data.model.VerificationStatus
import com.shiva.magics.util.TelemetryCollector

@Composable
fun CitationBadge(
    status: VerificationStatus,
    citation: Citation?,
    onClick: () -> Unit
) {
    val (icon, text, bgColor, contentColor, desc) = when (status) {
        VerificationStatus.VERIFIED -> listOf(
            Icons.Outlined.CheckCircle,
            "Verified \uD83D\uDEE1\uFE0F | Source: Page ${citation?.pageNumber ?: "-"}",
            Color(0xFFE8F5E9), // Light Green
            Color(0xFF2E7D32), // Dark Green (WCAG AA)
            "Verified answer. Source page ${citation?.pageNumber ?: "unknown"}."
        )
        VerificationStatus.PARTIAL -> listOf(
            Icons.Outlined.Info,
            "Partial \uD83D\uDFE1",
            Color(0xFFFFF8E1), // Light Amber
            Color(0xFFF57F17), // Dark Amber
            "Partially verified answer."
        )
        VerificationStatus.FAILED -> listOf(
            Icons.Filled.Warning,
            "Verification Failed \uD83D\uDD34",
            Color(0xFFFFEBEE), // Light Red
            Color(0xFFC62828), // Dark Red
            "Verification failed."
        )
        VerificationStatus.UNVERIFIED -> listOf(
            Icons.Outlined.Info,
            "Unverified ⚪",
            Color(0xFFF5F5F5), // Light Gray
            Color(0xFF616161), // Dark Gray
            "Unverified answer."
        )
    }

    Row(
        modifier = Modifier
            .padding(vertical = 8.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(bgColor as Color)
            .clickable { 
                TelemetryCollector.record(TelemetryCollector.EventType.CACHE_HIT, "badgeTapped_$status", 1.0)
                onClick() 
            }
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .semantics { contentDescription = desc as String },
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon as androidx.compose.ui.graphics.vector.ImageVector,
            contentDescription = null,
            tint = contentColor as Color,
            modifier = Modifier.size(16.dp)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = text as String,
            color = contentColor,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EvidenceBottomSheet(
    citation: Citation?,
    trustScore: Float,
    status: VerificationStatus,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    
    ModalBottomSheet(
        onDismissRequest = {
            TelemetryCollector.record(TelemetryCollector.EventType.CACHE_MISS, "evidenceViewClosed", 1.0)
            onDismiss()
        },
        sheetState = sheetState
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp)
                .padding(bottom = 32.dp)
        ) {
            Text("Verification Evidence", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(16.dp))
            
            if (citation != null) {
                // Confidence Info
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("Confidence: ", fontWeight = FontWeight.SemiBold)
                    Text(
                        "${(trustScore * 100).toInt()}%", 
                        color = if (trustScore >= 0.85f) Color(0xFF2E7D32) else Color(0xFFF57F17),
                        fontWeight = FontWeight.Bold
                    )
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                ConfidenceIndicator(trustScore = trustScore)
                
                Spacer(modifier = Modifier.height(24.dp))
                
                // Citation Source
                Text("Source Location", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = Color.Gray)
                Text(
                    text = citation.pageNumber?.let { "Page $it" } 
                        ?: citation.youtubeTimestamp?.let { "Timestamp: $it" } 
                        ?: "Unknown Document Location",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium
                )
                
                Spacer(modifier = Modifier.height(16.dp))
                
                Text("Exact Source Text", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = Color.Gray)
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
                ) {
                    Text(
                        text = "\"${citation.sourceExactText}\"",
                        modifier = Modifier.padding(16.dp),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            } else {
                Text(
                    text = "No direct source evidence could be found or the content was not verifiable deterministically.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
fun ConfidenceIndicator(trustScore: Float) {
    val progressColor = when {
        trustScore >= 0.85f -> Color(0xFF4CAF50)
        trustScore >= 0.70f -> Color(0xFFFFB300)
        else -> Color(0xFFE53935)
    }
    
    LinearProgressIndicator(
        progress = trustScore,
        modifier = Modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(RoundedCornerShape(4.dp)),
        color = progressColor,
        trackColor = progressColor.copy(alpha = 0.2f)
    )
}
