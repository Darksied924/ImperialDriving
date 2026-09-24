INSERT INTO courses
  (code, name, description, duration_weeks, theory_hours, practical_hours, total_fee, currency)
VALUES
  ('A', 'Class A — Motorcycle',
        'Ride a motorcycle or scooter.',                                4,  10, 20,  30000.00, 'KES'),
  ('B', 'Class B — Saloon Car / Light Vehicle',
        'Drive a private car up to 3,500 kg.',                          8,  20, 30,  45000.00, 'KES'),
  ('C', 'Class C — Light Truck',
        'Drive light commercial vehicles between 3,500 and 7,500 kg.', 10,  20, 40,  55000.00, 'KES'),
  ('D', 'Class D — PSV (Public Service Vehicle)',
        'Drive matatu, bus, taxi, or other public service vehicle.',   12,  30, 50,  65000.00, 'KES'),
  ('E', 'Class E — Heavy Commercial Vehicle',
        'Drive articulated trucks and heavy commercial vehicles.',     16,  30, 60,  75000.00, 'KES')
ON CONFLICT (code) DO NOTHING;