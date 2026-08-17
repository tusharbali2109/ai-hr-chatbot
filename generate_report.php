<?php
require_once "../lib/DB.php";
require_once "../lib/AIClient.php";

$db = DB::connect();
$ai = new AIClient();

$cid = $_GET['cid'];

$row = $db->query("SELECT questions,answers FROM interviews WHERE candidate_id=$cid")->fetch(PDO::FETCH_ASSOC);

$report = $ai->evaluateAnswers(
    json_decode($row['questions'],true),
    json_decode($row['answers'],true)
);

$db->prepare("UPDATE interviews SET report=? WHERE candidate_id=?")->execute([$report,$cid]);

echo json_encode(["report"=>$report]);