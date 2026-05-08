/**
 * Базовый интерфейс для всех use cases.
 * TCommand — входные параметры (Command/Query объект или примитив).
 * TResult — что возвращает (Domain entity, void, примитив).
 */
export interface UseCase<TCommand, TResult> {
  execute(command: TCommand): Promise<TResult>;
}
