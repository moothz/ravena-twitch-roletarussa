// npm install @twurple/auth @twurple/api @twurple/chat dotenv
require('dotenv').config();
const { RefreshingAuthProvider, AppTokenAuthProvider } = require('@twurple/auth');
const { ApiClient } = require('@twurple/api');
const { ChatClient } = require('@twurple/chat');
const fs = require('fs');

class TwitchBot {
	constructor() {
		this.currentStreak = {};
		this.rankings = {};
		this.lastPlayer = {};
		this.channels = [];
		this.TIMEOUT_DURATION = parseInt(process.env.TIMEOUT_SECONDS) || 30;
		
		// Load rankings
		try {
			const data = fs.readFileSync('rankings.json', 'utf8');
			this.rankings = JSON.parse(data);
		} catch (err) {
			console.log('[!roletarussa] No rankings found, initializing file.');
			this.saveRankings();
		}
	}

	async initialize(clientId, clientSecret) {
		// Initialize authentication
		const tokenData = this.loadTokenData();
		
		this.authProvider = new RefreshingAuthProvider({
			clientId,
			clientSecret,
			onRefresh: async (userId, newTokenData) => {
				await this.updateTokenData(newTokenData);
			}
		});

		console.log(tokenData);

		if (tokenData) {
			await this.authProvider.addUserForToken(tokenData, ['moothz']);
		} else {
			// If no token data exists, get initial token
			await this.refreshAccessToken(clientId, clientSecret);
		}

		// Initialize API client
		this.apiClient = new ApiClient({ authProvider: this.authProvider });

		// Initialize chat client
		this.chatClient = new ChatClient({
			authProvider: this.authProvider,
			channels: [],
			logger: { minLevel: 'error' }
		});

		// Set up channel monitoring
		this.initializeChannelMonitoring();
		
		// Connect to chat
		await this.chatClient.connect();
		
		// Set up event handlers
		this.setupEventHandlers();
	}

	loadTokenData() {
		try {
			return JSON.parse(fs.readFileSync('.token.json', 'utf8'));
		} catch {
			return null;
		}
	}

	async updateTokenData(tokenData) {
		fs.writeFileSync('.token.json', JSON.stringify(tokenData, null, 2));
	}

 	async refreshAccessToken(clientId, clientSecret) {
        try {
            const response = await fetch('https://id.twitch.tv/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'client_credentials'
                })
            });

            const data = await response.json();

            console.log(`[refreshAccessToken] `, data);
            await this.updateTokenData({
                accessToken: data.access_token,
                refreshToken: null,
                expiresIn: data.expires_in,
                obtainmentTimestamp: Date.now()
            });

            return data.access_token;
        } catch (error) {
            console.error('[!roletarussa] Error refreshing token:', error);
            throw error;
        }
    }


	initializeChannelMonitoring() {
		// Initial channel load
		this.loadChannels();

		// Watch for changes in channels.json
		fs.watch('channels.json', (eventType) => {
			if (eventType === 'change') {
				const newChannels = this.loadChannels();
				this.updateChannelConnections(newChannels);
			}
		});
	}

	loadChannels() {
		try {
			const data = fs.readFileSync('channels.json', 'utf8');
			this.channels = JSON.parse(data);
			return this.channels;
		} catch (err) {
			console.log('[!roletarussa] No channels.json found, creating empty file.');
			this.channels = [];
			fs.writeFileSync('channels.json', JSON.stringify([], null, 2));
			return [];
		}
	}

	async updateChannelConnections(newChannels) {
		const currentChannels = this.chatClient.getChannels();
		
		// Channels to leave
		const channelsToLeave = currentChannels.filter(channel => 
			!newChannels.includes(channel.replace('#', '')));
		
		// Channels to join
		const channelsToJoin = newChannels.filter(channel => 
			!currentChannels.includes('#' + channel));

		// Leave channels
		for (const channel of channelsToLeave) {
			await this.chatClient.part(channel);
			console.log(`[!roletarussa] Left channel: ${channel}`);
		}

		// Join channels
		for (const channel of channelsToJoin) {
			await this.chatClient.join(channel);
			console.log(`[!roletarussa] Joined channel: ${channel}`);
		}
	}

	saveRankings() {
		fs.writeFileSync('rankings.json', JSON.stringify(this.rankings, null, 2));
	}

	getTrophyEmoji(position) {
		switch (position) {
			case 0: return '🏆';
			case 1: return '🥈';
			case 2: return '🥉';
			default: return '🎖️';
		}
	}

	formatRankings() {
		const sortedRankings = Object.entries(this.rankings)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 10);

		return sortedRankings.map(([username, score], index) => 
			`${this.getTrophyEmoji(index)} ${username}: ${score} tries`
		).join(' | ');
	}

	setupEventHandlers() {
		this.chatClient.onMessage(async (channel, user, message, msg) => {
			const command = message.toLowerCase();
			const username = user;
			const channelName = channel.slice(1); // Remove # prefix

			// Initialize user streak if needed
			if (!this.currentStreak[username]) {
				this.currentStreak[username] = 0;
			}

			switch (command) {
				case '!roletarussa':
					// Check if user was the last player in this channel
					if (this.lastPlayer[channelName] === username) {
						this.chatClient.say(channel, `⚠️ @${username}, aguarde outro usuário jogar primeiro!`);
						return;
					}

					const chance = Math.floor(Math.random() * 6);
					
					if (chance === 0) { // Lost
						const finalStreak = this.currentStreak[username];
						
						// Update rankings if needed
						if (!this.rankings[username] || finalStreak > this.rankings[username]) {
							this.rankings[username] = finalStreak;
							this.saveRankings();
						}

						try {
							await this.chatClient.timeout(channel, username, this.TIMEOUT_DURATION, "!roletarussa - Morreu!");
							this.chatClient.say(channel, `💥🔫 *BANG* - *F no chat*. ${finalStreak}`);
						} catch (err) {
							console.error(`[!roletarussa] Error giving timeout to '${username}':`, err);
							this.chatClient.say(channel, `💥🔫 *BANG* - *F no chat*. ${finalStreak} (😤)`);
						}
						
						this.currentStreak[username] = 0;
					} else { // Survived
						this.currentStreak[username]++;
						this.chatClient.say(channel, `💨🔫 click - Tá safe! ${this.currentStreak[username]}`);
					}

					// Update last player
					this.lastPlayer[channelName] = username;
					break;

				case '!roletaranking':
					this.chatClient.say(channel, `🔫 !roletarussa - Top Sobreviventes: ${this.formatRankings()}`);
					break;

				case '!roletareset':
					if (msg.userInfo.isMod || msg.userInfo.isBroadcaster) {
						const finalRankings = this.formatRankings();
						this.chatClient.say(channel, `🔫 !roletarussa - Top Sobreviventes: ${finalRankings}`);
						this.chatClient.say(channel, '🔫 Rankings resetados! 🔄');
						
						this.rankings = {};
						this.currentStreak = {};
						this.lastPlayer = {};
						this.saveRankings();
					} else {
						this.chatClient.say(channel, '⛔ Sem permissão pra resetar! Se aquiete.');
					}
					break;
			}
		});

		this.chatClient.onDisconnect((manually, reason) => {
			console.log(`[!roletarussa] Bot disconnected: ${reason}`);
		});
	}
}

// Error handling
process.on('uncaughtException', (err) => {
	console.error('[!roletarussa] Uncaught Exception:', err);
});

module.exports = TwitchBot;