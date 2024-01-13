const { initializeApp, deleteApp, cert } = require('firebase-admin/app');
const { initializeFirestore } = require('firebase-admin/firestore');
const { getDB, getMessageFromError } = require('@modules/utils');
const serviceAccount = require('./service-account.json');
const { default: algolia } = require('algoliasearch');
const tempService = require('@modules/tempService');

const { ALGOLIA_ID, ALGOLIA_KEY } = process.env;

const slug = 'ventureit';
const updateType = ['added', 'modified'];
const formatData = ({
	id,
	name,
	cover,
	rating,
	priceRange,
	category,
	openHours,
	products,
	updatedAt,
	location
}) => ({
	objectID: id,
	name: name,
	cover: cover,
	rating: rating,
	priceRange: priceRange,
	category: category,
	openHours: openHours,
	products: products.map(({ name }) => name),
	updatedAt: updatedAt,
	_geoloc: {
		lat: location.latitude,
		lon: location.longitude
	}
});

module.exports = (server) => {
	const pg = getDB(slug);
	const temp = tempService(pg);

	const algoliaClient = algolia(ALGOLIA_ID, ALGOLIA_KEY);
	const businessIndex = algoliaClient.initIndex('business-index');

	const firebaseClient = initializeApp({
		credential: cert(serviceAccount)
	});
	const firestore = initializeFirestore(firebaseClient);
	let unsub;

	return {
		slug,
		version: '0.0.1',
		routerBuilder: (router) => {
			router.get('/', () => ({ success: true, message: 'VentureIt BackEnd' }));
		},
		afterStart: async () => {
			await temp.rehydrate();

			unsub = firestore
				.collection('businesses')
				.where('updatedAt', '>', temp.get('last-update') || 0)
				.onSnapshot(
					async (snapshot) => {
						try {
							const changes = snapshot.docChanges();

							const toUpdate = [];
							const toDelete = [];

							for (const change of changes) {
								if (updateType.includes(change.type))
									toUpdate.push(formatData(change.doc.data()));
								else toDelete.push(change.doc.id);
							}

							if (toUpdate.length) await businessIndex.saveObjects(toUpdate);
							if (toDelete.length) await businessIndex.deleteObjects(toDelete);

							await temp.set('last-update', Date.now());
						} catch (error) {
							getMessageFromError(server.log, error, 'ventureit', 'listener');
						}
					},
					(error) => {
						getMessageFromError(server.log, error, 'ventureit', 'listener');
					}
				);
		},
		beforeKill: async () => {
			unsub?.();
			await firestore.terminate();
			await deleteApp(firebaseClient);
			await pg.end();
		}
	};
};
