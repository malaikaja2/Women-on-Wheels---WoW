<?php
function wow_smtp_send_mail($toEmail, $toName, $subject, $htmlBody, &$error = null) {
    $host = WOW_SMTP_HOST;
    $port = WOW_SMTP_PORT;
    $username = WOW_SMTP_USERNAME;
    $password = WOW_SMTP_APP_PASSWORD;
    $fromName = WOW_MAIL_FROM_NAME;

    if ($username === '' || $password === '') {
        $error = 'SMTP credentials are not configured.';
        return false;
    }

    $fp = @fsockopen($host, $port, $errno, $errstr, 20);
    if (!$fp) {
        $error = 'SMTP connection failed: ' . $errstr . ' (' . $errno . ')';
        return false;
    }

    stream_set_timeout($fp, 20);
    if (!wow_smtp_expect($fp, [220], $error)) {
        fclose($fp);
        return false;
    }

    if (!wow_smtp_command($fp, 'EHLO localhost', [250], $error)) {
        fclose($fp);
        return false;
    }
    if (!wow_smtp_command($fp, 'STARTTLS', [220], $error)) {
        fclose($fp);
        return false;
    }

    $cryptoEnabled = @stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
    if ($cryptoEnabled !== true) {
        $error = 'Unable to establish TLS encryption with SMTP server.';
        fclose($fp);
        return false;
    }

    if (!wow_smtp_command($fp, 'EHLO localhost', [250], $error)) {
        fclose($fp);
        return false;
    }
    if (!wow_smtp_command($fp, 'AUTH LOGIN', [334], $error)) {
        fclose($fp);
        return false;
    }
    if (!wow_smtp_command($fp, base64_encode($username), [334], $error)) {
        fclose($fp);
        return false;
    }
    if (!wow_smtp_command($fp, base64_encode($password), [235], $error)) {
        fclose($fp);
        return false;
    }

    if (!wow_smtp_command($fp, 'MAIL FROM:<' . $username . '>', [250], $error)) {
        fclose($fp);
        return false;
    }
    if (!wow_smtp_command($fp, 'RCPT TO:<' . $toEmail . '>', [250, 251], $error)) {
        fclose($fp);
        return false;
    }
    if (!wow_smtp_command($fp, 'DATA', [354], $error)) {
        fclose($fp);
        return false;
    }

    $message = wow_smtp_build_message($username, $fromName, $toEmail, $toName, $subject, $htmlBody);
    $message = preg_replace('/(?m)^\\./', '..', $message);
    fwrite($fp, $message . "\r\n.\r\n");

    if (!wow_smtp_expect($fp, [250], $error)) {
        fclose($fp);
        return false;
    }

    wow_smtp_command($fp, 'QUIT', [221], $error);
    fclose($fp);
    return true;
}

function wow_smtp_build_message($fromEmail, $fromName, $toEmail, $toName, $subject, $htmlBody) {
    $safeFromName = wow_smtp_header_value($fromName);
    $safeToName = wow_smtp_header_value($toName);
    $safeSubject = wow_smtp_header_value($subject);
    $plainText = trim(strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $htmlBody)));

    $headers = [];
    $headers[] = 'From: ' . $safeFromName . ' <' . $fromEmail . '>';
    $headers[] = 'To: ' . $safeToName . ' <' . $toEmail . '>';
    $headers[] = 'Subject: ' . $safeSubject;
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'Content-Type: text/html; charset=UTF-8';
    $headers[] = 'Content-Transfer-Encoding: 8bit';
    $headers[] = 'Date: ' . date(DATE_RFC2822);

    return implode("\r\n", $headers) . "\r\n\r\n" . $htmlBody . "\r\n\r\n" . $plainText;
}

function wow_smtp_header_value($value) {
    return preg_replace('/[\\r\\n]+/', ' ', trim((string)$value));
}

function wow_smtp_command($fp, $command, $expectedCodes, &$error) {
    fwrite($fp, $command . "\r\n");
    return wow_smtp_expect($fp, $expectedCodes, $error);
}

function wow_smtp_expect($fp, $expectedCodes, &$error) {
    $response = wow_smtp_read_response($fp);
    if ($response === '') {
        $error = 'No response from SMTP server.';
        return false;
    }

    $code = (int)substr($response, 0, 3);
    if (!in_array($code, $expectedCodes, true)) {
        $error = 'SMTP error (' . $code . '): ' . trim($response);
        return false;
    }
    return true;
}

function wow_smtp_read_response($fp) {
    $response = '';
    while (!feof($fp)) {
        $line = fgets($fp, 515);
        if ($line === false) {
            break;
        }
        $response .= $line;
        if (strlen($line) >= 4 && $line[3] === ' ') {
            break;
        }
    }
    return $response;
}
?>
