<?php

class ResumeParser {

    // Convert a resume file to a plain text file and return the txt file path.
    // Uses pure-PHP libraries when available (smalot/pdfparser, phpoffice/phpword).
    // If libraries are not installed, the method will fall back but may return false.
    public static function convertToText($filePath){
        $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $txtFile = $filePath . '.txt';
        $log = __DIR__ . '/../api/upload_debug.log';

        // PDF: try smalot/pdfparser if available
        if($ext === 'pdf'){
            if(class_exists('Smalot\PdfParser\Parser')){
                try{
                    $parser = new \Smalot\PdfParser\Parser();
                    $pdf    = $parser->parseFile($filePath);
                    $text = $pdf->getText();
                    file_put_contents($txtFile, $text);
                    return $txtFile;
                }catch(\Exception $e){
                    file_put_contents($log, date('[Y-m-d H:i:s] ')."pdfparser_failed: " . $e->getMessage() . "\n", FILE_APPEND);
                    return false;
                }
            } else {
                // library not installed
                file_put_contents($log, date('[Y-m-d H:i:s] ')."pdfparser_missing: smalot/pdfparser not installed\n", FILE_APPEND);
                return false;
            }
        }

        // DOCX/DOC: try phpoffice/phpword (reads docx). For older .doc, we fallback.
        if(in_array($ext, ['docx','doc'])){
            if(class_exists('PhpOffice\PhpWord\IOFactory')){
                try{
                    // For docx and doc, attempt to read and extract text
                    $phpWord = \PhpOffice\PhpWord\IOFactory::load($filePath);
                    $text = '';
                    foreach($phpWord->getSections() as $section){
                        $elements = $section->getElements();
                        foreach($elements as $el){
                            if(method_exists($el, 'getText')){
                                $text .= $el->getText() . "\n";
                            }
                        }
                    }
                    if($text===''){
                        // fallback: try saving as HTML then strip tags
                        $objWriter = \PhpOffice\PhpWord\IOFactory::createWriter($phpWord, 'HTML');
                        ob_start(); $objWriter->save('php://output'); $html = ob_get_clean();
                        $text = strip_tags($html);
                    }
                    file_put_contents($txtFile, $text);
                    return $txtFile;
                }catch(\Exception $e){
                    file_put_contents($log, date('[Y-m-d H:i:s] ')."phpword_failed: " . $e->getMessage() . "\n", FILE_APPEND);
                    return false;
                }
            } else {
                file_put_contents($log, date('[Y-m-d H:i:s] ')."phpword_missing: phpoffice/phpword not installed\n", FILE_APPEND);
                return false;
            }
        }

        // If the file is already a text file or unknown extension, return the path
        if(in_array($ext, ['txt','md','text'])){
            return $filePath;
        }

        // not supported
        file_put_contents($log, date('[Y-m-d H:i:s] ')."unsupported_ext: $filePath ext=$ext\n", FILE_APPEND);
        return false;
    }
}