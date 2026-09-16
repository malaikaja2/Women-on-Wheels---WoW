<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/db.php';

admin_require_auth();

function admin_action_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit();
}

function admin_action_input(): array
{
    $raw = file_get_contents('php://input');
    $json = json_decode($raw, true);
    return is_array($json) ? array_merge($_POST, $json) : $_POST;
}

function admin_action_string(array $input, string $key): string
{
    return trim((string)($input[$key] ?? ''));
}

function admin_find_driver_application(string $id, array $input): array
{
    $applicationId = admin_action_string($input, 'application_id');
    foreach (array_filter([$applicationId, $id]) as $candidate) {
        $doc = wow_doc_data('driverApplications', $candidate);
        if ($doc) return ['id' => $candidate, 'data' => $doc];
    }

    $email = strtolower(admin_action_string($input, 'email'));
    foreach (wow_list_collection('driverApplications', 1000) as $application) {
        $matchesUid = in_array($id, [
            (string)($application['driverId'] ?? ''),
            (string)($application['userId'] ?? ''),
            (string)($application['firebaseUid'] ?? ''),
            (string)($application['uid'] ?? ''),
        ], true);
        $matchesEmail = $email !== '' && strtolower((string)($application['email'] ?? '')) === $email;
        if ($matchesUid || $matchesEmail) {
            return ['id' => (string)($application['uid'] ?? $application['applicationId'] ?? ''), 'data' => $application];
        }
    }

    return ['id' => '', 'data' => []];
}

function admin_resolve_driver_target(string $id, array $input): array
{
    $driver = wow_doc_data('drivers', $id) ?: [];
    $application = admin_find_driver_application($id, $input);
    $applicationData = $application['data'];
    $email = strtolower((string)($driver['email'] ?? $applicationData['email'] ?? admin_action_string($input, 'email')));
    if (!$driver && $email !== '') {
        $driver = wow_find_one_by_email('drivers', $email) ?: [];
    }
    $user = [];
    $uid = (string)($driver['uid'] ?? '');
    if ($uid === '') {
        foreach (['driverId', 'userId', 'firebaseUid', 'uid'] as $key) {
            $candidate = (string)($applicationData[$key] ?? '');
            if ($candidate !== '') {
                $uid = $candidate;
                break;
            }
        }
    }
    if ($uid === '' && $email !== '') {
        $user = wow_find_one_by_email('users', $email) ?: [];
        $uid = (string)($user['uid'] ?? '');
    } elseif ($uid !== '') {
        $user = wow_doc_data('users', $uid) ?: [];
    }
    if ($uid === '') $uid = $id;

    return [
        'uid' => $uid,
        'driver' => $driver,
        'application_id' => (string)$application['id'],
        'application' => $applicationData,
        'user' => $user,
    ];
}

