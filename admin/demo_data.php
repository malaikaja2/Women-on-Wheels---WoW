<?php
declare(strict_types=1);

function wow_admin_demo_now(int $offsetMinutes = 0): string
{
    return date('c', time() - ($offsetMinutes * 60));
}

function wow_admin_demo_passengers(): array
{
    return [
        ['passenger_id' => 'demo-passenger-001', 'uid' => 'demo-passenger-001', 'name' => 'Ayesha Khan', 'email' => 'ayesha.demo@example.com', 'phone' => '+92 300 1112233', 'cnic' => '42101-1234567-1', 'total_rides' => 18, 'rating' => 4.8, 'status' => 'active', 'last_active' => wow_admin_demo_now(12), 'location_hint' => 'Gulshan-e-Iqbal'],
        ['passenger_id' => 'demo-passenger-002', 'uid' => 'demo-passenger-002', 'name' => 'Sara Ahmed', 'email' => 'sara.demo@example.com', 'phone' => '+92 321 5556677', 'cnic' => '42201-7654321-2', 'total_rides' => 9, 'rating' => 4.6, 'status' => 'active', 'last_active' => wow_admin_demo_now(45), 'location_hint' => 'DHA Phase 6'],
        ['passenger_id' => 'demo-passenger-003', 'uid' => 'demo-passenger-003', 'name' => 'Maham Noor', 'email' => 'maham.demo@example.com', 'phone' => '+92 333 2227788', 'cnic' => '42301-2468135-3', 'total_rides' => 3, 'rating' => 4.9, 'status' => 'pending', 'last_active' => wow_admin_demo_now(90), 'location_hint' => 'Clifton'],
        ['passenger_id' => 'demo-passenger-004', 'uid' => 'demo-passenger-004', 'name' => 'Zainab Ali', 'email' => 'zainab.demo@example.com', 'phone' => '+92 345 9876543', 'cnic' => '42401-1357924-4', 'total_rides' => 27, 'rating' => 4.7, 'status' => 'blocked', 'last_active' => wow_admin_demo_now(240), 'location_hint' => 'North Nazimabad'],
    ];
}

function wow_admin_demo_drivers(): array
{
    return [
        ['driver_id' => 'demo-driver-001', 'uid' => 'demo-driver-001', 'name' => 'Hira Noor', 'full_name' => 'Hira Noor', 'email' => 'hira.driver@example.com', 'phone' => '+92 300 4455667', 'gender' => 'female', 'role' => 'driver', 'vehicle_type' => 'WOW Car', 'vehicle_number' => 'KHI-2281', 'license_number' => 'DL-88221', 'cnic' => '42101-1111111-1', 'cnic_upload_url' => '', 'application_id' => 'demo-app-001', 'profile_photo_url' => '', 'cnic_verified' => true, 'vehicle_verified' => true, 'verification_status' => 'approved', 'is_approved' => true, 'status' => 'active', 'rating' => 4.9, 'total_rides' => 142, 'earnings' => 184500, 'application_date' => wow_admin_demo_now(6000), 'last_active' => wow_admin_demo_now(8)],
        ['driver_id' => 'demo-driver-002', 'uid' => 'demo-driver-002', 'name' => 'Noor Fatima', 'full_name' => 'Noor Fatima', 'email' => 'noor.driver@example.com', 'phone' => '+92 321 8877665', 'gender' => 'female', 'role' => 'driver', 'vehicle_type' => 'WOW Bike', 'vehicle_number' => 'WOW-719', 'license_number' => 'DL-44190', 'cnic' => '42201-2222222-2', 'cnic_upload_url' => '', 'application_id' => 'demo-app-002', 'profile_photo_url' => '', 'cnic_verified' => true, 'vehicle_verified' => true, 'verification_status' => 'approved', 'is_approved' => true, 'status' => 'offline', 'rating' => 4.7, 'total_rides' => 96, 'earnings' => 93600, 'application_date' => wow_admin_demo_now(8000), 'last_active' => wow_admin_demo_now(180)],
        ['driver_id' => 'demo-driver-003', 'uid' => 'demo-driver-003', 'name' => 'Mariam Saeed', 'full_name' => 'Mariam Saeed', 'email' => 'mariam.driver@example.com', 'phone' => '+92 333 1122334', 'gender' => 'female', 'role' => 'driver_applicant', 'vehicle_type' => 'WOW Scooty', 'vehicle_number' => 'SCT-404', 'license_number' => 'DL-99001', 'cnic' => '42301-3333333-3', 'cnic_upload_url' => '', 'application_id' => 'demo-app-003', 'profile_photo_url' => '', 'cnic_verified' => true, 'vehicle_verified' => true, 'verification_status' => 'pending', 'is_approved' => false, 'status' => 'pending', 'rating' => null, 'total_rides' => 0, 'earnings' => 0, 'application_date' => wow_admin_demo_now(320), 'last_active' => wow_admin_demo_now(320)],
    ];
}

