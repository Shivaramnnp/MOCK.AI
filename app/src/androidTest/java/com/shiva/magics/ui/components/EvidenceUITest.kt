package com.shiva.magics.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.shiva.magics.data.model.Citation
import com.shiva.magics.data.model.VerificationStatus
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EvidenceUITest {

    @get:Rule
    val composeTestRule = createComposeRule()

    // Test 1 — Badge Rendering
    @Test
    fun testBadgeRendering_Verified() {
        val citation = Citation(pageNumber = 12, sourceExactText = "Exact text")
        
        composeTestRule.setContent {
            MaterialTheme {
                CitationBadge(
                    status = VerificationStatus.VERIFIED,
                    citation = citation,
                    onClick = {}
                )
            }
        }
        
        composeTestRule.onNodeWithText("Verified \uD83D\uDEE1\uFE0F | Source: Page 12").assertIsDisplayed()
    }

    // Test 2 — Bottom Sheet Opens
    @Test
    fun testBottomSheetOpensOnTap() {
        val citation = Citation(pageNumber = 12, sourceExactText = "The exact source text.")
        
        composeTestRule.setContent {
            MaterialTheme {
                // To test state changes we use a wrapper
                var showSheet = false
                
                CitationBadge(
                    status = VerificationStatus.VERIFIED,
                    citation = citation,
                    onClick = { showSheet = true }
                )
                
                if (showSheet) {
                    EvidenceBottomSheet(
                        citation = citation,
                        trustScore = 0.95f,
                        status = VerificationStatus.VERIFIED,
                        onDismiss = { showSheet = false }
                    )
                }
            }
        }
        
        // Tap the badge
        composeTestRule.onNodeWithText("Verified \uD83D\uDEE1\uFE0F | Source: Page 12").performClick()
        
        // Assert sheet content appears
        composeTestRule.onNodeWithText("Verification Evidence").assertIsDisplayed()
        composeTestRule.onNodeWithText("\"The exact source text.\"").assertIsDisplayed()
    }

    // Test 3 — Null Citation
    @Test
    fun testNullCitationDoesNotCrashAndShowsUnverified() {
        composeTestRule.setContent {
            MaterialTheme {
                CitationBadge(
                    status = VerificationStatus.UNVERIFIED,
                    citation = null,
                    onClick = {}
                )
            }
        }
        
        composeTestRule.onNodeWithText("Unverified ⚪").assertIsDisplayed()
        // If it reaches here, it did not crash.
    }

    // Test 4 — Accessibility
    @Test
    fun testAccessibilityScreenReaderAnnouncesBadge() {
        val citation = Citation(pageNumber = 12, sourceExactText = "Exact text")
        
        composeTestRule.setContent {
            MaterialTheme {
                CitationBadge(
                    status = VerificationStatus.VERIFIED,
                    citation = citation,
                    onClick = {}
                )
            }
        }
        
        // Ensure semantic properties are properly assigned for screen readers
        composeTestRule.onNodeWithContentDescription("Verified answer. Source page 12.").assertIsDisplayed()
    }
}
