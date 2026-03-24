package com.shiva.magics.ui.components

import android.annotation.SuppressLint
import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun LaTeXWebView(
    latex: String,
    modifier: Modifier = Modifier,
    fontSize: Int = 16
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    
    // Cache the template to avoid recreating on every recomposition
    val katexTemplate = remember(fontSize) {
        """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
            <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
            <style>
                body {
                    margin: 0;
                    padding: 4px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: ${fontSize}px;
                    color: #000000;
                    background-color: transparent;
                    overflow: hidden;
                }
                .katex {
                    font-size: ${fontSize}px;
                    display: inline-block;
                }
                .katex-display {
                    margin: 0;
                }
            </style>
        </head>
        <body>
            <div id="math"></div>
            <script>
                try {
                    katex.render(`$latex`, document.getElementById('math'), {
                        throwOnError: false,
                        displayMode: false,
                        output: 'html',
                        strict: false
                    });
                } catch (e) {
                    document.getElementById('math').innerHTML = `$latex`;
                }
            </script>
        </body>
        </html>
        """.trimIndent()
    }

    BoxWithConstraints(modifier = modifier) {
        AndroidView(
            factory = { ctx ->
                WebView(ctx).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    
                    webViewClient = object : WebViewClient() {
                        override fun onPageFinished(view: WebView?, url: String?) {
                            // Auto-resize based on content
                            view?.post {
                                val maxWidthPx = with(density) { maxWidth.toPx() }.toInt()
                                view.measure(
                                    View.MeasureSpec.makeMeasureSpec(
                                        maxWidthPx - 32, // Account for padding
                                        View.MeasureSpec.AT_MOST
                                    ),
                                    View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
                                )
                                val height = view.measuredHeight
                                layoutParams = ViewGroup.LayoutParams(
                                    ViewGroup.LayoutParams.MATCH_PARENT,
                                    height
                                )
                            }
                        }
                    }
                }
            },
            update = { webView ->
                webView.loadDataWithBaseURL(
                    null,
                    katexTemplate,
                    "text/html",
                    "UTF-8",
                    null
                )
            },
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun DisplayModeLaTeXWebView(
    latex: String,
    modifier: Modifier = Modifier,
    fontSize: Int = 16
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    
    // KaTeX HTML template for display mode (block equations)
    val katexTemplate = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
            <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
            <style>
                body {
                    margin: 0;
                    padding: 8px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: ${fontSize}px;
                    color: #000000;
                    background-color: transparent;
                    text-align: center;
                }
                .katex {
                    font-size: ${fontSize}px;
                }
                .katex-display {
                    margin: 0;
                }
            </style>
        </head>
        <body>
            <div id="math"></div>
            <script>
                try {
                    katex.render(`$$latex$$`, document.getElementById('math'), {
                        throwOnError: false,
                        displayMode: true,
                        output: 'html'
                    });
                } catch (e) {
                    document.getElementById('math').innerHTML = `$$latex$$`;
                }
            </script>
        </body>
        </html>
    """.trimIndent()

    BoxWithConstraints(modifier = modifier) {
        AndroidView(
            factory = { ctx ->
                WebView(ctx).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    
                    webViewClient = object : WebViewClient() {
                        override fun onPageFinished(view: WebView?, url: String?) {
                            // Auto-resize based on content
                            view?.post {
                                val maxWidthPx = with(density) { maxWidth.toPx() }.toInt()
                                view.measure(
                                    View.MeasureSpec.makeMeasureSpec(
                                        maxWidthPx - 32, // Account for padding
                                        View.MeasureSpec.AT_MOST
                                    ),
                                    View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
                                )
                                val height = view.measuredHeight
                                layoutParams = ViewGroup.LayoutParams(
                                    ViewGroup.LayoutParams.MATCH_PARENT,
                                    height
                                )
                            }
                        }
                    }
                }
            },
            update = { webView ->
                webView.loadDataWithBaseURL(
                    null,
                    katexTemplate,
                    "text/html",
                    "UTF-8",
                    null
                )
            },
            modifier = Modifier.fillMaxWidth()
        )
    }
}