function wow_admin_demo_rides(): array
{
    return [
        ['id' => 'demo-ride-001', 'ride_code' => 'WOW-240701', 'passenger_name' => 'Ayesha Khan', 'driver_name' => 'Hira Noor', 'pickup' => 'Gulshan-e-Iqbal', 'dropoff' => 'DHA Phase 6', 'vehicle_type' => 'WOW Car', 'distance_km' => 14.8, 'duration_min' => 31, 'passenger_offer' => 720, 'driver_offer' => 760, 'final_fare' => 760, 'fare' => 760, 'payment_method' => 'Easypaisa', 'payment_label' => 'Easypaisa', 'status' => 'completed', 'status_group' => 'completed', 'ride_type' => 'single', 'offer_status' => 'accepted', 'created_at' => wow_admin_demo_now(260), 'accepted_at' => wow_admin_demo_now(252), 'completed_at' => wow_admin_demo_now(220), 'scheduled_at' => ''],
        ['id' => 'demo-ride-002', 'ride_code' => 'WOW-240702', 'passenger_name' => 'Sara Ahmed', 'driver_name' => 'Noor Fatima', 'pickup' => 'Clifton Block 5', 'dropoff' => 'PECHS', 'vehicle_type' => 'WOW Bike', 'distance_km' => 8.2, 'duration_min' => 19, 'passenger_offer' => 360, 'driver_offer' => 380, 'final_fare' => 0, 'fare' => 380, 'payment_method' => 'Cash', 'payment_label' => 'Cash', 'status' => 'accepted', 'status_group' => 'accepted', 'ride_type' => 'single', 'offer_status' => 'accepted', 'created_at' => wow_admin_demo_now(24), 'accepted_at' => wow_admin_demo_now(20), 'completed_at' => '', 'scheduled_at' => ''],
        ['id' => 'demo-ride-003', 'ride_code' => 'WOW-240703', 'passenger_name' => 'Maham Noor', 'driver_name' => 'Unassigned', 'pickup' => 'North Nazimabad', 'dropoff' => 'Jinnah International Airport', 'vehicle_type' => 'WOW Scooty', 'distance_km' => 21.4, 'duration_min' => 44, 'passenger_offer' => 910, 'driver_offer' => 0, 'final_fare' => 0, 'fare' => 910, 'payment_method' => 'JazzCash', 'payment_label' => 'JazzCash', 'status' => 'searching_driver', 'status_group' => 'pending', 'ride_type' => 'single', 'offer_status' => '', 'created_at' => wow_admin_demo_now(6), 'accepted_at' => '', 'completed_at' => '', 'scheduled_at' => ''],
        ['id' => 'demo-ride-004', 'ride_code' => 'WOW-240704', 'passenger_name' => 'Zainab Ali', 'driver_name' => 'Hira Noor', 'pickup' => 'Bahadurabad', 'dropoff' => 'Clifton', 'vehicle_type' => 'WOW Car', 'distance_km' => 10.1, 'duration_min' => 26, 'passenger_offer' => 600, 'driver_offer' => 620, 'final_fare' => 0, 'fare' => 620, 'payment_method' => 'NayaPay', 'payment_label' => 'NayaPay', 'status' => 'cancelled', 'status_group' => 'cancelled', 'ride_type' => 'carpool', 'offer_status' => 'expired', 'created_at' => wow_admin_demo_now(1440), 'accepted_at' => '', 'completed_at' => '', 'scheduled_at' => ''],
    ];
}

