class AppError extends Error {
    constructor(message, statusCode = 500, details = null) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.details = details;
    }
}

class BadRequestError extends AppError {
    constructor(message, details = null) {
        super(message, 400, details);
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required.') {
        super(message, 401);
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'You do not have access to this resource.') {
        super(message, 403);
    }
}

class NotFoundError extends AppError {
    constructor(message = 'The requested resource was not found.') {
        super(message, 404);
    }
}

class ConflictError extends AppError {
    constructor(message) {
        super(message, 409);
    }
}

module.exports = {
    AppError,
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
};
