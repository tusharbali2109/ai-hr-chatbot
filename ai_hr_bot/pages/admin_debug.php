<?php
require_once __DIR__ . '/../lib/DB.php';
header('Content-Type: text/html; charset=utf-8');

function h($s){ return htmlspecialchars($s); }

echo '<!doctype html><html><head><meta charset="utf-8"><title>Admin Debug</title>';
echo '<style>body{font-family:Segoe UI,Arial;background:#0f1724;color:#e6eef8;padding:18px}a{color:#6ee7b7}pre{background:#071428;padding:12px;border-radius:6px;overflow:auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #223; padding:8px;text-align:left} .col{display:inline-block;vertical-align:top;margin-right:16px}</style>';
echo '</head><body>';
echo '<h1>Admin Debug</h1>';

$log = __DIR__ . '/../api/upload_debug.log';
// clear log if requested
if(isset($_GET['clear_log']) && $_GET['clear_log']=='1'){
    if(file_exists($log)) file_put_contents($log, "");
    echo '<p style="color:#9ae6b4">Log cleared.</p>';
}

echo '<div class="col" style="width:48%">';
if(file_exists($log)){
    echo '<h2>upload_debug.log</h2>';
    echo '<p><a href="?clear_log=1">Clear log</a> | <a href="../api/upload_debug.log" download>Download</a></p>';
    $lines = file($log);
    echo '<pre>' . h(implode("\n", array_slice($lines, -500))) . '</pre>';
} else {
    echo '<h2>upload_debug.log</h2><p><em>No upload_debug.log found.</em></p>';
}
echo '</div>';

echo '<div class="col" style="width:48%">';
echo '<h2>Uploads folder</h2>';
$uploads = __DIR__ . '/../uploads/';
if(is_dir($uploads)){
    $files = array_reverse(scandir($uploads));
    echo '<ul>';
    foreach(array_slice($files,0,200) as $f){ if($f=='.' || $f=='..') continue; $p = $uploads.$f; $size = is_file($p)? filesize($p).' bytes':'dir'; $url = '../uploads/'.rawurlencode($f); echo '<li><a href="'.h($url).'" target="_blank">'.h($f).'</a> — '.h($size).'</li>'; }
    echo '</ul>';
} else {
    echo '<p><em>Uploads folder missing: '.h($uploads).'</em></p>';
}
echo '</div>';

echo '<div style="clear:both;margin-top:18px"></div>';

echo '<h2>Candidates table</h2>';
try{
    $db = DB::connect();
    // show create table
    $row = $db->query("SHOW CREATE TABLE candidates")->fetch(PDO::FETCH_ASSOC);
    if($row){
        $create = $row['Create Table'] ?? array_values($row)[1] ?? '';
        echo '<h3>CREATE TABLE</h3><pre>'.h($create).'</pre>';
    }
    // count and latest
    $count = $db->query('SELECT COUNT(*) FROM candidates')->fetchColumn();
    echo '<p>Rows: '.(int)$count.'</p>';
    $stmt = $db->query('SELECT id,name,email,resume_file,resume_hash,created_at FROM candidates ORDER BY id DESC LIMIT 50');
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if(!$rows){ echo '<p><em>No rows in candidates table.</em></p>'; }
    else{
        echo '<table><tr><th>id</th><th>name</th><th>email</th><th>hash</th><th>resume_file</th><th>created_at</th></tr>';
        foreach($rows as $r){ echo '<tr><td>'.h($r['id']).'</td><td>'.h($r['name']).'</td><td>'.h($r['email']).'</td><td>'.h($r['resume_hash']).'</td><td>'.h($r['resume_file']).'</td><td>'.h($r['created_at']).'</td></tr>'; }
        echo '</table>';
    }
}catch(Exception $e){ echo '<p><em>DB error: '.h($e->getMessage()).'</em></p>'; }

echo '<p><a href="index.html">Back to upload</a></p>';
echo '</body></html>';

?>
