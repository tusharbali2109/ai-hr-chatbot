<?php
require_once "../lib/DB.php";

header('Content-Type: application/json; charset=utf-8');

$cid = isset($_GET['cid']) ? (int)$_GET['cid'] : 0;
if($cid <= 0){
    http_response_code(400);
    echo json_encode(["error"=>"missing_candidate_id"]);
    exit;
}

try{
    $db = DB::connect();
    
    // Fetch candidate profile to determine experience
    $stmt = $db->prepare("SELECT resume_json FROM candidates WHERE id = ?");
    $stmt->execute([$cid]);
    $profile = $stmt->fetchColumn();
    $profileData = json_decode($profile, true) ?: [];
    
    // Extract years of experience (default 0-2 if not found)
    $experience = $profileData['experience'] ?? 0;
    $experience = intval($experience);
    
    // Determine experience bracket and load appropriate questions
    if($experience < 2){
        $bracket = '0-2';
        $questions = [
            "Tell me about your first project experience and what you learned.",
            "What programming languages are you most comfortable with and why?",
            "Describe a technical challenge you faced and how you solved it.",
            "How do you approach learning new technologies or frameworks?",
            "Tell me about your current role and key responsibilities.",
            "What testing practices do you follow in your development workflow?",
            "How do you handle debugging and troubleshooting issues?",
            "Describe your experience with version control and Git.",
            "What is your approach to writing clean, maintainable code?",
            "Where do you see your career in the next 2-3 years in tech?"
        ];
    } elseif($experience < 4){
        $bracket = '2-4';
        $questions = [
            "Walk me through your most significant project from conception to deployment.",
            "Tell me about a time you optimized code or improved system performance.",
            "Describe your experience with system design and architecture decisions.",
            "How do you mentor junior developers or contribute to team knowledge?",
            "Tell me about your experience with databases and query optimization.",
            "Describe a situation where you had to work with legacy code. How did you handle it?",
            "What is your approach to API design and REST principles?",
            "Tell me about your CI/CD pipeline experience.",
            "Describe a technical disagreement you had with a teammate and how you resolved it.",
            "How do you balance technical excellence with business requirements?"
        ];
    } elseif($experience < 6){
        $bracket = '4-6';
        $questions = [
            "Tell me about your role in a major system redesign or migration project.",
            "How do you approach system scalability and handling high traffic?",
            "Describe your experience leading a technical team or mentoring multiple developers.",
            "Tell me about your experience with microservices architecture.",
            "How do you approach technical decision-making in a complex codebase?",
            "Describe your experience with cloud platforms and infrastructure (AWS, GCP, Azure).",
            "Tell me about a time you had to refactor a critical system. What was your approach?",
            "How do you balance innovation with stability in production systems?",
            "Tell me about your experience with security best practices and threat prevention.",
            "What metrics do you use to evaluate code quality and system health?"
        ];
    } elseif($experience < 8){
        $bracket = '6-8';
        $questions = [
            "Tell me about your approach to evolving technical strategy for a team or organization.",
            "Describe your experience architecting solutions for scalable, distributed systems.",
            "How do you mentor senior engineers and drive technical excellence?",
            "Tell me about your experience with system resilience, redundancy, and disaster recovery.",
            "Describe a technical decision you made that had significant business impact.",
            "How do you approach evaluating and adopting new technologies?",
            "Tell me about your experience with performance optimization at scale.",
            "Describe your approach to building high-performing, collaborative engineering teams.",
            "What is your experience with data-driven decision-making in engineering?",
            "Tell me about your vision for the future of technology in your field and how you contribute to it."
        ];
    } else {
        $bracket = '8-10';
        $questions = [
            "Tell me about your approach to setting and executing on a multi-year technical vision.",
            "Describe your experience architecting solutions at extreme scale (millions of users/requests).",
            "How do you balance innovation, technical debt, and organizational priorities?",
            "Tell me about your experience building and scaling engineering organizations.",
            "Describe a major technical challenge you solved that had significant industry or company-wide impact.",
            "How do you approach emerging technologies and their potential impact on your business?",
            "Tell me about your experience with system design trade-offs and their long-term implications.",
            "Describe your approach to fostering a culture of technical excellence and continuous learning.",
            "What is your experience with open-source contributions or industry thought leadership?",
            "Tell me about your vision for the next generation of technologies and how you are shaping them."
        ];
    }
    
    echo json_encode([
        'candidate_id' => $cid,
        'experience_bracket' => $bracket,
        'experience_years' => $experience,
        'questions' => $questions
    ]);
    
}catch(Exception $e){
    http_response_code(500);
    echo json_encode(["error"=>"server_error","message"=>$e->getMessage()]);
}
