<?php
require_once "../lib/DB.php";
require_once "../lib/GroqAI.php";

header('Content-Type: application/json; charset=utf-8');

$cid = isset($_GET['cid']) ? (int)$_GET['cid'] : 0;
if($cid <= 0){
	http_response_code(400);
	echo json_encode(["error"=>"missing_candidate_id"]);
	exit;
}

try{
	$db = DB::connect();
	$ai = new GroqAI();

	$profileStmt = $db->prepare("SELECT resume_json FROM candidates WHERE id = ?");
	$profileStmt->execute([$cid]);
	$profile = $profileStmt->fetchColumn();
	$profileData = json_decode($profile,true) ?: [];

	$role = $profileData['role'] ?? "Software Developer";
	$prompt = "Generate 10 professional technical + HR interview questions for {$role}. Return only JSON array.";

	$questions = $ai->chat($prompt);

	// Ensure the AI returned valid JSON array; if not, fall back to a safe default
	$decoded = json_decode($questions, true);
	if(!is_array($decoded)){
		$decoded = [
			"Tell me about yourself and your background.",
			"Why are you interested in this role as a {$role}?",
			"Describe a challenging project you worked on and how you handled it.",
			"How do you prioritize tasks when you have multiple deadlines?",
			"Give an example of a time you led a team or initiative.",
			"How do you stay current with industry trends and technologies?",
			"Describe a situation where you had to learn something quickly.",
			"How do you handle feedback and criticism?",
			"What are your strengths and areas for improvement?",
			"Where do you see yourself in two years?"
		];
		$questions = json_encode($decoded);
	}

	// Save interview record (questions as JSON)
	$stmt = $db->prepare("INSERT INTO interviews (candidate_id,questions) VALUES (?,?)");
	$stmt->execute([$cid,$questions]);

	echo $questions;

}catch(Exception $e){
	http_response_code(500);
	echo json_encode(["error"=>"server_error","message"=>"Could not generate questions"]);
}