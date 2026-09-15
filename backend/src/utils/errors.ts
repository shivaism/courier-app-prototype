// Typed error classes used across services so route handlers can map them to
// appropriate HTTP status codes without services knowing about HTTP.

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = "Invalid credentials") {
    super(message);
    this.name = "AuthenticationError";
  }
}
