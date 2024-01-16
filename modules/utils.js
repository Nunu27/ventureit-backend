class HTTPError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

module.exports = {
	HTTP_STATUS: {
		BAD_REQUEST: {
			code: 400,
			message: 'Bad Request'
		},
		UNAUTHORIZED: {
			code: 401,
			message: 'Unauthorized'
		},
		FORBIDDEN: {
			code: 403,
			message: 'Forbidden'
		},
		NOT_FOUND: {
			code: 404,
			message: 'Not Found'
		},
		TOO_MANY_REQUESTS: {
			code: 429,
			message: 'Too Many Requests'
		},
		INTERNAL_SERVER: {
			code: 500,
			message: 'Internal Server Error'
		},
		UNAVAILABLE: {
			code: 503,
			message: 'Service Unavailable'
		}
	},
	HTTPError
};
