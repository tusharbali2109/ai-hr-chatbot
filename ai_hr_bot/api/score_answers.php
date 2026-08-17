<?php
require_once "../lib/DB.php";
require_once "../lib/GroqAI.php";
require_once "../lib/EmailService.php";

header('Content-Type: application/json; charset=utf-8');

$cid = isset($_POST['cid']) ? (int)$_POST['cid'] : 0;
$answers = isset($_POST['answers']) ? json_decode($_POST['answers'], true) : [];
$questions = isset($_POST['questions']) ? json_decode($_POST['questions'], true) : [];

if($cid <= 0 || !is_array($answers) || !is_array($questions)){
    http_response_code(400);
    echo json_encode(["error"=>"invalid_input"]);
    exit;
}

try{
    $db = DB::connect();
    
    // Fetch candidate details including email
    $candStmt = $db->prepare("SELECT name, email FROM candidates WHERE id = ?");
    $candStmt->execute([$cid]);
    $candidateData = $candStmt->fetch(PDO::FETCH_ASSOC);
    $candidateName = $candidateData['name'] ?? 'Candidate';
    $candidateEmail = $candidateData['email'] ?? '';
    
    // Try to init AI, but it's optional
    $ai = null;
    try{
        if(class_exists('GroqAI')){
            $ai = new GroqAI();
        }
    }catch(Exception $e){
        // AI not available, will use fallback scoring
    }

    $totalScore = 0;
    $feedback = [];
    $maxMarks = count($questions) * 2; // 2 marks per question

    // Check if AI is available
    $useAI = ($ai !== null);

    // Score each answer with AI (must be proper evaluation, not just length-based)
    foreach($questions as $idx => $answer){
        $answer = $answers[$idx] ?? '';
        if(!$answer) $answer = '(No answer provided)';

        if($useAI){
            // AI prompt to score the answer (0-2 marks) - STRICT evaluation
            $scorePrompt = "You are a strict HR interviewer. Rate this interview answer on a scale of 0-2 marks. Only give 2 marks if the answer is excellent and shows deep knowledge. Give 1 mark for acceptable answers. Give 0 for weak/irrelevant answers.\n\nQuestion: {$questions[$idx]}\nAnswer: {$answer}\n\nRespond ONLY with a JSON object like {\"marks\": 1, \"feedback\": \"Your feedback here\"}. Do NOT include markdown or extra text.";
            $scoreResponse = $ai->chat($scorePrompt);
            $scoreData = json_decode($scoreResponse, true);

            if(is_array($scoreData) && isset($scoreData['marks'])){
                $marks = intval($scoreData['marks']);
                $marks = max(0, min(2, $marks)); // clamp to 0-2
                $totalScore += $marks;
                $feedback[] = [
                    'question' => $questions[$idx],
                    'answer' => $answer,
                    'marks' => $marks,
                    'feedback' => $scoreData['feedback'] ?? 'Evaluated by AI.'
                ];
            } else {
                // If AI response is malformed, give 0 (strict)
                $feedback[] = [
                    'question' => $questions[$idx],
                    'answer' => $answer,
                    'marks' => 0,
                    'feedback' => 'Could not evaluate response properly.'
                ];
            }
        } else {
            // STRICT fallback scoring (no copy-paste allowed)
            // If answer is exactly the same as question, give 0
            if(trim(strtolower($answer)) === trim(strtolower($questions[$idx]))){
                $marks = 0;
                $feedbackText = 'Answer cannot be identical to question.';
            } 
            // Check for very short or missing answers
            else if(strlen($answer) < 30){
                $marks = 0;
                $feedbackText = 'Response too brief to be evaluated.';
            } 
            // Check for minimal effort
            else if(strlen($answer) < 100){
                $marks = 1;
                $feedbackText = 'Minimal effort in response.';
            } 
            // Only give 2 marks for longer, quality responses
            else {
                $marks = 2;
                $feedbackText = 'Good detailed response.';
            }
            $totalScore += $marks;
            $feedback[] = [
                'question' => $questions[$idx],
                'answer' => $answer,
                'marks' => $marks,
                'feedback' => $feedbackText
            ];
        }
    }

    // STRICT PASS THRESHOLD: 15+ marks required (out of 20)
    $pass = $totalScore >= 15 ? 1 : 0;

    // Save interview result to DB
    $stmt = $db->prepare("UPDATE interviews SET answers=?, score=?, pass=? WHERE candidate_id=?");
    $stmt->execute([
        json_encode($answers),
        $totalScore,
        $pass,
        $cid
    ]);

    // Send email to candidate
    if($candidateEmail){
        EmailService::sendResultEmail(
            $candidateName,
            $candidateEmail,
            (bool)$pass,
            $totalScore,
            $maxMarks,
            $feedback
        );
    }

    echo json_encode([
        'candidate_id' => $cid,
        'total_score' => $totalScore,
        'max_marks' => $maxMarks,
        'pass' => $pass,
        'feedback' => $feedback,
        'email_sent' => !empty($candidateEmail)
    ]);

}catch(Exception $e){
    http_response_code(500);
    echo json_encode(["error"=>"server_error","message"=>$e->getMessage()]);
}
