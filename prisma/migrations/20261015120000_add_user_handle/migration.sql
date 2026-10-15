-- Стабильный login-handle (ADR-0017 ред.2, путь B): не PII, неизменяем, уникален.
-- Он же — `username` пользователя в Keycloak (резолвится локально, без admin-API).
-- Nullable: строки, созданные до политики, и пользователи, заведённые вне наших sign-up.
ALTER TABLE "user"."users" ADD COLUMN "handle" TEXT;

CREATE UNIQUE INDEX "users_handle_key" ON "user"."users"("handle");
