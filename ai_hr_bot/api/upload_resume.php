<?php
require_once "../lib/DB.php";
require_once "../lib/AIClient.php";
require_once "../lib/ResumeParser.php";

header('Content-Type: application/json; charset=utf-8');

try{
    if(!isset($_FILES['resume'])){
        http_response_code(400);
        echo json_encode(["error"=>"no_file","message"=>"No resume file uploaded"]);
        exit;
    }

    if($_FILES['resume']['error'] !== UPLOAD_ERR_OK){
        http_response_code(400);
        echo json_encode(["error"=>"upload_error","message"=>"File upload error code: ".$_FILES['resume']['error']]);
        exit;
    }

    $db = DB::connect();
    $ai = new AIClient();

    $origName = basename($_FILES['resume']['name']);
    $filename = time().'_'.preg_replace('/[^A-Za-z0-9_.-]/','_', $origName);
    $uploadDir = __DIR__ . '/../uploads/';
    if(!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
    $path = $uploadDir . $filename;

    // compute a hash of the file so we can detect duplicates
    $fileHash = '';

    if(!move_uploaded_file($_FILES['resume']['tmp_name'], $path)){
        file_put_contents(__DIR__ . '/upload_debug.log', date('[Y-m-d H:i:s] ')."move_failed: cannot move to $path\n", FILE_APPEND);
        http_response_code(500);
        echo json_encode(["error"=>"move_failed","message"=>"Failed to move uploaded file"]);
        exit;
    }
    // calculate hash once file is saved
    $fileHash = hash_file('sha256', $path);

    // check for duplicates by hash or email (if available later)
    $dupStmt = $db->prepare("SELECT id FROM candidates WHERE resume_hash = ?");
    $dupStmt->execute([$fileHash]);
    if($dupStmt->fetchColumn()){
        http_response_code(409);
        echo json_encode(["error"=>"duplicate","message"=>"A resume with identical content has already been uploaded"]);
        exit;
    }

    /* AUTO CONVERT ANY FILE → TXT */
    $txtPath = ResumeParser::convertToText($path);
    $log = __DIR__ . '/upload_debug.log';
    $fallbackName = pathinfo($origName, PATHINFO_FILENAME);

    if(!$txtPath || !file_exists($txtPath)){
        file_put_contents($log, date('[Y-m-d H:i:s] ')."conversion_failed: could not convert $filename to text\n", FILE_APPEND);
        // fallback profile when conversion fails: use filename as name
        $profile = [
            'name' => $fallbackName,
            'resume_file' => $filename,
            'conversion_error' => 'failed'
        ];
    } else {
        /* PARSE TEXT RESUME */
        $profile = $ai->parseResume($txtPath);
        if(!is_array($profile) || empty($profile)){
            file_put_contents($log, date('[Y-m-d H:i:s] ')."parse_failed: profile empty for file $filename\n", FILE_APPEND);
            // fallback profile when parse fails
            $profile = [
                'name' => $fallbackName,
                'resume_file' => $filename,
                'parse_error' => 'failed'
            ];
        }
    }

    // if parser returned an email, check for duplicate email too
    $email = isset($profile['email']) ? strtolower(trim($profile['email'])) : null;
    if($email){
        $dupEmail = $db->prepare("SELECT id FROM candidates WHERE LOWER(email) = ?");
        $dupEmail->execute([$email]);
        if($dupEmail->fetchColumn()){
            http_response_code(409);
            echo json_encode(["error"=>"duplicate","message"=>"A candidate with this email already exists"]);
            exit;
        }
    }

    $stmt = $db->prepare("INSERT INTO candidates (name,resume_file,resume_json,resume_hash,email) VALUES (?,?,?,?,?)");
    try{
        $stmt->execute([
            $profile['name'] ?? 'Unknown',
            $filename,
            json_encode($profile),
            $fileHash,
            $email
        ]);
        $lastId = $db->lastInsertId();
        file_put_contents(__DIR__ . '/upload_debug.log', date('[Y-m-d H:i:s] ')."insert_ok: candidate_id=$lastId file=$filename hash=$fileHash email=$email\n", FILE_APPEND);
        echo json_encode(["candidate_id"=>$lastId]);
    }catch(Exception $ex){
        $err = $ex->getMessage();
        file_put_contents(__DIR__ . '/upload_debug.log', date('[Y-m-d H:i:s] ')."insert_failed: $err\n", FILE_APPEND);
        http_response_code(500);
        echo json_encode(["error"=>"db_error","message"=>"Database insert failed"]);
    }

}catch(Exception $e){
    http_response_code(500);
    echo json_encode(["error"=>"server_error","message"=>"Unexpected error: " . $e->getMessage()]);
}