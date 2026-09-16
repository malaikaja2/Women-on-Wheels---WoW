<?php
declare(strict_types=1);

/** Shared, side-effect-free normalization for every admin data endpoint. */
function wow_admin_norm($value): string { return strtolower(trim((string)($value ?? ''))); }
function wow_admin_role($value): string {
    return match (wow_admin_norm($value)) {
        'driver' => 'driver', 'admin','administrator','super_admin','owner' => 'admin',
        'passenger','user','rider','customer' => 'passenger', default => 'unknown',
    };
}
function wow_admin_status(string $domain, $value, array $row = []): string {
    $v = str_replace([' ', '-'], '_', wow_admin_norm($value));
    $aliases = [
        'ride' => ['requested'=>'waiting','pending'=>'waiting','searching_driver'=>'waiting','awaiting_driver'=>'waiting','accepted'=>'assigned','driver_assigned'=>'assigned','ride_started'=>'active','in_progress'=>'active','ongoing'=>'active','ride_completed'=>'completed','finished'=>'completed','successful'=>'completed','canceled'=>'cancelled','declined'=>'cancelled'],
        'payment' => ['confirmed'=>'paid','success'=>'paid','successful'=>'paid','completed'=>'paid','awaiting_confirmation'=>'pending','partially_refunded'=>'partially_refunded','reversed'=>'refunded'],
        'driver' => ['verified'=>'approved','active'=>'approved','under_review'=>'pending','submitted'=>'pending','awaiting_verification'=>'pending'],
        'sos' => ['active'=>'new','triggered'=>'new','open'=>'new','unread'=>'new','pending'=>'new','seen'=>'acknowledged','accepted'=>'acknowledged','in_progress'=>'responding','assigned'=>'responding','help_on_the_way'=>'responding','closed'=>'resolved','completed'=>'resolved','safe'=>'resolved','accidental'=>'false_alarm','dismissed'=>'false_alarm'],
        'lost_found' => ['reported'=>'open','driver_notified'=>'open','driver_responded'=>'in_review','found'=>'item_found','return_scheduled'=>'return_arranged','returned'=>'resolved','closed'=>'resolved'],
        'notification' => ['unread'=>'new','seen'=>'read'],
    ];
    if ($domain === 'sos' && (($row['isResolved'] ?? false) === true || !empty($row['resolvedAt']))) return 'resolved';
    return $aliases[$domain][$v] ?? ($v ?: 'unknown');
}
function wow_admin_time($value): ?DateTimeImmutable {
    if ($value instanceof \Google\Cloud\Core\Timestamp) return DateTimeImmutable::createFromInterface($value->get())->setTimezone(new DateTimeZone('Asia/Karachi'));
    if ($value instanceof DateTimeInterface) return DateTimeImmutable::createFromInterface($value)->setTimezone(new DateTimeZone('Asia/Karachi'));
    if (is_numeric($value)) { $n=(float)$value; if($n>20000000000)$n/=1000; try{return(new DateTimeImmutable('@'.(int)$n))->setTimezone(new DateTimeZone('Asia/Karachi'));}catch(Throwable){return null;} }
    if (is_string($value)&&trim($value)!=='') try{return(new DateTimeImmutable($value))->setTimezone(new DateTimeZone('Asia/Karachi'));}catch(Throwable){return null;}
    return null;
}
function wow_admin_time_iso($value): string { $d=wow_admin_time($value); return $d?$d->format(DATE_ATOM):''; }
function wow_admin_amount($value): ?float {
    if (is_string($value)) $value=preg_replace('/[^0-9.\-]/','',$value);
    return is_numeric($value)&&is_finite((float)$value)?round((float)$value,2):null;
}
function wow_admin_business_key(string $domain,array $row): string {
    $fields=match($domain){'ride'=>['rideId','bookingId','requestId','uid'],'payment'=>['paymentId','transactionId','rideId','uid'],'rating'=>['ratingId','reviewId','uid'],'sos'=>['sosId','alertId','uid'],'lost_found'=>['caseId','uid'],'notification'=>['idempotencyKey','notificationId','uid'],default=>['uid','id']};
    foreach($fields as$f){$v=trim((string)($row[$f]??''));if($v!=='')return$v;}return'';
}
function wow_admin_is_explicit_test(array $row): bool {
    return ($row['isTest']??false)===true||($row['isDemo']??false)===true||($row['demo']??false)===true||($row['sample']??false)===true;
}
function wow_admin_safe_error(Throwable $e): array {
    $m=strtolower($e->getMessage());
    if(str_contains($m,'permission'))return['code'=>'permission-denied','message'=>'You do not have permission to access this data.'];
    if(str_contains($m,'index'))return['code'=>'failed-precondition','message'=>'This query requires a Firestore index.'];
    if(str_contains($m,'quota')||str_contains($m,'resource'))return['code'=>'resource-exhausted','message'=>'Firebase usage limit was reached. Try again later.'];
    if(str_contains($m,'network')||str_contains($m,'unavailable'))return['code'=>'unavailable','message'=>'Firebase is temporarily unavailable.'];
    return['code'=>'internal','message'=>'The requested data could not be loaded.'];
}
