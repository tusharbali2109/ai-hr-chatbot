<?php

class AIClient {

public function parseResume($filePath){

    $text = file_get_contents($filePath);

    return [
        "name" => $this->extractName($text),
        "email" => $this->extractEmail($text),
        "phone" => $this->extractPhone($text),
        "skills" => $this->extractSkills($text),
        "experience" => $this->extractExperience($text),
        "education" => $this->extractEducation($text)
    ];
}

    private function extractName($text){
        preg_match('/Name[:\s]+([A-Za-z ]+)/i', $text, $m);
        return $m[1] ?? 'Candidate';
    }

    private function extractEmail($text){
        // Match common email patterns
        preg_match('/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i', $text, $m);
        return $m[1] ?? '';
    }

    private function extractPhone($text){
        // Match common phone patterns (basic)
        preg_match('/(\d{10}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\+\d{1,3}[-.\s]?\d{1,14})/i', $text, $m);
        return $m[1] ?? '';
    }

    private function extractSkills($text){
        $skillList = ['PHP','JavaScript','Python','Laravel','Yii','MySQL','React','Node','HTML','CSS','Java','C++','API','Git','Docker'];
        $found = [];
        foreach($skillList as $s){
            if (stripos($text, $s) !== false) $found[] = $s;
        }
        return $found ?: ['General Programming'];
    }

    private function extractExperience($text){
        preg_match('/(\d+)\s+years?/i', $text, $m);
        return $m[0] ?? 'Fresher';
    }

    private function extractEducation($text){
        preg_match('/(B\.?Tech|M\.?Tech|BCA|MCA|B\.?Sc|M\.?Sc)/i', $text, $m);
        return $m[1] ?? 'Not specified';
    }

    // Generate smart questions based on resume
  public function generateQuestions($profile){

    $skills = array_map('strtolower', $profile['skills'] ?? []);
    $questions = [];

    // HR warm-up
    $questions[] = "Please introduce yourself briefly.";
    $questions[] = "Explain your recent project and your role in it.";

    /* ===== ROLE BASED QUESTIONS ===== */

    if(in_array('php', $skills)){
        $questions = array_merge($questions,[
            "Explain OOP concepts in PHP.",
            "Difference between include, require, include_once, require_once?",
            "Explain MVC architecture in PHP frameworks.",
            "How do you create REST APIs in PHP?",
            "How do you optimize MySQL queries in PHP?"
        ]);
    }

    if(in_array('react', $skills)){
        $questions = array_merge($questions,[
            "What is virtual DOM in React?",
            "Explain useState and useEffect hooks.",
            "Difference between props and state.",
            "How does Redux work?",
            "How do you optimize React performance?"
        ]);
    }

    if(in_array('node', $skills) || in_array('nodejs', $skills)){
        $questions = array_merge($questions,[
            "Explain event loop in Node.js.",
            "Difference between callbacks, promises and async/await.",
            "How do you secure Node APIs?",
            "Explain Express middleware.",
            "How do you handle file uploads in Node.js?"
        ]);
    }

    if(in_array('python', $skills)){
        $questions = array_merge($questions,[
            "Explain Python OOP concepts.",
            "Difference between list and tuple.",
            "How does Django framework work?",
            "Explain REST APIs in Python.",
            "What is Pandas used for?"
        ]);
    }

    /* ===== FRESHER / DEFAULT ===== */

    if(empty($skills)){
        $questions = array_merge($questions,[
            "What programming languages do you know?",
            "Explain your final year project.",
            "What is SDLC?",
            "Explain OOP concepts.",
            "What are your career goals?"
        ]);
    }

    /* ===== FINAL HR QUESTIONS ===== */

    $questions = array_merge($questions,[
        "What challenges do you face while working on projects?",
        "How do you handle work pressure?",
        "Where do you see yourself in 3 years?",
        "Why should we hire you?",
        "What motivates you at work?"
    ]);

    // Remove duplicates + ensure minimum 10
    $questions = array_values(array_unique($questions));

    if(count($questions) < 10){
        $fallback = [
            "Explain OOP concepts.",
            "What is MVC architecture?",
            "Explain REST API.",
            "What is version control system?",
            "Explain database normalization."
        ];
        $questions = array_merge($questions,$fallback);
    }

    return array_slice($questions,0,10);
}

    // Evaluate answers and calculate HR score
    public function evaluateAnswers($questions, $answers){

        $score = 0;
        $feedback = [];

        foreach($answers as $i => $ans){

            $len = strlen(trim($ans));

            if ($len > 120) {
                $score += 10;
                $feedback[] = "Answer ".($i+1)." is detailed and clear.";
            } elseif ($len > 50) {
                $score += 7;
                $feedback[] = "Answer ".($i+1)." is acceptable.";
            } else {
                $score += 4;
                $feedback[] = "Answer ".($i+1)." needs more detail.";
            }
        }

        if ($score > 100) $score = 100;

        return "Final HR Score: $score / 100\n\nFeedback:\n".implode("\n",$feedback);
    }
}