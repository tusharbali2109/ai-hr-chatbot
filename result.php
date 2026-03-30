<?php
require_once "../lib/DB.php";

$db = DB::connect();

$interview_id = $_GET['interview_id'];

$stmt = $db->prepare("SELECT * FROM interview_questions WHERE interview_id=?");
$stmt->execute([$interview_id]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$total = count($rows);
$answered = 0;

foreach($rows as $r){
    if($r['answer']) $answered++;
}

$score = ($answered/$total)*100;

$db->prepare("UPDATE interviews SET status='completed',score=?,completed_at=NOW() WHERE id=?")
   ->execute([$score,$interview_id]);

echo json_encode([
    "total_questions"=>$total,
    "answered"=>$answered,
    "score"=>$score,
    "details"=>$rows
]);