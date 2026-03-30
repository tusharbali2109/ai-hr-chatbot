<?php
require_once "../lib/DB.php";
$db = DB::connect();

$interview_id = $_GET['interview_id'];

$stmt = $db->prepare("SELECT id,question FROM interview_questions WHERE interview_id=? AND answer IS NULL LIMIT 1");
$stmt->execute([$interview_id]);
$q = $stmt->fetch(PDO::FETCH_ASSOC);

echo json_encode($q ?: ["completed"=>true]);