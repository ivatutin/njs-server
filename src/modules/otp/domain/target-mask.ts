/**
 * Маскирование контактов перенесено в shared (`@shared/domain/target-mask`):
 * те же функции нужны auth-контексту для PII-безопасных алертов смены контакта (ADR-0017).
 */
export { maskEmail, maskPhone } from '@shared/domain/target-mask';

