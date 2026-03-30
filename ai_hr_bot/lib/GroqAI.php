<?php

class GroqAI {

    private $apiKey = "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";
    private $apiUrl = "https://api.groq.com/openai/v1/chat/completions";
    private $lastError = null;

    public function chat($prompt){
        $payload = [
            "model" => "llama-3.3-70b-versatile",
            "messages" => [
                ["role"=>"system","content"=>"You are a professional HR interviewer."],
                ["role"=>"user","content"=>$prompt]
            ],
            "temperature" => 0.7,
            "max_tokens" => 500
        ];

        $ch = curl_init($this->apiUrl);
        
        if (!$ch) {
            $this->lastError = "Failed to initialize cURL";
            error_log("GroqAI Error: " . $this->lastError);
            return null;
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_HTTPHEADER => [
                "Content-Type: application/json",
                "Authorization: Bearer ".$this->apiKey
            ],
            CURLOPT_POSTFIELDS => json_encode($payload)
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        
        curl_close($ch);

        // Log raw response for debugging
        error_log("GroqAI Request: " . json_encode($payload));
        error_log("GroqAI Response (HTTP $httpCode): " . substr($response, 0, 500));

        if ($curlError) {
            $this->lastError = "cURL Error: " . $curlError;
            error_log("GroqAI Error: " . $this->lastError);
            return null;
        }

        if (!$response) {
            $this->lastError = "Empty response from API";
            error_log("GroqAI Error: " . $this->lastError);
            return null;
        }

        $data = json_decode($response, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            $this->lastError = "Invalid JSON response: " . json_last_error_msg();
            error_log("GroqAI Error: " . $this->lastError);
            return null;
        }

        // Check for API errors
        if (isset($data['error'])) {
            $this->lastError = "API Error: " . ($data['error']['message'] ?? json_encode($data['error']));
            error_log("GroqAI Error: " . $this->lastError);
            return null;
        }

        if (!isset($data['choices']) || !is_array($data['choices']) || count($data['choices']) === 0) {
            $this->lastError = "No choices in response: " . json_encode($data);
            error_log("GroqAI Error: " . $this->lastError);
            return null;
        }

        $content = $data['choices'][0]['message']['content'] ?? null;

        if (!$content) {
            $this->lastError = "No content in response";
            error_log("GroqAI Error: " . $this->lastError);
            return null;
        }

        return trim($content);
    }

    public function getLastError() {
        return $this->lastError;
    }

    public function getAvailableModels() {
        $ch = curl_init("https://api.groq.com/openai/v1/models");
        
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_HTTPHEADER => [
                "Authorization: Bearer ".$this->apiKey
            ]
        ]);
        
        $response = curl_exec($ch);
        curl_close($ch);
        
        $data = json_decode($response, true);
        return $data['data'] ?? [];
    }
}
?>