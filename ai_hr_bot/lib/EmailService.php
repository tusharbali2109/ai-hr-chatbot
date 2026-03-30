<?php
require_once __DIR__ . '/../config/email.php';

class EmailService {
    
    /**
     * Send selection/rejection email to candidate
     */
    public static function sendResultEmail($candidateName, $candidateEmail, $isSelected, $score, $maxMarks, $feedback = []) {
        if(!$candidateEmail) {
            return false; // no email to send to
        }
        
        $subject = $isSelected 
            ? "🎉 Congratulations! You have been selected for the next round"
            : "Thank you for your interest in " . COMPANY_NAME;
        
        $htmlBody = $isSelected
            ? self::getSelectedTemplate($candidateName, $score, $maxMarks, $feedback)
            : self::getRejectedTemplate($candidateName, $score, $maxMarks, $feedback);
        
        return self::sendEmail($candidateEmail, $subject, $htmlBody);
    }
    
    /**
     * Generic email sending via SMTP
     */
    private static function sendEmail($to, $subject, $htmlBody) {
        $headers = "MIME-Version: 1.0\r\n";
        $headers .= "Content-type: text/html; charset=UTF-8\r\n";
        $headers .= "From: " . SENDER_NAME . " <" . SENDER_EMAIL . ">\r\n";
        $headers .= "Reply-To: " . SENDER_EMAIL . "\r\n";
        
        // Try native PHP mail() first (simplest); fallback to SMTP if configured differently
        $mailSent = mail($to, $subject, $htmlBody, $headers);
        
        // Optional: Log the email attempt
        $logFile = __DIR__ . '/../api/email_log.txt';
        $logMsg = date('[Y-m-d H:i:s] ') . "To: $to | Subject: $subject | Sent: " . ($mailSent ? 'OK' : 'FAIL') . "\n";
        file_put_contents($logFile, $logMsg, FILE_APPEND);
        
        return $mailSent;
    }
    
    /**
     * HTML template for selected candidates
     */
    private static function getSelectedTemplate($name, $score, $maxMarks, $feedback) {
        $percentage = round(($score / $maxMarks) * 100);
        
        $feedbackHtml = '';
        if(is_array($feedback) && !empty($feedback)) {
            $feedbackHtml = '<h3 style="color:#22c55e">Interview Feedback:</h3>';
            $feedbackHtml .= '<table style="width:100%;border-collapse:collapse;margin:16px 0">';
            foreach($feedback as $idx => $item) {
                $feedbackHtml .= '<tr style="border-bottom:1px solid #ddd">';
                $feedbackHtml .= '<td style="padding:8px"><strong>Q' . ($idx+1) . ':</strong> ' . htmlspecialchars($item['question'] ?? '') . '</td>';
                $feedbackHtml .= '</tr>';
                $feedbackHtml .= '<tr style="border-bottom:1px solid #ddd">';
                $feedbackHtml .= '<td style="padding:8px"><em>Your answer:</em> ' . htmlspecialchars($item['answer'] ?? '') . '</td>';
                $feedbackHtml .= '</tr>';
                $feedbackHtml .= '<tr style="border-bottom:1px solid #ddd;background:#f0f8f0">';
                $feedbackHtml .= '<td style="padding:8px"><strong>Score:</strong> ' . ($item['marks'] ?? 0) . '/2 | ' . htmlspecialchars($item['feedback'] ?? '') . '</td>';
                $feedbackHtml .= '</tr>';
            }
            $feedbackHtml .= '</table>';
        }
        
        return <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .card { background: white; padding: 24px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #22c55e, #16a34a); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .score-box { background: #f0f9ff; border-left: 4px solid #22c55e; padding: 16px; margin: 20px 0; border-radius: 4px; }
        .score-value { font-size: 32px; font-weight: bold; color: #22c55e; }
        .button { display: inline-block; background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
        .footer { text-align: center; color: #999; font-size: 12px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="header">
                <h1>🎉 Congratulations, $name!</h1>
            </div>
            <h2>You have been selected for the next round!</h2>
            <p>Dear $name,</p>
            <p>We are pleased to inform you that you have successfully passed the first round of our AI-powered HR interview process.</p>
            
            <div class="score-box">
                <p style="margin: 0; opacity: 0.8;">Your Interview Score</p>
                <div class="score-value">$score / $maxMarks ($percentage%)</div>
            </div>
            
            $feedbackHtml
            
            <p>Our HR team will review your profile and contact you shortly with details for the next phase of the interview process. Please keep an eye on your inbox.</p>
            
            <p>If you have any questions, feel free to reach out to us.</p>
            
            <a href="https://aihrchatbot.com" class="button">Visit Our Portal</a>
            
            <div class="footer">
                <p>Best regards,<br><strong>HR Team, " . COMPANY_NAME . "</strong></p>
                <p>This is an automated message. Please do not reply to this email.</p>
            </div>
        </div>
    </div>
</body>
</html>
HTML;
    }
    
    /**
     * HTML template for rejected candidates
     */
    private static function getRejectedTemplate($name, $score, $maxMarks, $feedback) {
        $percentage = round(($score / $maxMarks) * 100);
        
        return <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .card { background: white; padding: 24px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #6b7280, #4b5563); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .score-box { background: #fef3f2; border-left: 4px solid #ef4444; padding: 16px; margin: 20px 0; border-radius: 4px; }
        .score-value { font-size: 32px; font-weight: bold; color: #ef4444; }
        .footer { text-align: center; color: #999; font-size: 12px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px; }
        .encourage { background: #f3f4f6; padding: 16px; border-radius: 6px; margin: 16px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="header">
                <h1>Thank you for your interest, $name</h1>
            </div>
            <h2>Update on your application</h2>
            <p>Dear $name,</p>
            <p>Thank you for participating in our AI-powered HR interview process for " . COMPANY_NAME . ". We appreciate the time and effort you invested in this round.</p>
            
            <div class="score-box">
                <p style="margin: 0; opacity: 0.8;">Your Interview Score</p>
                <div class="score-value">$score / $maxMarks ($percentage%)</div>
            </div>
            
            <div class="encourage">
                <p><strong>Feedback:</strong> While you did not advance in this round, we encourage you to apply again in the future. Our AI evaluation looks for specific technical and communication skills that may develop with more experience.</p>
                <p>We wish you the very best in your career journey!</p>
            </div>
            
            <p>If you would like detailed feedback on your performance, please contact our HR team at <strong>careers@company.com</strong>.</p>
            
            <div class="footer">
                <p>Best regards,<br><strong>HR Team, " . COMPANY_NAME . "</strong></p>
                <p>This is an automated message. Please do not reply to this email.</p>
            </div>
        </div>
    </div>
</body>
</html>
HTML;
    }
}
?>
