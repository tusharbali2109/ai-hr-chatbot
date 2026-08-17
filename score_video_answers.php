<?php
require_once "../lib/DB.php";
require_once "../lib/GroqAI.php";
require_once "../lib/EmailService.php";

header('Content-Type: application/json; charset=utf-8');

$cid = isset($_POST['cid']) ? (int)$_POST['cid'] : 0;
$answers = isset($_POST['answers']) ? json_decode($_POST['answers'], true) : [];
$questions = isset($_POST['questions']) ? json_decode($_POST['questions'], true) : [];
$strikes = isset($_POST['strikes']) ? (int)$_POST['strikes'] : 0;
$violations = isset($_POST['violations']) ? $_POST['violations'] : '';

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
    
    $totalScore = 0;
    $feedback = [];
    $maxMarks = count($questions) * 2;

    // Try to init AI, but it's optional
    $ai = null;
    try{
        if(class_exists('GroqAI')){
            $ai = new GroqAI();
        }
    }catch(Exception $e){
        // AI not available, will use fallback scoring
    }

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

    // Deduct marks for policy violations (strikes)
    $strikeDeduction = $strikes * 2; // 2 marks per strike
    $totalScore = max(0, $totalScore - $strikeDeduction);
    
    if($strikes > 0){
        // Parse violation details
        $violationDetails = '';
        if(!empty($violations)) {
            $violationParts = explode('|', $violations);
            $violationMessages = [];
            foreach($violationParts as $v) {
                if(!empty($v)) {
                    $v_parts = explode(':', $v);
                    if(count($v_parts) == 2) {
                        $v_type = $v_parts[0];
                        $v_count = $v_parts[1];
                        $violationMessages[] = "$v_type ($v_count)";
                    }
                }
            }
            
            if(!empty($violationMessages)) {
                $violationDetails = ': ' . implode(', ', $violationMessages);
            }
        }
        
        $feedback[] = [
            'question' => 'Policy Compliance',
            'answer' => "Interview policy violations detected during recording$violationDetails",
            'marks' => -$strikeDeduction,
            'feedback' => "Marks deducted for violating interview policies:\n- Keep your face visible in the frame\n- Do not look away from the camera\n- Do not use external devices\n- Stay on this window throughout the interview\n\nDeduction: $strikeDeduction marks ($strikes violations × 2 marks each)"
        ];
    }

    // STRICT PASS THRESHOLD: 15+ marks required
    $pass = $totalScore >= 15 ? 1 : 0;

    // Save video interview result
    $stmt = $db->prepare("INSERT INTO interview_sessions (candidate_id, round, answers, score) VALUES (?, ?, ?, ?)");
    $stmt->execute([
        $cid,
        2,
        json_encode($answers),
        $totalScore
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
        'round' => 2,
        'total_score' => $totalScore,
        'max_marks' => $maxMarks,
        'pass' => $pass,
        'strikes' => $strikes,
        'strike_deduction' => $strikeDeduction,
        'feedback' => $feedback,
        'email_sent' => !empty($candidateEmail)
    ]);

}catch(Exception $e){
    // If interview_sessions table doesn't exist, still return score
    $pass = $totalScore >= 15 ? 1 : 0;
    if(!empty($candidateEmail)){
        EmailService::sendResultEmail(
            isset($candidateName) ? $candidateName : 'Candidate',
            $candidateEmail,
            (bool)$pass,
            isset($totalScore) ? $totalScore : 0,
            count($questions) * 2,
            isset($feedback) ? $feedback : []
        );
    }
    echo json_encode([
        'candidate_id' => $cid,
        'round' => 2,
        'total_score' => isset($totalScore) ? $totalScore : 0,
        'max_marks' => count($questions) * 2,
        'pass' => isset($pass) ? $pass : 0,
        'strikes' => $strikes,
        'strike_deduction' => isset($strikeDeduction) ? $strikeDeduction : 0,
        'feedback' => isset($feedback) ? $feedback : [],
        'email_sent' => !empty($candidateEmail)
    ]);
}
