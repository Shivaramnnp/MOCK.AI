package com.shivasruthi.magics.ui.components

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp

object BasicLaTeXRenderer {
    
    fun renderLatex(text: String): String {
        var result = text
        
        // Greek letters
        result = result.replace("\\alpha", "α")
        result = result.replace("\\beta", "β")
        result = result.replace("\\gamma", "γ")
        result = result.replace("\\delta", "δ")
        result = result.replace("\\epsilon", "ε")
        result = result.replace("\\theta", "θ")
        result = result.replace("\\lambda", "λ")
        result = result.replace("\\mu", "μ")
        result = result.replace("\\pi", "π")
        result = result.replace("\\sigma", "σ")
        result = result.replace("\\phi", "φ")
        result = result.replace("\\omega", "ω")
        
        // Uppercase Greek
        result = result.replace("\\Gamma", "Γ")
        result = result.replace("\\Delta", "Δ")
        result = result.replace("\\Theta", "Θ")
        result = result.replace("\\Lambda", "Λ")
        result = result.replace("\\Pi", "Π")
        result = result.replace("\\Sigma", "Σ")
        result = result.replace("\\Phi", "Φ")
        result = result.replace("\\Omega", "Ω")
        
        // Math operators
        result = result.replace("\\pm", "±")
        result = result.replace("\\times", "×")
        result = result.replace("\\div", "÷")
        result = result.replace("\\cdot", "·")
        result = result.replace("\\leq", "≤")
        result = result.replace("\\geq", "≥")
        result = result.replace("\\neq", "≠")
        result = result.replace("\\approx", "≈")
        result = result.replace("\\infty", "∞")
        result = result.replace("\\partial", "∂")
        result = result.replace("\\nabla", "∇")
        result = result.replace("\\sum", "∑")
        result = result.replace("\\prod", "∏")
        result = result.replace("\\int", "∫")
        
        // Arrows
        result = result.replace("\\rightarrow", "→")
        result = result.replace("\\leftarrow", "←")
        result = result.replace("\\uparrow", "↑")
        result = result.replace("\\downarrow", "↓")
        result = result.replace("\\Rightarrow", "⇒")
        result = result.replace("\\Leftarrow", "⇐")
        result = result.replace("\\leftrightarrow", "↔")
        
        // Relations
        result = result.replace("\\in", "∈")
        result = result.replace("\\subset", "⊂")
        result = result.replace("\\supset", "⊃")
        result = result.replace("\\subseteq", "⊆")
        result = result.replace("\\supseteq", "⊇")
        result = result.replace("\\equiv", "≡")
        result = result.replace("\\propto", "∝")
        result = result.replace("\\parallel", "∥")
        result = result.replace("\\perp", "⊥")
        
        // Handle simple superscripts ^x
        result = result.replace("^0", "⁰")
        result = result.replace("^1", "¹")
        result = result.replace("^2", "²")
        result = result.replace("^3", "³")
        result = result.replace("^4", "⁴")
        result = result.replace("^5", "⁵")
        result = result.replace("^6", "⁶")
        result = result.replace("^7", "⁷")
        result = result.replace("^8", "⁸")
        result = result.replace("^9", "⁹")
        result = result.replace("^+", "⁺")
        result = result.replace("^-", "⁻")
        result = result.replace("^a", "ᵃ")
        result = result.replace("^b", "ᵇ")
        result = result.replace("^c", "ᶜ")
        result = result.replace("^i", "ⁱ")
        result = result.replace("^n", "ⁿ")
        result = result.replace("^x", "ˣ")
        
        // Handle simple subscripts _x
        result = result.replace("_0", "₀")
        result = result.replace("_1", "₁")
        result = result.replace("_2", "₂")
        result = result.replace("_3", "₃")
        result = result.replace("_4", "₄")
        result = result.replace("_5", "₅")
        result = result.replace("_6", "₆")
        result = result.replace("_7", "₇")
        result = result.replace("_8", "₈")
        result = result.replace("_9", "₉")
        result = result.replace("_a", "ₐ")
        result = result.replace("_e", "ₑ")
        result = result.replace("_i", "ᵢ")
        result = result.replace("_x", "ₓ")
        
        // Handle fractions \frac{a}{b}
        val fractionPattern = Regex("\\\\frac\\{([^}]+)\\}\\{([^}]+)\\}")
        result = fractionPattern.replace(result) { match ->
            val numerator = match.groupValues[1]
            val denominator = match.groupValues[2]
            "$numerator/$denominator"
        }
        
        // Handle square roots \sqrt{x}
        val sqrtPattern = Regex("\\\\sqrt\\{([^}]+)\\}")
        result = sqrtPattern.replace(result) { match ->
            "√${match.groupValues[1]}"
        }
        
        // Handle brace superscripts ^{...}
        val braceSuperPattern = Regex("\\^\\{([^}]+)\\}")
        result = braceSuperPattern.replace(result) { match ->
            val content = match.groupValues[1]
            val superContent = StringBuilder()
            for (char in content) {
                superContent.append(when (char) {
                    '0' -> '⁰'; '1' -> '¹'; '2' -> '²'; '3' -> '³'; '4' -> '⁴'
                    '5' -> '⁵'; '6' -> '⁶'; '7' -> '⁷'; '8' -> '⁸'; '9' -> '⁹'
                    '+' -> '⁺'; '-' -> '⁻'; '(' -> '⁽'; ')' -> '⁾'
                    'a' -> 'ᵃ'; 'b' -> 'ᵇ'; 'c' -> 'ᶜ'; 'd' -> 'ᵈ'; 'e' -> 'ᵉ'
                    'f' -> 'ᶠ'; 'g' -> 'ᵍ'; 'h' -> 'ʰ'; 'i' -> 'ⁱ'; 'j' -> 'ʲ'
                    'k' -> 'ᵏ'; 'l' -> 'ˡ'; 'm' -> 'ᵐ'; 'n' -> 'ⁿ'; 'o' -> 'ᵒ'
                    'p' -> 'ᵖ'; 'r' -> 'ʳ'; 's' -> 'ˢ'; 't' -> 'ᵗ'; 'u' -> 'ᵘ'
                    'v' -> 'ᵛ'; 'w' -> 'ʷ'; 'x' -> 'ˣ'; 'y' -> 'ʸ'; 'z' -> 'ᶻ'
                    else -> char
                })
            }
            superContent.toString()
        }
        
        // Handle brace subscripts _{...}
        val braceSubPattern = Regex("_\\{([^}]+)\\}")
        result = braceSubPattern.replace(result) { match ->
            val content = match.groupValues[1]
            val subContent = StringBuilder()
            for (char in content) {
                subContent.append(when (char) {
                    '0' -> '₀'; '1' -> '₁'; '2' -> '₂'; '3' -> '₃'; '4' -> '₄'
                    '5' -> '₅'; '6' -> '₆'; '7' -> '₇'; '8' -> '₈'; '9' -> '₉'
                    '+' -> '₊'; '-' -> '₋'; '(' -> '₍'; ')' -> '₎'
                    'a' -> 'ₐ'; 'e' -> 'ₑ'; 'i' -> 'ᵢ'; 'j' -> 'ⱼ'; 'k' -> 'ₖ'
                    'l' -> 'ₗ'; 'm' -> 'ₘ'; 'n' -> 'ₙ'; 'o' -> 'ₒ'; 'p' -> 'ₚ'
                    'r' -> 'ᵣ'; 's' -> 'ₛ'; 't' -> 'ₜ'; 'u' -> 'ᵤ'; 'v' -> 'ᵥ'
                    'x' -> 'ₓ'; else -> char
                })
            }
            subContent.toString()
        }
        
        return result
    }
}

@Composable
fun BasicLaTeXText(
    text: String,
    modifier: Modifier = Modifier,
    fontSize: Int = 16
) {
    val segments = LaTeXTextProcessor.parseLatexText(text)
    
    val annotatedString = buildAnnotatedString {
        segments.forEach { segment ->
            if (segment.isLatex) {
                val renderedText = BasicLaTeXRenderer.renderLatex(segment.text)
                withStyle(
                    style = androidx.compose.ui.text.SpanStyle(
                        fontFamily = FontFamily.Monospace,
                        fontStyle = FontStyle.Italic,
                        fontSize = fontSize.sp,
                        fontWeight = FontWeight.Medium
                    )
                ) {
                    append(renderedText)
                }
            } else {
                withStyle(
                    style = androidx.compose.ui.text.SpanStyle(
                        fontSize = fontSize.sp,
                        fontFamily = FontFamily.Default
                    )
                ) {
                    append(segment.text)
                }
            }
        }
    }
    
    Text(
        text = annotatedString,
        modifier = modifier
    )
}
