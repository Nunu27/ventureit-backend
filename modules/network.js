const { HTTPError, HTTP_STATUS } = require('./utils');
const { default: axios } = require('axios');
const { load } = require('cheerio');
axios.defaults.headers = {
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
};

const contentParser = {
	'www.tiktok.com': async (url) => {
		const splitted = url.split('/');
		if (splitted.length !== 6 || splitted[4] !== 'video') {
			throw new HTTPError(HTTP_STATUS.BAD_REQUEST, 'Not a post');
		}

		const { data } = await axios.get(url);
		const $ = load(data);

		const tiktokData = JSON.parse(
			$('#__UNIVERSAL_DATA_FOR_REHYDRATION__').text()
		);
		const postData =
			tiktokData['__DEFAULT_SCOPE__']['webapp.video-detail'].itemInfo
				.itemStruct;

		return {
			cover: postData.video.cover,
			link: url,
			createdAt: new Date(+postData.createTime * 1000).toLocaleDateString('en')
		};
	},
	'www.instagram.com': async (url) => {
		const splitted = url.split('/');
		if (splitted.length !== 6 || splitted[3] !== 'reel') {
			throw new HTTPError(HTTP_STATUS.BAD_REQUEST, 'Not a reel');
		}

		const { data } = await axios.get(
			`https://www.instagram.com/p/${splitted[4]}?__a=1&__d=dis`,
			{
				headers: {
					cookie: 'ds_user_id=...; sessionid=...;',
					'x-ig-app-id': '93661974...'
				}
			}
		);
		return {
			cover: data.graphql.shortcode_media.display_url,
			link: url,
			createdAt: new Date(
				data.graphql.shortcode_media.taken_at_timestamp * 1000
			).toLocaleDateString('en')
		};
	}
};

module.exports = {
	getContentData: async (url) => {
		const { host } = new URL(url);

		if (host in contentParser) return await contentParser[host](url);
		else throw new HTTPError(HTTP_STATUS.BAD_REQUEST, 'Host not supported');
	}
};
