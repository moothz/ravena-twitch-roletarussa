require('dotenv').config();
const TwitchBot = require('./bot.js');

async function main() {
	const bot = new TwitchBot();
	
	try {
		await bot.initialize(
			process.env.CLIENT_ID,
			process.env.CLIENT_SECRET
		);
		console.log('[!roletarussa] Bot initialized successfully');
	} catch (error) {
		console.error('[!roletarussa] Failed to initialize bot:', error);
		process.exit(1);
	}
}

main();