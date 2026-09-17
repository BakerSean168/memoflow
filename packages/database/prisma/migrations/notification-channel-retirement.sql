-- N4-2402A / ADR-086: delivery decision + dispatch outbox/receipt are canonical execution truth.
-- ADR-111 permits direct destructive cutover; NotificationChannel aggregate persistence is retired.
DROP TABLE IF EXISTS "notification_channels";
