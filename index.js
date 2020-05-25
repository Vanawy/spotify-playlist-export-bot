const { Telegraf } = require('telegraf');
const dotenv = require('dotenv');
const axios = require('axios');
dotenv.config();
const stats = require('telegraf-statsd');

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(stats({
    host: process.env.STATSD_HOST,
    prefix: 'spotify_bot' + process.env.ENV
}));

const helpText = "Just send me link to a public Spotify playlist or album 🎵";

bot.start((ctx) => ctx.reply(helpText));
bot.help((ctx) => ctx.reply(helpText));

bot.on('text', ctx => {
    const text = ctx.update.message.text;
    let url = getUrl(text);
    if (url == false) {
        ctx.reply(helpText);
        return;
    }
    axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            params: {
                grant_type: 'client_credentials',
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + base64(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`),
            }
        })
        .then(function(response) {
            const token = response.data.access_token;
            const type = response.data.token_type;
            const isAlbum = url.pathname.search(/^\/album/) != -1;
            const id = url.pathname.replace(/^\/(album|playlist)\//i, "");
            console.log(`Fetching ${isAlbum ? 'album' : 'playlist'} ${id}`);
            axios
                .get(`https://api.spotify.com/v1/${isAlbum ? 'albums' : 'playlists'}/${id}/tracks`, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `${type} ${token}`,
                    }
                })
                .then(function(response) {
                    let result = [];
                    for (let track of response.data.items) {
                        if (!isAlbum) {
                            track = track.track;
                        }
                        let authors = [];
                        for (let artist of track.artists) {
                            authors.push(artist.name);
                        }
                        result.push([authors, track.name, Math.floor(track.duration_ms / 1000)])
                    }
                    ctx.reply(printResult(result));
                })
                .catch(function(response) {
                    ctx.reply("Spotify returns error")
                    console.error(response);
                });
        })
        .catch(function(response) {
            ctx.reply("Spotify authorization error :c")
            console.error(response);
        });
});

bot.catch((err, ctx) => {
    console.log(`Ooops, encountered an error for ${ctx.updateType}`, err);
})
bot.launch();

function getUrl(text) {
    try {
        let url = new URL(text.trim());
        if (url.host != 'open.spotify.com') {
            return false
        }
        if (!url.pathname.match(/^\/(album|playlist)/i)) {
            return false;
        }
        return url;
    } catch (e) {
        if (e.code == 'ERR_INVALID_URL') {
            return false;
        } else {
            throw e;
        }
    }
}

function base64(data) {
    return Buffer.from(data).toString('base64');
}

function printResult(result) {
    let string = "";
    for (let track of result) {
        string += `${track[0].join(", ")} - ${track[1]} (${printDuration(track[2])})\n\r`;
    }
    return string;
}

function printDuration(seconds) {
    let m = Math.floor(seconds / 60);
    let s = seconds - m * 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}