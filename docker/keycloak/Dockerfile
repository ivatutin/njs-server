# syntax=docker/dockerfile:1.7

# Оптимизированный образ Keycloak: build step (`kc.sh build`) кэширует
# конфигурацию на этапе сборки образа, поэтому в проде можно запускаться с
# `start --optimized` (см. docker-compose.prod.yml) без сборки на старте.
# Схема — из официального гайда: https://www.keycloak.org/server/containers

# ---- builder: фиксируем build-time опции (health/metrics + вендор БД) ----
FROM quay.io/keycloak/keycloak:26.8.0 AS builder

# Build-time опции: их значения должны совпадать с рантаймом
ENV KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=true \
    KC_DB=postgres

WORKDIR /opt/keycloak
RUN /opt/keycloak/bin/kc.sh build

# ---- runtime: копируем результат build поверх чистого образа ----
FROM quay.io/keycloak/keycloak:26.8.0

COPY --from=builder /opt/keycloak/ /opt/keycloak/

# Рантайм-опции (KC_DB_URL, KC_DB_USERNAME/PASSWORD, bootstrap-админ, heap)
# приходят из docker-compose.yml — в образ не зашиваем
ENV KC_DB=postgres
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
