export abstract class HttpError extends Error {
  abstract readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends HttpError {
  readonly status = 400;
}

export class UnauthorizedError extends HttpError {
  readonly status = 401;
}
