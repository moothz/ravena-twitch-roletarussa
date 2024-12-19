// npm instlal tmi.js dotenv
require('dotenv').config();
const tmi = require('tmi.js');
const fs = require('fs');

// Configuração
const client = new tmi.Client({
	options: { debug: process.env.DEBUG === 'true' },
	identity: {
		username: process.env.BOT_USERNAME,
		password: process.env.OAUTH_TOKEN
	},
	channels: [process.env.CHANNEL]
});

// Duração do timeout setada no .env
const TIMEOUT_DURATION = parseInt(process.env.TIMEOUT_SECONDS) || 30;

// Auxiliares
let currentStreak = {};
let rankings = {};

// Arquivo dos rankings
try {
	const data = fs.readFileSync('rankings.json', 'utf8');
	rankings = JSON.parse(data);
} catch (err) {
	console.log('[!roletarussa] Sem rankings, inicializando arquivo.');
}

// Guarda base de dados de rankings
function saveRankings() {
	fs.writeFileSync('rankings.json', JSON.stringify(rankings, null, 2));
}

// Emojis pro ranking
function getTrophyEmoji(position) {
	switch (position) {
		case 0: return '🏆';
		case 1: return '🥈';
		case 2: return '🥉';
		default: return '🎖️';
	}
}

// Mensagem do Ranking formatada
function formatRankings() {
	const sortedRankings = Object.entries(rankings)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 10);

	return sortedRankings.map(([username, score], index) => 
		`${getTrophyEmoji(index)} ${username}: ${score} tries`
	).join(' | ');
}

client.connect();

client.on('message', async (channel, tags, message, self) => {
	if (self) return;

	const command = message.toLowerCase();
	const username = tags.username;

	// Inicializa usuário
	if (!currentStreak[username]) {
		currentStreak[username] = 0;
	}

	switch (command) {
		case '!roletarussa':
			const chance = Math.floor(Math.random() * 6);
			
			if (chance === 0) { // Lost
				const finalStreak = currentStreak[username];
				
				// Passou do ranking atual?
				if (!rankings[username] || finalStreak > rankings[username]) {
					rankings[username] = finalStreak;
					saveRankings();
				}

				try {
					// Morreu, tume timeout
					await client.timeout(channel, username, TIMEOUT_DURATION, "!roletarussa - Morreu!");
					client.say(channel, `💥🔫 *BANG* - *F no chat*. ${finalStreak}`);
				} catch (err) {
					console.error(`[!roletarussa] Error dando timeout na pessoa '${username}':`, err);
					client.say(channel, `💥🔫 *BANG* - *F no chat*. ${finalStreak} (😤)`);
				}
				
				currentStreak[username] = 0;
			} else { // deboas
				currentStreak[username]++;
				client.say(channel, `💨🔫 click - Tá safe! ${currentStreak[username]}`);
			}
			break;

		case '!roletaranking':
			client.say(channel, `🔫 !roletarussa - Top Sobreviventes: ${formatRankings()}`);
			break;

		case '!roletareset':
			// Só moderador pode resetar
			if (tags.mod || tags['user-type'] === 'mod' || tags.username === channel.replace('#', '')) {
				const finalRankings = formatRankings();
				client.say(channel, `🔫 !roletarussa - Top Sobreviventes: ${finalRankings}`);
				client.say(channel, '🔫 Rankings resetados! 🔄');
				
				rankings = {};
				currentStreak = {};
				saveRankings();
			} else {
				client.say(channel, '⛔ Sem permissão pra resetar! Se aquiete.');
			}
			break;
	}
});

// Error handling
client.on('disconnected', (reason) => {
	console.log(`[!roletarussa] Bot disconnected: ${reason}`);
});

process.on('uncaughtException', (err) => {
	console.error('[!roletarussa] Uncaught Exception:', err);
});