package com.shivasruthi.magics.ui.components

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

data class TextSegment(
    val text: String,
    val isLatex: Boolean,
    val isDisplayMode: Boolean
)

object LaTeXTextProcessor {
    
    // Regex patterns for LaTeX detection
    private val inlineLatexPattern = Regex("""\$(?!\$)([^$]+)\$""")
    private val displayLatexPattern = Regex("""\$\$([^$]+)\$\$""")
    
    fun parseLatexText(text: String): List<TextSegment> {
        val segments = mutableListOf<TextSegment>()
        var currentIndex = 0
        
        // First check for display mode LaTeX (block equations)
        val displayMatches = displayLatexPattern.findAll(text)
        
        if (displayMatches.any()) {
            var lastIndex = 0
            for (match in displayMatches) {
                // Add text before the LaTeX
                if (match.range.first > lastIndex) {
                    val beforeText = text.substring(lastIndex, match.range.first)
                    segments.addAll(parseInlineLatex(beforeText))
                }
                
                // Add display mode LaTeX
                segments.add(TextSegment(
                    text = match.groupValues[1],
                    isLatex = true,
                    isDisplayMode = true
                ))
                
                lastIndex = match.range.last + 1
            }
            
            // Add remaining text
            if (lastIndex < text.length) {
                val remainingText = text.substring(lastIndex)
                segments.addAll(parseInlineLatex(remainingText))
            }
        } else {
            // No display mode LaTeX, parse inline LaTeX
            segments.addAll(parseInlineLatex(text))
        }
        
        return segments
    }
    
    private fun parseInlineLatex(text: String): List<TextSegment> {
        val segments = mutableListOf<TextSegment>()
        var currentIndex = 0
        
        val inlineMatches = inlineLatexPattern.findAll(text)
        
        if (inlineMatches.any()) {
            for (match in inlineMatches) {
                // Add text before the LaTeX
                if (match.range.first > currentIndex) {
                    val beforeText = text.substring(currentIndex, match.range.first)
                    if (beforeText.isNotEmpty()) {
                        segments.add(TextSegment(
                            text = beforeText,
                            isLatex = false,
                            isDisplayMode = false
                        ))
                    }
                }
                
                // Add inline LaTeX
                segments.add(TextSegment(
                    text = match.groupValues[1],
                    isLatex = true,
                    isDisplayMode = false
                ))
                
                currentIndex = match.range.last + 1
            }
            
            // Add remaining text
            if (currentIndex < text.length) {
                val remainingText = text.substring(currentIndex)
                if (remainingText.isNotEmpty()) {
                    segments.add(TextSegment(
                        text = remainingText,
                        isLatex = false,
                        isDisplayMode = false
                    ))
                }
            }
        } else {
            // No LaTeX found, treat as plain text
            if (text.isNotEmpty()) {
                segments.add(TextSegment(
                    text = text,
                    isLatex = false,
                    isDisplayMode = false
                ))
            }
        }
        
        return segments
    }
}

@Composable
fun LaTeXText(
    text: String,
    modifier: Modifier = Modifier,
    fontSize: Int = 16
) {
    val segments = LaTeXTextProcessor.parseLatexText(text)
    
    Row(modifier = modifier) {
        segments.forEachIndexed { index, segment ->
            if (segment.isLatex) {
                if (segment.isDisplayMode) {
                    if (index > 0) {
                        // Add spacing before display mode
                        Spacer(modifier = Modifier.width(4.dp))
                    }
                    DisplayModeLaTeXWebView(
                        latex = segment.text,
                        fontSize = fontSize
                    )
                    if (index < segments.size - 1) {
                        // Add spacing after display mode
                        Spacer(modifier = Modifier.width(4.dp))
                    }
                } else {
                    LaTeXWebView(
                        latex = segment.text,
                        fontSize = fontSize
                    )
                }
            } else {
                Text(
                    text = segment.text,
                    fontSize = fontSize.sp,
                    modifier = Modifier
                )
            }
        }
    }
}