function wow_admin_demo_sos_alerts(): array
{
    return [
        ['sos_id' => 'SOS-9001', 'id' => 'demo-sos-001', 'role' => 'passenger', 'ride_id' => 'WOW-240702', 'ride_code' => 'WOW-240702', 'location' => 'Shahrah-e-Faisal near Nursery', 'current_location_text' => 'Shahrah-e-Faisal near Nursery', 'lat' => 24.8731, 'lng' => 67.0642, 'pickup' => 'Clifton Block 5', 'dropoff' => 'PECHS', 'passenger_name' => 'Sara Ahmed', 'passenger_phone' => '+92 321 5556677', 'driver_id' => 'demo-driver-002', 'driver_name' => 'Noor Fatima', 'priority' => 'high', 'status' => 'active', 'resolved_at' => '', 'resolved_by' => '', 'created_at' => wow_admin_demo_now(11), 'reporter_name' => 'Sara Ahmed'],
        ['sos_id' => 'SOS-9002', 'id' => 'demo-sos-002', 'role' => 'driver', 'ride_id' => 'WOW-240701', 'ride_code' => 'WOW-240701', 'location' => 'DHA Phase 6, Karachi', 'current_location_text' => 'DHA Phase 6, Karachi', 'lat' => 24.8146, 'lng' => 67.0438, 'pickup' => 'Gulshan-e-Iqbal', 'dropoff' => 'DHA Phase 6', 'passenger_name' => 'Ayesha Khan', 'passenger_phone' => '+92 300 1112233', 'driver_id' => 'demo-driver-001', 'driver_name' => 'Hira Noor', 'priority' => 'medium', 'status' => 'resolved', 'resolved_at' => wow_admin_demo_now(180), 'resolved_by' => 'Admin', 'created_at' => wow_admin_demo_now(210), 'reporter_name' => 'Hira Noor'],
    ];
}

function wow_admin_demo_payments(): array
{
    return [
        ['transaction_id' => 'PAY-7001', 'ride_code' => 'WOW-240701', 'passenger_name' => 'Ayesha Khan', 'amount' => 760, 'method' => 'Easypaisa', 'status' => 'completed', 'date_time' => wow_admin_demo_now(220)],
        ['transaction_id' => 'PAY-7002', 'ride_code' => 'WOW-240702', 'passenger_name' => 'Sara Ahmed', 'amount' => 380, 'method' => 'Cash', 'status' => 'pending', 'date_time' => wow_admin_demo_now(20)],
        ['transaction_id' => 'PAY-7003', 'ride_code' => 'WOW-240704', 'passenger_name' => 'Zainab Ali', 'amount' => 620, 'method' => 'NayaPay', 'status' => 'refunded', 'date_time' => wow_admin_demo_now(1440)],
    ];
}

function wow_admin_demo_notifications(): array
{
    return [
        ['id' => 'NOT-501', 'notification_id' => 'NOT-501', 'notification_type' => 'SOS', 'type' => 'SOS', 'title' => 'Active SOS Alert', 'message' => 'Passenger reported an emergency near Shahrah-e-Faisal.', 'status' => 'Unread', 'created_at' => wow_admin_demo_now(11), 'related_user' => 'Sara Ahmed', 'ride_id' => 'WOW-240702'],
        ['id' => 'NOT-502', 'notification_id' => 'NOT-502', 'notification_type' => 'Ride', 'type' => 'Ride', 'title' => 'New Ride Request', 'message' => 'Scooty ride request is waiting for driver offers.', 'status' => 'Unread', 'created_at' => wow_admin_demo_now(6), 'related_user' => 'Maham Noor', 'ride_id' => 'WOW-240703'],
        ['id' => 'NOT-503', 'notification_id' => 'NOT-503', 'notification_type' => 'Payment', 'type' => 'Payment', 'title' => 'Payment Completed', 'message' => 'Easypaisa payment completed successfully.', 'status' => 'Read', 'created_at' => wow_admin_demo_now(220), 'related_user' => 'Ayesha Khan', 'ride_id' => 'WOW-240701'],
    ];
}

