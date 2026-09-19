export type CardErrorCode = 'unsupported' | 'corrupt' | 'not-found' | 'conflict' | 'capacity';

export class CardError extends Error {
  constructor(readonly code: CardErrorCode, message: string) {
    super(message);
    this.name = 'CardError';
  }
}

export function requireValid(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CardError('corrupt', message);
}
