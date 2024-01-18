const { default: algolia } = require('algoliasearch');
const { getFirestore, AggregateField } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

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

const { ALGOLIA_ID, ALGOLIA_KEY } = process.env;
const algoliaClient = algolia(ALGOLIA_ID, ALGOLIA_KEY);
const businessIndex = algoliaClient.initIndex('business-index');
const updateType = ['added', 'modified'];

module.exports = {
	onBusinessData: async (snapshot) => {
		try {
			const firestore = getFirestore();
			const businesses = firestore.collection('businesses');
			const batch = firestore.batch();
			const changes = snapshot.docChanges();
			server.log.info(`Received ${changes.length} businesses data`);

			const toUpdate = [];
			const toDelete = [];

			for (const change of changes) {
				if (updateType.includes(change.type)) {
					const business = change.doc.data();
					business.products.sort((a, b) => a.price - b.price);
					business.priceRange = business.products.length
						? {
								lowerBound: business.products.at(0).price,
								upperBound: business.products.at(-1).price
							}
						: null;

					batch.update(businesses.doc(change.doc.id), {
						priceRange: business.priceRange,
						products: business.products
					});
					toUpdate.push(formatData(business));
				} else toDelete.push(change.doc.id);
			}

			if (toUpdate.length) await businessIndex.saveObjects(toUpdate);
			if (toDelete.length) await businessIndex.deleteObjects(toDelete);

			await server.temp.set('last-business', Date.now());
		} catch (error) {
			server.log.error(error);
		}
	},
	onSubmissionData: async (snapshot) => {
		try {
			const userCollection = getFirestore().collection('users');
			const changes = snapshot.docChanges();
			const messaging = getMessaging();

			server.log.info(`Received ${changes.length} submission data`);

			for (const change of changes) {
				if (change.type !== 'modified') continue;

				const { id, userId, status } = change.doc.data();
				const { fcmToken } = await userCollection.doc(userId).get();

				if (!fcmToken) continue;

				messaging.send({
					notification: {
						title: 'Submission status update',
						body:
							'Your submission just got ' +
							(status === 'approved' ? 'approved!' : 'rejected.')
					},
					data: { submissionId: id },
					token: fcmToken
				});
			}

			await server.temp.set('last-submission', Date.now());
		} catch (error) {
			server.log.error(error);
		}
	},
	onReviewsData: async (snapshot) => {
		try {
			const firestore = getFirestore();
			const reviewsCollection = firestore.collection('reviews');
			const businessCollection = firestore.collection('businesses');
			const batch = firestore.batch();
			const changes = snapshot.docChanges();

			server.log.info(`Received ${changes.length} reviews data`);
			const updatedBusinesses = [];

			for (const change of changes) {
				const { businessId } = change.doc.data();
				if (updatedBusinesses.includes(businessId)) continue;

				const snapshot = await reviewsCollection
					.where('businessId', '==', businessId)
					.aggregate({
						rating: AggregateField.average('rating'),
						ratedBy: AggregateField.count()
					})
					.get();
				const { rating, ratedBy } = snapshot.data();

				batch.update(businessCollection.doc(businessId), {
					rating,
					ratedBy
				});
			}

			await batch.commit();
			await server.temp.set('last-reviews', Date.now());
		} catch (error) {
			server.log.error(error);
		}
	},
	onMissionData: async (snapshot) => {
		try {
			const firestore = getFirestore();
			const missionsCollection = firestore.collection('missions');
			const changes = snapshot.docChanges();

			server.log.info(`Received ${changes.length} reviews data`);
			const updatedBusinesses = [];
			const toUpdate = [];

			for (const change of changes) {
				const { businessId, finishedCount, maxQuota } = change.doc.data();
				if (
					updatedBusinesses.includes(businessId) ||
					(change.type === 'modified' && finishedCount <= maxQuota)
				)
					continue;

				const snapshot = await missionsCollection
					.where('businessId', '==', businessId)
					.count()
					.get();
				const { count } = snapshot.data();

				toUpdate.push({
					objectID: businessId,
					haveMission: count > 0
				});
			}

			if (toUpdate.length) await businessIndex.partialUpdateObjects(toUpdate);
			await server.temp.set('last-missions', Date.now());
		} catch (error) {
			server.log.error(error);
		}
	}
};
