package com.shivasruthi.magics.ui.components

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Simple LaTeX renderer for basic math expressions
object SimpleLaTeXRenderer {
    
    private val latexReplacements = mapOf(
        // Greek letters
        "\\alpha" to "α",
        "\\beta" to "β", 
        "\\gamma" to "γ",
        "\\delta" to "δ",
        "\\epsilon" to "ε",
        "\\theta" to "θ",
        "\\lambda" to "λ",
        "\\mu" to "μ",
        "\\pi" to "π",
        "\\sigma" to "σ",
        "\\phi" to "φ",
        "\\omega" to "ω",
        
        // Math symbols
        "\\infty" to "∞",
        "\\sum" to "∑",
        "\\prod" to "∏",
        "\\int" to "∫",
        "\\partial" to "∂",
        "\\nabla" to "∇",
        "\\pm" to "±",
        "\\times" to "×",
        "\\div" to "÷",
        "\\leq" to "≤",
        "\\geq" to "≥",
        "\\neq" to "≠",
        "\\approx" to "≈",
        "\\equiv" to "≡",
        "\\propto" to "∝"
    )
    
    private val latexRegexReplacements = listOf(
        Regex("\\^\\{([^}]+)\\}") to "^$1",
        Regex("\\^([0-9a-zA-Z])") to "^$1",
        Regex("_\\{([^}]+)\\}") to "_$1",
        Regex("_([0-9a-zA-Z])") to "_$1"
    )
    
    fun renderSimpleLatex(text: String): String {
        var result = text
        
        // Replace string patterns
        latexReplacements.forEach { (pattern, replacement) ->
            result = result.replace(pattern, replacement)
        }
        
        // Replace regex patterns
        latexRegexReplacements.forEach { (pattern, replacement) ->
            result = result.replace(pattern, replacement)
        }
        
        // Handle simple fractions like \frac{1}{2}
        val fractionPattern = Regex("\\\\frac\\{([^}]+)\\}\\{([^}]+)\\}")
        result = fractionPattern.replace(result) { match ->
            "${match.groupValues[1]}/${match.groupValues[2]}"
        }
        
        // Handle square roots like \sqrt{x}
        val sqrtPattern = Regex("\\\\sqrt\\{([^}]+)\\}")
        result = sqrtPattern.replace(result) { match ->
            "√${match.groupValues[1]}"
        }
        
        return result
    }
}

@Composable
fun SimpleLaTeXText(
    text: String,
    modifier: Modifier = Modifier,
    fontSize: Int = 16
) {
    val segments = LaTeXTextProcessor.parseLatexText(text)
    
    Row(modifier = modifier) {
        segments.forEach { segment ->
            if (segment.isLatex) {
                // Use simple text rendering for LaTeX with special styling
                val renderedText = SimpleLaTeXRenderer.renderSimpleLatex(segment.text)
                Text(
                    text = renderedText,
                    fontSize = fontSize.sp,
                    fontFamily = FontFamily.Monospace,
                    fontStyle = FontStyle.Italic,
                    modifier = Modifier
                )
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

// Fallback component for when WebView is too heavy
@Composable
fun LightweightLaTeXText(
    text: String,
    modifier: Modifier = Modifier,
    fontSize: Int = 16
) {
    val segments = LaTeXTextProcessor.parseLatexText(text)
    
    Row(modifier = modifier) {
        segments.forEachIndexed { index, segment ->
            if (segment.isLatex) {
                // Use annotated string for better performance
                val renderedText = SimpleLaTeXRenderer.renderSimpleLatex(segment.text)
                Text(
                    text = buildAnnotatedString {
                        withStyle(SpanStyle(
                            fontFamily = FontFamily.Monospace,
                            fontStyle = FontStyle.Italic,
                            fontSize = fontSize.sp
                        )) {
                            append(renderedText)
                        }
                    },
                    modifier = Modifier
                )
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
