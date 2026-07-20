export interface IdGenerator {
  next(scope: string): string;
}
