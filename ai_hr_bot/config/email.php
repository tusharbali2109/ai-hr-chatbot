<?php
// Email/SMTP configuration
// You can change these values or set them from environment variables

define('SMTP_HOST', getenv('SMTP_HOST') ?: 'smtp.gmail.com');
define('SMTP_PORT', getenv('SMTP_PORT') ?: 587);
define('SMTP_USER', getenv('SMTP_USER') ?: 'tusharbali855@gmail.com');
define('SMTP_PASS', getenv('SMTP_PASS') ?: 'hveq pmgb uifn ugkj');
define('SENDER_NAME', getenv('SENDER_NAME') ?: 'AI HR Bot');
define('SENDER_EMAIL', getenv('SENDER_EMAIL') ?: 'no-reply@aihrchatbot.com');
define('COMPANY_NAME', getenv('COMPANY_NAME') ?: 'Tushar Bali Enterprises');
?>
