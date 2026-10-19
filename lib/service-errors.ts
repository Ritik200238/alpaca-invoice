/**
 * Service layer generic error base class
 * Uses generics to support different Service error enums
 */
export class ServiceError<TErrorCode extends string = string> extends Error {
  constructor(
    public readonly serviceName: string,
    public readonly code: TErrorCode,
    message: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = `${serviceName}Error`;

    // Maintain correct prototype chain (required by TypeScript)
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Check if this is a specific type of error
   */
  is(code: TErrorCode): boolean {
    return this.code === code;
  }

  /**
   * Check if this is one of multiple error types
   */
  isOneOf(codes: TErrorCode[]): boolean {
    return codes.includes(this.code);
  }

  /**
   * Get the complete error information (for logging)
   */
  toJSON() {
    return {
      service: this.serviceName,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack
    };
  }
}

/**
 * Factory function to create error classes for a specific Service
 */
export function createServiceError<TErrorCode extends string>(
  serviceName: string
) {
  return class extends ServiceError<TErrorCode> {
    constructor(code: TErrorCode, message: string, details?: any) {
      super(serviceName, code, message, details);
    }
  };
}

