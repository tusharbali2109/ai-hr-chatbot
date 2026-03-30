<?php
require_once "../lib/GroqAI.php";

$msg = $_POST['msg'];

$ai = new GroqAI();

$prompt = "Reply like HR interviewer: ".$msg;

echo json_encode(["reply"=>$ai->chat($prompt)]);