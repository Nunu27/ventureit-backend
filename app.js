require('dotenv').config();

global.server = require('fastify')({
	logger: true,
	disableRequestLogging: true
});

const { onBusinessData, onSubmissionData } = require('./modules/listeners');
const { initializeApp, cert, deleteApp } = require('firebase-admin/app');
const { HTTPError, HTTP_STATUS } = require('./modules/utils');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./service-account.json');
const { getContentData } = require('./modules/network');
const tempProvider = require('./modules/temp');

const { PORT = 3000, NODE_ENV } = process.env;
const firebase = initializeApp({
	credential: cert(serviceAccount)
});
const db = getFirestore();

server.temp = tempProvider(db);

server.get('/', () => ({
	success: true,
	message: 'VentureIt BE'
}));
server.post('/get-content', async (req) => {
	const { url } = req.body;

	if (!url) {
		throw new HTTPError(HTTP_STATUS.BAD_REQUEST, 'Missing required argument');
	}

	return {
		success: true,
		data: await getContentData(url)
	};
});
server.setErrorHandler((error, _, res) => {
	if (error instanceof HTTPError) {
		res.code(error.status.code);
		res.send({
			success: false,
			message: error.message || error.status.message
		});
	} else {
		server.log.error(error);

		res.code(500);
		res.send({
			success: false,
			message:
				NODE_ENV === 'development' ? error.toString() : 'Internal Server Error'
		});
	}
});
server.setNotFoundHandler(() => {
	throw new HTTPError(HTTP_STATUS.NOT_FOUND);
});

server.log.info('Starting server');
server.temp.rehydrate().then(async () => {
	server.log.info('Temporary data rehydrated');

	const unsubBusinessListener = db
		.collection('businesses')
		.where('updatedAt', '>', server.temp.get('last-business') || 0)
		.onSnapshot(onBusinessData, server.log.error);
	const unsubSubmissionListener = db
		.collection('submissions')
		.where('updatedAt', '>', server.temp.get('last-submission') || 0)
		.onSnapshot(onSubmissionData, server.log.error);

	process.on('beforeExit', async () => {
		server.log('Shutting down');

		unsubBusinessListener();
		unsubSubmissionListener();

		await db.terminate();
		await deleteApp(firebase);
	});

	server.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
		if (err) {
			server.log.error(err);
			process.exit(1);
		}
	});
});
