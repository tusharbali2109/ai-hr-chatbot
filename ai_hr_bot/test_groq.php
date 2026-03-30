<?php
// Quick diagnostic test for Groq API
header('Content-Type: text/plain; charset=utf-8');

require_once "lib/GroqAI.php";

echo "=== Groq AI Diagnostic Test ===\n";
echo "Time: " . date('Y-m-d H:i:s') . "\n\n";

// Test 1: Basic instantiation
echo "Test 1: Instantiating GroqAI...\n";
$ai = new GroqAI();
echo "✓ GroqAI class instantiated\n\n";

// Test 1.5: Get available models
echo "Test 1.5: Fetching available models...\n";
$models = $ai->getAvailableModels();
if (!empty($models)) {
    echo "✓ Available models:\n";
    foreach ($models as $model) {
        $modelId = $model['id'] ?? 'Unknown';
        echo "  - " . $modelId . "\n";
    }
    echo "\n";
} else {
    echo "✗ No models returned\n\n";
}

// Test 2: Simple chat request
echo "Test 2: Making simple API call...\n";
$testPrompt = "Hello, please respond with the word 'Working' if you can see this.";
$response = $ai->chat($testPrompt);

if ($response) {
    echo "✓ Response received:\n";
    echo "Response: " . $response . "\n\n";
} else {
    echo "✗ No response from AI\n";
    echo "Error: " . $ai->getLastError() . "\n\n";
}

// Test 3: Interview scenario
echo "Test 3: Making interview API call...\n";
$interviewPrompt = "You are an HR interviewer. Ask a brief question about someone's software development experience.";
$response2 = $ai->chat($interviewPrompt);

if ($response2) {
    echo "✓ Interview response received:\n";
    echo "Response: " . $response2 . "\n\n";
} else {
    echo "✗ No response from AI\n";
    echo "Error: " . $ai->getLastError() . "\n\n";
}

echo "=== Diagnostic Complete ===\n";
echo "Check /api/upload_debug.log for detailed error logs\n";
?>
