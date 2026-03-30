<?php

class Speech {

    public function textToSpeech($text){
        return "https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=".urlencode($text);
    }

}