<?php
header('Content-Type: application/json');
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once "../lib/DB.php";
require_once "../lib/GroqAI.php";

$candidateId = isset($_POST['cid']) ? intval($_POST['cid']) : 0;
$userMessage = isset($_POST['msg']) ? trim($_POST['msg']) : '';

if (!$candidateId || !$userMessage) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing candidate ID or message', 'cid' => $candidateId, 'msg' => strlen($userMessage)]);
    exit;
}

try {
    // Get database connection
    $db = DB::connect();
    if (!$db) {
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed']);
        exit;
    }
    
    // Get candidate resume data
    $candidateStmt = $db->prepare("SELECT id, name, resume_json FROM candidates WHERE id = ?");
    $candidateStmt->execute([$candidateId]);
    $candidate = $candidateStmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$candidate) {
        http_response_code(404);
        echo json_encode(['error' => 'Candidate not found (id: ' . $candidateId . ')']);
        exit;
    }
    
    // Parse resume for context
    $resumeProfile = @json_decode($candidate['resume_json'], true) ?: [];
    $resumeContext = "Candidate: " . ($resumeProfile['name'] ?? $candidate['name'] ?? 'Unknown') . "\n";
    
    if (!empty($resumeProfile['skills'])) {
        $skills = is_array($resumeProfile['skills']) ? implode(", ", $resumeProfile['skills']) : $resumeProfile['skills'];
        $resumeContext .= "Skills: " . $skills . "\n";
    }
    
    if (!empty($resumeProfile['experience'])) {
        $exp = is_array($resumeProfile['experience']) ? implode("; ", $resumeProfile['experience']) : $resumeProfile['experience'];
        $resumeContext .= "Experience: " . $exp . "\n";
    }
    
    // Load conversation history
    $conversationFile = __DIR__ . "/../uploads/chat_" . $candidateId . ".json";
    $conversation = [];
    if (file_exists($conversationFile)) {
        $conversation = @json_decode(file_get_contents($conversationFile), true) ?: [];
    }
    
    // Build full prompt with context and history
    $fullPrompt = "You are a professional HR interviewer. Be conversational, warm, thoughtful.\n";
    $fullPrompt .= "Candidate Info: " . $resumeContext . "\n";
    $fullPrompt .= "Guidelines: Ask about background, skills, achievements, goals. Keep responses 1-3 sentences.\n\n";
    $fullPrompt .= "Interview conversation:\n";
    
    // Add conversation history
    foreach ($conversation as $msg) {
        $role = ($msg['role'] === 'user') ? 'Candidate' : 'Interviewer';
        $fullPrompt .= $role . ": " . $msg['content'] . "\n";
    }
    
    // Add current user message
    $fullPrompt .= "Candidate: " . $userMessage . "\nInterviewer:";
    
    // Get AI response
    $ai = new GroqAI();
    $response = $ai->chat($fullPrompt);
    
    if (is_null($response)) {
        $error = $ai->getLastError() ?? 'Unknown AI error';
        http_response_code(500);
        error_log("AI Chat Failed: " . $error);
        echo json_encode([
            'error' => $error,
            'reply' => 'AI service temporarily unavailable. Error: ' . $error
        ]);
        exit;
    }
    
    if (empty($response)) {
        http_response_code(500);
        echo json_encode(['error' => 'AI returned empty response']);
        exit;
    }
    
    // Store conversation history
    $conversation[] = ['role' => 'user', 'content' => $userMessage];
    $conversation[] = ['role' => 'assistant', 'content' => trim($response)];
    
    // Save conversation
    $uploadsDir = __DIR__ . "/../uploads/";
    if (!is_dir($uploadsDir)) {
        mkdir($uploadsDir, 0755, true);
    }
    
    if (!file_put_contents($conversationFile, json_encode($conversation, JSON_PRETTY_PRINT))) {
        error_log("Failed to write conversation file: " . $conversationFile);
    }
    
    echo json_encode([
        'reply' => trim($response),
        'message_count' => count($conversation) / 2,
        'status' => 'success'
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    error_log("LLM Chat Error: " . $e->getMessage() . "\n" . $e->getTraceAsString());
    echo json_encode([
        'error' => $e->getMessage(),
        'reply' => 'I encountered a technical issue. Please try again.'
    ]);
}
?>