function admin_driver_profile_from_application(array $application): array
{
    return array_filter([
        'name' => $application['fullName'] ?? $application['name'] ?? null,
        'fullName' => $application['fullName'] ?? $application['name'] ?? null,
        'email' => $application['email'] ?? null,
        'phone' => $application['phone'] ?? null,
        'gender' => $application['gender'] ?? null,
        'vehicleType' => $application['vehicleType'] ?? null,
        'vehicleNumber' => $application['vehicleNumber'] ?? null,
        'licenseNumber' => $application['licenseNumber'] ?? $application['licenceNumber'] ?? null,
        'licenceNumber' => $application['licenceNumber'] ?? $application['licenseNumber'] ?? null,
        'cnic' => $application['cnicNumber'] ?? $application['cnic'] ?? null,
        'cnicNumber' => $application['cnicNumber'] ?? $application['cnic'] ?? null,
        'cnicUploadUrl' => $application['cnicFileUrl'] ?? $application['cnicUploadUrl'] ?? null,
        'cnicImageUrl' => $application['cnicImageUrl'] ?? $application['cnicFileUrl'] ?? null,
        'cnicFrontUrl' => $application['cnicFrontUrl'] ?? $application['cnicFileUrl'] ?? null,
        'cnicBackUrl' => $application['cnicBackUrl'] ?? null,
        'licenceImageUrl' => $application['licenceImageUrl'] ?? null,
        'profilePhotoUrl' => $application['profilePhotoUrl'] ?? $application['profileImageUrl'] ?? null,
        'cnicFrontPath' => $application['cnicFrontPath'] ?? $application['cnicImagePath'] ?? null,
        'cnicImagePath' => $application['cnicImagePath'] ?? $application['cnicFrontPath'] ?? null,
        'cnicBackPath' => $application['cnicBackPath'] ?? null,
        'licenceImagePath' => $application['licenceImagePath'] ?? $application['licenseImagePath'] ?? null,
        'licenseImagePath' => $application['licenseImagePath'] ?? $application['licenceImagePath'] ?? null,
        'profilePhotoPath' => $application['profilePhotoPath'] ?? $application['profileImagePath'] ?? null,
        'profileImagePath' => $application['profileImagePath'] ?? $application['profilePhotoPath'] ?? null,
        'documentPaths' => is_array($application['documentPaths'] ?? null) ? $application['documentPaths'] : null,
        'documentMetadata' => is_array($application['documentMetadata'] ?? null) ? $application['documentMetadata'] : null,
        'applicationId' => $application['applicationId'] ?? $application['uid'] ?? null,
    ], static fn($value): bool => $value !== null && $value !== '');
}

$input = admin_action_input();
$action = strtolower(admin_action_string($input, 'action'));
$id = admin_action_string($input, 'id');
$admin = $_SESSION['admin_auth'] ?? [];