function wow_admin_demo_weekly_revenue(): array
{
    return [18500, 22400, 19800, 27100, 31200, 26800, 35400];
}

function wow_admin_demo_ai_payload(): array
{
    return [
        'ok' => true,
        'generated_at' => date('c'),
        'demo' => true,
        'summary' => [
            'passengers' => 4,
            'drivers' => 3,
            'rides' => 4,
            'completed_rides' => 1,
            'cancelled_rides' => 1,
            'active_rides' => 1,
            'total_earnings' => 760,
            'daily_earnings' => 760,
            'weekly_earnings' => 1760,
            'monthly_earnings' => 12480,
            'new_passengers' => 2,
            'active_drivers' => 1,
            'busy_drivers' => 1,
            'peak_area' => 'Gulshan-e-Iqbal',
            'peak_area_change' => 12,
            'peak_hour_label' => '6 PM',
            'peak_hour_avg' => 9,
            'driver_efficiency' => 86,
            'safety_score' => 92,
            'most_used_vehicle_type' => 'WOW Car',
            'avg_fare' => 668,
            'avg_passenger_offer' => 648,
            'avg_driver_offer' => 587,
            'carpool_rides' => 1,
            'payment_records' => 3,
        ],
        'safety_incidents' => [
            'sos_triggered' => 2,
            'route_deviation' => 1,
            'speed_violation' => 0,
            'harassment_report' => 0,
        ],
        'distribution' => ['completed' => 1, 'active' => 1, 'pending' => 1, 'cancelled' => 1, 'other' => 0, 'carpool' => 1],
        'ride_demand_chart' => [
            'labels' => ['08', '10', '12', '14', '16', '18', '20'],
            'series' => ['Car' => [3, 5, 4, 6, 9, 12, 7], 'Bike' => [2, 3, 5, 4, 6, 8, 5], 'Scooty' => [1, 2, 3, 5, 7, 9, 6]],
        ],
        'driver_performance_chart' => [
            'labels' => ['Hira', 'Noor', 'Mariam', 'Sana'],
            'values' => [94, 88, 76, 82],
        ],
        'weekly_trend_chart' => [
            'labels' => ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            'rides' => [38, 44, 51, 63],
            'revenue' => [18500, 22400, 27100, 35400],
        ],
        'most_used_areas' => ['Gulshan-e-Iqbal' => 18, 'DHA Phase 6' => 14, 'Clifton' => 12, 'PECHS' => 9],
        'vehicle_usage' => ['WOW Car' => 42, 'WOW Bike' => 31, 'WOW Scooty' => 24],
        'payment_method_usage' => ['Easypaisa' => 38, 'Cash' => 29, 'JazzCash' => 21, 'NayaPay' => 9],
        'passenger_activity' => ['Ayesha' => 18, 'Sara' => 9, 'Maham' => 3],
        'insights' => [
            'Most rides are happening from Gulshan-e-Iqbal area.',
            'Peak booking time is around 6 PM.',
            'WOW Car has the highest current demand.',
            'Average fare is Rs. 668.',
            'SOS response performance is within the current target.',
        ],
    ];
}

