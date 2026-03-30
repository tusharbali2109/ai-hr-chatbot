<?php
require_once "../lib/GroqAI.php";
require_once "../lib/Speech.php";

$msg = $_POST['msg'];

$ai = new GroqAI();
$speech = new Speech();

$reply = $ai->chat("Reply like HR interviewer: ".$msg);

echo json_encode([
    "text" => $reply,
    "voice" => $speech->textToSpeech($reply)
]);