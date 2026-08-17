<?php
class DB{
    public static function connect(){
        return new PDO("mysql:host=localhost;dbname=ai_hr_bot","root","", [
            PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION
        ]);
    }
}