function wow_admin_demo_dashboard_payload(): array
{
    $rides = wow_admin_demo_rides();
    $passengers = wow_admin_demo_passengers();
    $drivers = wow_admin_demo_drivers();
    $sos = wow_admin_demo_sos_alerts();
    $payments = wow_admin_demo_payments();
    $ai = wow_admin_demo_ai_payload();
    return [
        'ok' => true,
        'generated_at' => date('c'),
        'demo' => true,
        'stats' => [
            'total_users' => count($passengers),
            'total_drivers' => count($drivers),
            'pending_driver_applications' => 1,
            'total_rides' => count($rides),
            'active_rides' => 1,
            'pending_rides' => 1,
            'accepted_rides' => 1,
            'completed_rides' => 1,
            'cancelled_rides' => 1,
            'today_rides' => 3,
            'scheduled_rides' => 1,
            'carpool_rides' => 1,
            'payment_records' => count($payments),
            'review_records' => 8,
            'sos_alerts' => 1,
            'active_drivers' => 1,
            'earnings' => 1760,
        ],
        'quick_stats' => [
            'avg_ride_duration_min' => 30,
            'avg_fare' => 668,
            'driver_rating_avg' => 4.8,
            'passenger_rating_avg' => 4.7,
            'cancellation_rate' => 25,
            'peak_hours' => '6 PM',
        ],
        'hourly_activity' => array_map(static fn(int $h): array => ['hour' => $h, 'rides' => [0,1,1,2,3,5,7,6,4,2,1,0][$h % 12], 'rides_count' => [0,1,1,2,3,5,7,6,4,2,1,0][$h % 12]], range(0, 23)),
        'recent_rides' => $rides,
        'pending_drivers' => array_values(array_map(static fn(array $d): array => [
            'id' => $d['driver_id'] ?? '',
            'application_id' => $d['application_id'] ?? '',
            'name' => $d['name'] ?? 'Driver',
            'email' => $d['email'] ?? '',
            'phone' => $d['phone'] ?? '',
            'vehicle' => $d['vehicle_type'] ?? 'N/A',
            'status' => $d['verification_status'] ?? 'pending',
            'created_at' => $d['application_date'] ?? wow_admin_demo_now(320),
        ], array_filter($drivers, static fn(array $d): bool => ($d['status'] ?? '') === 'pending'))),
        'sos_alerts' => $sos,
        'analytics' => [
            'top_pickups' => [['label' => 'Gulshan-e-Iqbal', 'count' => 18], ['label' => 'Clifton', 'count' => 12], ['label' => 'DHA Phase 6', 'count' => 10]],
            'top_dropoffs' => [['label' => 'DHA Phase 6', 'count' => 14], ['label' => 'PECHS', 'count' => 9], ['label' => 'Airport', 'count' => 7]],
            'vehicle_usage' => $ai['vehicle_usage'],
            'passenger_growth' => 2,
            'driver_approval_trend' => ['approved' => 2, 'pending' => 1, 'rejected' => 0],
            'recent_sos' => $sos,
            'summary' => ['active_rides' => 1, 'completed_rides' => 1, 'cancelled_rides' => 1, 'peak_hour_label' => '6 PM'],
            'charts' => [
                'ride_requests_by_day' => ['labels' => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], 'values' => [12, 16, 15, 21, 28, 24, 31]],
                'completed_vs_cancelled' => ['labels' => ['Completed', 'Cancelled'], 'values' => [38, 6]],
                'vehicle_type_demand' => ['labels' => ['Car', 'Bike', 'Scooty'], 'values' => [42, 31, 24]],
                'peak_request_hours' => ['labels' => ['8 AM', '11 AM', '2 PM', '5 PM', '8 PM'], 'values' => [6, 9, 13, 22, 16]],
                'pickup_areas' => ['labels' => ['Gulshan', 'Clifton', 'DHA', 'PECHS'], 'values' => [18, 12, 10, 9]],
                'dropoff_areas' => ['labels' => ['DHA', 'PECHS', 'Airport', 'Clifton'], 'values' => [14, 9, 7, 6]],
                'passenger_growth' => ['labels' => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], 'values' => [2, 3, 4, 4, 6, 7, 9]],
                'driver_approval_trend' => ['labels' => ['Approved', 'Pending', 'Rejected'], 'values' => [12, 3, 1]],
                'sos_alerts_trend' => ['labels' => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], 'values' => [0, 1, 0, 1, 2, 0, 1]],
                'revenue_trend' => ['labels' => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], 'values' => wow_admin_demo_weekly_revenue()],
            ],
        ],
        'map_points' => [
            ['type' => 'driver', 'label' => 'Hira Noor', 'status' => 'online', 'lat' => 24.8843, 'lng' => 67.0712],
            ['type' => 'pickup', 'ride_id' => 'demo-ride-003', 'label' => 'North Nazimabad', 'status' => 'searching_driver', 'lat' => 24.9267, 'lng' => 67.0327],
            ['type' => 'dropoff', 'ride_id' => 'demo-ride-003', 'label' => 'Airport', 'status' => 'searching_driver', 'lat' => 24.9065, 'lng' => 67.1608],
        ],
        'map_center' => ['lat' => 24.8607, 'lng' => 67.0011],
    ];
}
