module.exports = (db) => {
	const tempCollection = db.collection('temp');
	const tempData = new Map();

	return {
		rehydrate: async () => {
			const snapshot = await tempCollection.get();

			for (const doc of snapshot.docs) {
				tempData.set(doc.id, doc.data().value);
			}
		},
		get: (key) => tempData.get(key),
		set: async (key, value) => {
			await tempCollection.doc(key).set({ value });
			tempData.set(key, value);
		},
		delete: async (key) => {
			await tempCollection.doc(key).delete();
			tempData.delete(key);
		}
	};
};
