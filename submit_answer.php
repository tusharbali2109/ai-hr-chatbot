<?php
require_once "../lib/DB.php";

$db = DB::connect();

$data = json_decode(file_get_contents("php://input"),true);

$stmt = $db->prepare("UPDATE interviews SET answers=? WHERE candidate_id=?");
$stmt->execute([json_encode($data['answers']),$data['cid']]);

echo json_encode(["status"=>"saved"]);