try {
    if ($action === 'driver_status') {
        $status = strtolower(admin_action_string($input, 'status'));
        if ($id === '' || !in_array($status, ['approved', 'rejected', 'blocked', 'unblocked'], true)) {
            admin_action_json(['ok' => false, 'error' => 'invalid_driver_status_request'], 422);
        }
        $target = admin_resolve_driver_target($id, $input);
        $driverUid = (string)$target['uid'];
        $driver = $target['driver'] ?: [];
        $application = $target['application'] ?: [];
        $applicationId = (string)$target['application_id'];
        $adminUid = (string)($admin['uid'] ?? '');
        $rejectionReason = admin_action_string($input, 'rejection_reason');
        if ($status === 'rejected' && $rejectionReason === '') {
            admin_action_json(['ok' => false, 'error' => 'rejection_reason_required', 'message' => 'A rejection reason is required.'], 422);
        }
        $updates = ['updatedAt' => wow_now(), 'reviewedBy' => $adminUid, 'reviewedByAdminId' => $adminUid];
        if ($status === 'approved') {
            $gender = strtolower((string)($driver['gender'] ?? $application['gender'] ?? ''));
            if ($gender !== 'female') {
                admin_action_json([
                    'ok' => false,
                    'error' => 'female_driver_required',
                    'message' => 'Only female driver applicants can be approved on WomenOnWheels.',
                ], 422);
            }
            $updates = array_merge(admin_driver_profile_from_application($application), $updates, [
                'verificationStatus' => 'approved',
                'isApproved' => true,
                'role' => 'driver',
                'isActive' => true,
                'isBlocked' => false,
                'isAvailable' => false,
                'accountStatus' => 'active', 'isRejected' => false, 'rejectionReason' => '',
                'verificationReviewedAt' => wow_now(),
                'verificationReviewedBy' => $adminUid,
                'verificationRejectionReason' => null,
                'verifiedAt' => wow_now(), 'verifiedBy' => $adminUid,
            ]);
        } elseif ($status === 'rejected') {
            $updates += [
                'verificationStatus' => 'rejected',
                'isApproved' => false,
                'role' => 'driver_applicant',
                'isActive' => false,
                'isOnline' => false,
                'isAvailable' => false,
                'accountStatus' => 'rejected', 'isRejected' => true, 'rejectionReason' => $rejectionReason,
                'verificationReviewedAt' => wow_now(),
                'verificationReviewedBy' => $adminUid,
                'verificationRejectionReason' => $rejectionReason,
                'verifiedAt' => wow_now(), 'verifiedBy' => $adminUid,
            ];
        } elseif ($status === 'blocked') {
            $updates += ['isBlocked' => true, 'isActive' => false, 'isOnline' => false, 'isAvailable' => false];
        } else {
            $isApprovedDriver = strtolower((string)($driver['verificationStatus'] ?? '')) === 'approved'
                && strtolower((string)($driver['role'] ?? '')) === 'driver';
            $updates += [
                'isBlocked' => false,
                'isActive' => $isApprovedDriver,
                'isApproved' => $isApprovedDriver,
                'role' => $isApprovedDriver ? 'driver' : 'driver_applicant',
                'isAvailable' => $isApprovedDriver,
            ];
        }
        error_log('WOW Admin driver update path: drivers/' . $driverUid);
        wow_set_doc('drivers', $driverUid, $updates, true);

        if ($applicationId !== '' && in_array($status, ['approved', 'rejected'], true)) {
            $applicationUpdates = [
                'verificationStatus' => $updates['verificationStatus'] ?? $status,
                'isApproved' => $status === 'approved',
                'role' => $status === 'approved' ? 'driver' : 'driver_applicant',
                'driverId' => $driverUid,
                'reviewedBy' => $adminUid,
                'reviewedByAdminId' => $adminUid,
                'updatedAt' => wow_now(),
                'status' => $status,
                'reviewedAt' => wow_now(),
                'verificationReviewedAt' => wow_now(),
                'verificationReviewedBy' => $adminUid,
                'verificationRejectionReason' => $status === 'rejected' ? $rejectionReason : null,
                'rejectionReason' => $status === 'rejected' ? $rejectionReason : '',
            ];
            if ($status === 'approved') {
                $applicationUpdates['approvedAt'] = wow_now();
                $applicationUpdates['approvedBy'] = $adminUid;
            }
            if ($status === 'rejected') {
                $applicationUpdates['rejectedAt'] = wow_now();
                $applicationUpdates['rejectedBy'] = $adminUid;
            }
            error_log('WOW Admin driver update path: driverApplications/' . $applicationId);
            wow_set_doc('driverApplications', $applicationId, $applicationUpdates, true);
        }

        if (in_array($status, ['approved', 'rejected'], true)) {
            error_log('WOW Admin driver update path: users/' . $driverUid);
            wow_set_doc('users', $driverUid, [
                'role' => $status === 'approved' ? 'driver' : 'driver_applicant',
                'verificationStatus' => $updates['verificationStatus'] ?? $status,
                'isApproved' => $status === 'approved',
                'isRejected' => $status === 'rejected',
                'accountStatus' => $status === 'approved' ? 'active' : 'rejected',
                'verificationReviewedAt' => wow_now(),
                'verificationReviewedBy' => $adminUid,
                'verificationRejectionReason' => $status === 'rejected' ? $rejectionReason : null,
                'rejectionReason' => $status === 'rejected' ? $rejectionReason : '',
                'updatedAt' => wow_now(),
            ], true);
        }

        try {
            $notification = wow_firestore()->collection('notifications')->newDocument();
            $notification->set([
                'targetRole' => 'driver', 'targetUid' => $driverUid, 'driverId' => $driverUid,
                'type' => 'admin_driver_status',
                'title' => $status === 'approved' ? 'Driver application approved' : ($status === 'rejected' ? 'Driver application update' : 'Driver account update'),
                'message' => $status === 'approved' ? 'Your Women on Wheels driver account has been approved.' : ($status === 'rejected' ? 'Your driver application was not approved. ' . $rejectionReason : 'Your driver account status is now ' . $status . '.'),
                'status' => 'Unread', 'isRead' => false, 'createdAt' => wow_now(), 'updatedAt' => wow_now(),
            ]);
        } catch (Throwable $notificationError) {
            error_log('WOW driver status notification failed: ' . $notificationError->getMessage());
        }

        admin_action_json(['ok' => true, 'id' => $driverUid, 'application_id' => $applicationId, 'status' => $status]);
    }

    if ($action === 'driver_document_status') {
        $document = strtolower(admin_action_string($input, 'document'));
        $status = strtolower(admin_action_string($input, 'status'));
        $allowedDocuments = ['cnic_front', 'cnic_back', 'licence', 'vehicle_registration', 'profile_photo'];
        if ($id === '' || !in_array($document, $allowedDocuments, true) || !in_array($status, ['approved', 'rejected', 'pending'], true)) {
            admin_action_json(['ok' => false, 'error' => 'invalid_document_status_request'], 422);
        }
        $driver = wow_doc_data('drivers', $id) ?: [];
        if (!$driver) admin_action_json(['ok' => false, 'error' => 'driver_not_found'], 404);
        $verification = is_array($driver['documentVerification'] ?? null) ? $driver['documentVerification'] : [];
        $verification[$document] = ['status' => $status, 'reviewedBy' => (string)($admin['uid'] ?? ''), 'reviewedAt' => wow_now()];
        wow_set_doc('drivers', $id, ['documentVerification' => $verification, 'updatedAt' => wow_now()], true);
        admin_action_json(['ok' => true, 'id' => $id, 'document' => $document, 'status' => $status]);
    }

    if ($action === 'passenger_status') {
        $status = strtolower(admin_action_string($input, 'status'));
        if ($id === '' || !in_array($status, ['approved', 'rejected', 'blocked', 'unblocked'], true)) {
            admin_action_json(['ok' => false, 'error' => 'invalid_passenger_status_request'], 422);
        }
        $updates = ['updatedAt' => wow_now(), 'reviewedBy' => (string)($admin['uid'] ?? '')];
        if ($status === 'blocked') $updates += ['isBlocked' => true, 'isActive' => false];
        else $updates += ['isBlocked' => false, 'isActive' => true];
        wow_set_doc('passengers', $id, $updates, true);
        admin_action_json(['ok' => true, 'id' => $id, 'status' => $status]);
    }

    if ($action === 'reschedule_ride') {
        $scheduledRaw = admin_action_string($input, 'scheduled_at');
        try { $newTime = new DateTimeImmutable($scheduledRaw); } catch (Throwable) { $newTime = false; }
        if ($id === '' || !$newTime || $newTime <= new DateTimeImmutable('now')) admin_action_json(['ok'=>false,'error'=>'invalid_scheduled_time'],422);
        $ride = wow_doc_data('rides', $id) ?: [];
        if (!$ride) admin_action_json(['ok'=>false,'error'=>'ride_not_found'],404);
        $status = strtolower(trim((string)($ride['status'] ?? '')));
        if (in_array($status,['completed','ride_completed','cancelled','canceled','expired','ride_started','started','in_progress'],true)) admin_action_json(['ok'=>false,'error'=>'ride_cannot_be_rescheduled'],409);
        $oldTime = $ride['scheduledAt'] ?? null;
        $updates = ['scheduledAt'=>new \Google\Cloud\Core\Timestamp($newTime),'scheduledDate'=>$newTime->format('Y-m-d'),'scheduledTime'=>$newTime->format('H:i'),'assignmentStartsAt'=>new \Google\Cloud\Core\Timestamp($newTime->modify('-30 minutes')),'rescheduledAt'=>wow_now(),'previousScheduledAt'=>$oldTime,'updatedAt'=>wow_now(),'isScheduled'=>true];
        wow_set_doc('rides',$id,$updates,true);
        foreach(array_filter([(string)($ride['passengerId']??''),(string)($ride['assignedDriverId']??$ride['driverId']??'')]) as $target){$n=wow_firestore()->collection('notifications')->newDocument();$n->set(['targetUid'=>$target,'type'=>'ride_rescheduled','title'=>'Scheduled ride updated','message'=>'The scheduled pickup time for ride '.(string)($ride['rideCode']??$id).' has been updated.','rideId'=>$id,'read'=>false,'createdAt'=>wow_now()]);}
        admin_action_json(['ok'=>true,'id'=>$id,'scheduled_at'=>$newTime->format(DATE_ATOM)]);
    }

    if ($action === 'ride_status') {
        $status = strtolower(admin_action_string($input, 'status'));
        $allowed = ['pending', 'driver_responded', 'accepted', 'driver_arriving', 'ride_started', 'completed', 'cancelled'];
        if ($id === '' || !in_array($status, $allowed, true)) {
            admin_action_json(['ok' => false, 'error' => 'invalid_ride_status_request'], 422);
        }
        $updates = ['status' => $status, 'updatedAt' => wow_now(), 'adminUpdatedBy' => (string)($admin['uid'] ?? '')];
        if ($status === 'accepted') $updates['acceptedTime'] = wow_now();
        if ($status === 'completed') $updates['completedAt'] = wow_now();
        wow_set_doc('rides', $id, $updates, true);
        admin_action_json(['ok' => true, 'id' => $id, 'status' => $status]);
    }

    if ($action === 'ride_reassign') {
        if ($id === '') admin_action_json(['ok' => false, 'error' => 'ride_required'], 422);
        wow_set_doc('rides', $id, [
            'status' => 'searching',
            'requestStatus' => 'open',
            'driverAssigned' => false,
            'assignmentStatus' => 'searching',
            'assignedDriverId' => null,
            'driverId' => null,
            'driverUid' => null,
            'driverName' => null,
            'driverPhone' => null,
            'driverPhotoURL' => null,
            'assignedAt' => null,
            'adminUpdatedBy' => (string)($admin['uid'] ?? ''),
            'updatedAt' => wow_now(),
        ], true);
        admin_action_json(['ok' => true, 'id' => $id, 'status' => 'searching']);
    }

    if ($action === 'sos_status') {
        $status = strtolower(admin_action_string($input, 'status'));
        if ($id === '' || !in_array($status, ['active', 'responding', 'resolved'], true)) {
            admin_action_json(['ok' => false, 'error' => 'invalid_sos_status_request'], 422);
        }
        wow_set_doc('sosAlerts', $id, [
            'status' => $status,
            'updatedAt' => wow_now(),
            'resolvedAt' => $status === 'resolved' ? wow_now() : null,
            'resolvedBy' => $status === 'resolved' ? (string)($admin['uid'] ?? '') : null,
            'resolved_at' => $status === 'resolved' ? wow_now() : null,
            'resolved_by' => $status === 'resolved' ? (string)($admin['uid'] ?? '') : null,
            'handledBy' => (string)($admin['uid'] ?? ''),
        ], true);
        admin_action_json(['ok' => true, 'id' => $id, 'status' => $status]);
    }

    if ($action === 'send_notification') {
        $title = admin_action_string($input, 'title');
        $message = admin_action_string($input, 'message');
        $targetRole = admin_action_string($input, 'target_role') ?: 'all';
        $targetUid = admin_action_string($input, 'target_uid');
        $notificationType = admin_action_string($input, 'notification_type') ?: 'system';
        if ($title === '' || $message === '') {
            admin_action_json(['ok' => false, 'error' => 'notification_required'], 422);
        }
        if ($targetRole === 'specific' && $targetUid === '') {
            admin_action_json(['ok' => false, 'error' => 'notification_recipient_required', 'message' => 'A specific recipient is required.'], 422);
        }
        $ref = wow_firestore()->collection('notifications')->newDocument();
        $ref->set([
            'title' => $title,
            'message' => $message,
            'targetRole' => $targetRole,
            'targetUid' => $targetUid,
            'userId' => $targetUid,
            'type' => $notificationType,
            'status' => 'Unread',
            'isRead' => false,
            'createdAt' => wow_now(),
            'updatedAt' => wow_now(),
            'createdBy' => (string)($admin['uid'] ?? ''),
        ]);
        admin_action_json(['ok' => true, 'id' => $ref->id()]);
    }

    admin_action_json(['ok' => false, 'error' => 'unknown_action'], 400);
} catch (Throwable $exception) {
    error_log('Admin action failed: ' . $exception->getMessage());
    admin_action_json(['ok' => false, 'error' => 'admin_action_failed'], 500);
}
