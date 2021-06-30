/*
Author: Daniel Meyer
24.06.2021
*/

const logo = `

██╗░░░██╗██╗████████╗░█████╗░██╗███╗░░░███╗██╗███╗░░██╗███████╗
██║░░░██║██║╚══██╔══╝██╔══██╗██║████╗░████║██║████╗░██║██╔════╝
╚██╗░██╔╝██║░░░██║░░░███████║██║██╔████╔██║██║██╔██╗██║█████╗░░
░╚████╔╝░██║░░░██║░░░██╔══██║██║██║╚██╔╝██║██║██║╚████║██╔══╝░░
░░╚██╔╝░░██║░░░██║░░░██║░░██║██║██║░╚═╝░██║██║██║░╚███║███████╗
░░░╚═╝░░░╚═╝░░░╚═╝░░░╚═╝░░╚═╝╚═╝╚═╝░░░░░╚═╝╚═╝╚═╝░░╚══╝╚══════╝
v.0.5
                                                   
  `;
//////////////////////////////////////////
//////////////// LOGGING /////////////////
//////////////////////////////////////////

function getCurrentDateString() {
    return (new Date()).toISOString() + ' ::';
}
__originalLog = console.log;
console.log = function () {
    let args = [].slice.call(arguments);
    __originalLog.apply(console.log, [getCurrentDateString()].concat(args));
};

//////////////////////////////////////////
//////////////// LIBRARIES ///////////////
//////////////////////////////////////////

const logger = require('@greencoast/logger');
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const fs = require('fs');
const util = require('util');
const { Readable } = require('stream');
const TTSPlayer = require('./TTSPlayer.js');
const request = require("request");
var _ = require('underscore');
//using request here because node witai speech module needs it
//const cleverbot = require("cleverbot-free");
//const keepAlive = require('./server');


logger.info('LIBRARIES LOADED');
let nodeversion = process.versions.node.split('.')[0];
if (nodeversion < 14) {logger.warn('Remember this BUILD is only tested on NODE.js v14.17.0');}
logger.info('Node.js version',nodeversion);

//////////////////////////////////////////
///////////////// VARIA //////////////////
//////////////////////////////////////////

function necessary_dirs() {
    if (!fs.existsSync('./data/')){
        fs.mkdirSync('./data/');
    }
}
necessary_dirs()

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function convert_audio(input) {
    try {
        // stereo to mono channel
        const data = new Int16Array(input)
        const ndata = new Int16Array(data.length/2)
        for (let i = 0, j = 0; i < data.length; i+=4) {
            ndata[j++] = data[i]
            ndata[j++] = data[i+1]
        }
        return Buffer.from(ndata);
    } catch (e) {
        console.log(e)
        console.log('convert_audio: ' + e)
        throw e;
    }
}

function removehtml(body) {
    let regex = /(&nbsp;|<([^>]+)>)/ig;
    result = body.replace(regex, "");
    return result;
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////


//////////////////////////////////////////
//////////////// Anki-API ////////////////
//////////////////////////////////////////

let ANKICONNECT_IP = null;

function invoke(action, version, params={}) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener('error', () => reject('failed to issue request'));
        xhr.addEventListener('load', () => {
            try {
                const response = JSON.parse(xhr.responseText);
                if (Object.getOwnPropertyNames(response).length !== 2) {
                    logger.info( 'response has an unexpected number of fields');
                    throw 'response has an unexpected number of fields';
                }
                if (!response.hasOwnProperty('error')) {
                    logger.info( 'response has an unexpected number of fields');
                    throw 'response is missing required error field';
                }
                if (!response.hasOwnProperty('result')) {
                    logger.info( 'response has an unexpected number of fields');
                    throw 'response is missing required result field';
                }
                if (response.error) {
                    logger.info( 'response has an unexpected number of fields');
                    throw response.error;

                }
                resolve(response.result);
            } catch (e) {
                reject(e);
            }
        });
        xhr.open('POST',ANKICONNECT_IP);
        xhr.send(JSON.stringify({action, version, params}));
    });
}
//SAMPLE curl 46.101.211.96:8765:8765 -X POST -d "{\"action\": \"deckNames\", \"version\": 6}"

async function load_anki_API() {
    logger.info('Waiting for ANKI......')
    try {
        ankireachable = await invoke('requestPermission', 6);
        ankisync = await invoke('sync', 6);
        ankiProfiles = await invoke('getProfiles', 6)
        logger.info(`API PERMISSION: ${ankireachable.permission}`)
        if (ankisync == null) {
            logger.info('ANKI-WEB SYNCHRONIZED')
        } else {
            logger.warn('ANKI SYNC FAILED')
        }
        logger.info(`PROFILE LOADED: ${ankiProfiles[0]}`)
        ANKI_USER = ankiProfiles[0];
        logger.info('ANKI LOADED')
    }
    catch (e) {logger.warn('ANKI-API: ' + e)}
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////


//////////////////////////////////////////
//////////////// CONFIG //////////////////
//////////////////////////////////////////

const SETTINGS_FILE = 'settings.json';

let DISCORD_TOK = null;
let WITAPIKEY = null;
//let SPOTIFY_TOKEN_ID = null;
//let SPOTIFY_TOKEN_SECRET = null;
let ANKI_USER = null;

function loadConfig() {
    if (fs.existsSync(SETTINGS_FILE)) {
        const CFG_DATA = JSON.parse( fs.readFileSync(SETTINGS_FILE, 'utf8') );
        DISCORD_TOK = CFG_DATA.discord_token;
        WITAPIKEY = CFG_DATA.wit_ai_token;
        ANKICONNECT_IP = CFG_DATA.ankiconnect_api_ip;
    } else {
        ANKICONNECT_IP = process.env.ANKICONNECT_IP;
        DISCORD_TOK = process.env.DISCORD_TOK;
        WITAPIKEY = process.env.WITAPIKEY;
    }
    if (!DISCORD_TOK || !WITAPIKEY)
        throw 'failed loading config #113 missing keys!'
}
loadConfig()
logger.info('CONFIG LOADED');
load_anki_API();
//keepAlive();

const https = require('https')

function reqhttps(options, cb) {
    const req = https.request(options, (res) => {
        res.setEncoding('utf8');
        let body = ''
        res.on('data', (chunk) => {
            body += chunk
        });
        res.on('end', function () {
            cb(JSON.parse(body))
        })
    })
    req.on('error', (error) => {
        console.error(error)
        cb(null)
    })
    return req;
}

function listWitAIApps(cb) {
    const options = {
        hostname: 'api.wit.ai',
        port: 443,
        path: '/apps?offset=0&limit=100',
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer '+WITAPIKEY,
        },
    }
    const req = reqhttps(options, cb);
    req.end()
}

function updateWitAIAppLang(appID, lang, cb) {
    const options = {
        hostname: 'api.wit.ai',
        port: 443,
        path: '/apps/' + appID,
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer '+WITAPIKEY,
        },
    }
    const data = JSON.stringify({
        lang
    })
    const req = reqhttps(options, cb);
    req.write(data)
    req.end()
}

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////


//////////////////////////////////////////
////////// Discord-Integration ///////////
//////////////////////////////////////////

const Discord = require('discord.js')
const DISCORD_MSG_LIMIT = 2000;


const discordClient = new Discord.Client()
if (process.env.DEBUG)
    discordClient.on('debug', console.debug);
discordClient.on('ready', () => {
    logger.info(`Logged in as ${discordClient.user.tag}!`)
    logger.info('\x1b[36m',logo,'\x1b[0m');
    discordClient.guilds.cache.each(guild => {
        guild.ttsPlayer = new TTSPlayer(guild)
    })
})
discordClient.login(DISCORD_TOK).catch(console.error);


const PREFIX = '*';
const _CMD_HELP        = PREFIX + 'help';
const _CMD_JOIN        = PREFIX + 'join';
const _CMD_LEAVE       = PREFIX + 'leave';
const _CMD_DEBUG       = PREFIX + 'debug';
const _CMD_TEST        = PREFIX + 'test';
const _CMD_LANG        = PREFIX + 'language';
const _CMD_QUIZ        = PREFIX + 'quiz';
const _CMD_API         = PREFIX + 'api';
const _CMD_SPEED       = PREFIX + 'speed';

var lastMsg;
var await_input = 0;
var decks = [];
var lang;
const guildMap = new Map();
var togglegreeting = 1;

function getHelpString() {
    let out = '**COMMANDS:**\n'
    out += '```'
    out += PREFIX + 'help\n';
    out += PREFIX + 'join\n';
    out += PREFIX + 'leave\n';
    out += PREFIX + 'test\n';
    out += PREFIX + 'quiz\n';
    out += PREFIX + 'speed\n';
    out += '```'
    return out;
}

async function process_command(msg){
    const mapKey = msg.guild.id;
    const content = msg.content.trim().toLowerCase()
    //logger.debug('@process_command msg.content:', msg.content)
    //logger.debug('@process_command mapKey:',content)
    let val = guildMap;
    switch (content){
        case _CMD_JOIN:
            if (!msg.member.voice.channelID) {
                msg.reply('Error: please join a voice channel first.')
            } else {
                lastMsg = msg;
                if (!guildMap.has(mapKey)) {
                    await connect(msg, mapKey)
                    if (togglegreeting == 1) {
                        msg.guild.ttsPlayer.say('Hallo, Ich bin Vitamin und ich kann dir helfen deine Karteikarten mit Anki zu lernen');
                        msg.guild.ttsPlayer.say('Um die Abfrage zu starten sage: "Quiz", Um einen Überblick der Funktionen zu erhalten sage: "Hilfe" ');
                        togglegreeting == 0;
                    }
                    else{
                        let greetings = ['Hallo', 'Schön dich zu sehen', 'Willkommen zurück', 'Guten Tag', 'Servus']
                        let i_greetings = getRandomInt(4);
                        msg.guild.ttsPlayer.say(greetings[i_greetings]+ANKI_USER);
                        //msg.guild.ttsPlayer.say('Du hast folgende Funktionen: "Quiz", "Hilfe", "Schneller", "Langsamer", "Beenden"');
                    }
                    await sleep(3000);
                }
                else
                    logger.info('Already connected')
            }
            break;
        case _CMD_LEAVE:
            if (guildMap.has(mapKey)) {
                let val = guildMap.get(mapKey);
                if (val.voice_Channel) val.voice_Channel.leave()
                if (val.voice_Connection) val.voice_Connection.disconnect()
                guildMap.delete(mapKey)
                msg.reply("Disconnected.")
            } else {
                msg.reply("Cannot leave because not connected.")
            }
            break;
        case _CMD_HELP:
            msg.reply(getHelpString());
            msg.guild.ttsPlayer.say('Du hast folgende Funktionen: "Quiz", "Hilfe", "Schneller", "Langsamer", "Beenden"');
            await sleep(1000);
            break;
        case _CMD_DEBUG:
            logger.debug('toggling debug mode')
            val.debug = !val.debug;
            break;
        case _CMD_TEST:
            if (!guildMap.has(mapKey)) {await connect(msg, mapKey)}
            msg.reply('hello back =)')
            break;
        case _CMD_QUIZ:
            if (!guildMap.has(mapKey)) {await connect(msg, mapKey)}
            await invoke('guiDeckBrowser', 6);
            decks = await invoke('deckNames', 6);
            //msg.guild.ttsPlayer.say(`Wähle ein Deck: ${decks}`);
            msg.guild.ttsPlayer.say(`Wähle ein Deck:`);
            decks.forEach(function(item, index, array) {
                msg.guild.ttsPlayer.say(String(index)+' für '+item);
            });
            //msg.channel.send(`Decks: ${decks}`);
            logger.debug(decks);
            await_input = 1;
            break;
        default:
            if (msg.content.split('\n')[0].split(' ')[0].trim().toLowerCase() === _CMD_LANG) {
                lang = msg.content.replace(_CMD_LANG, '').trim().toLowerCase()
                logger.debug(lang)
                msg.guild.ttsPlayer.setLang(lang);
                listWitAIApps(data => {
                    if (!data.length)
                        return msg.reply('no apps found! :(')
                    for (const x of data) {
                        updateWitAIAppLang(x.id, lang, data => {
                            if ('success' in data)
                                msg.reply('success!')
                            else if ('error' in data && data.error !== 'Access token does not match')
                                msg.reply('Error: ' + 'WitAi Token is in DE, googleTTS was changed to : '+lang)
                        })
                    }
                })
            }
            else if (msg.content.split('\n')[0].split(' ')[0].trim().toLowerCase() === _CMD_API) {
                const api = msg.content.replace(_CMD_API, '').trim()
                var nameArr = api.split(',');
                if (nameArr[1] !== undefined){
                    var cprameter = {};
                    cprameter.name = nameArr[1];
                    let curll = await invoke(nameArr[0],6,cprameter);
                    logger.log(curll);
                }
                else {
                    let curll = await invoke(nameArr[0], 6)
                    msg.reply(curll);
                }
            }
            else if (msg.content.split('\n')[0].split(' ')[0].trim().toLowerCase() === _CMD_SPEED) {
                const speed = msg.content.replace(_CMD_SPEED, '').trim()
                if (speed !== 'normal' && speed !== 'slow') {
                    msg.reply('invalid speed, it must be either *normal* or *slow*.');}
                else
                    msg.guild.ttsPlayer.setSpeed(speed);
            }
    }
}


discordClient.on('message', async (msg) => {
    try {
        if (!('guild' in msg) || !msg.guild) return; // prevent private messages to bot
        await process_command(msg);
    } catch (e) {
        console.log('discordClient message: ' + e)
        await msg.reply('Error#180: Something went wrong, try again or contact the developers if this keeps happening.');
    }
})

const SILENCE_FRAME = Buffer.from([0xF8, 0xFF, 0xFE]);

class Silence extends Readable {
    _read() {
        this.push(SILENCE_FRAME);
        this.destroy();
    }
}

async function connect(msg, mapKey) {
    try {
        let voice_Channel = await discordClient.channels.fetch(msg.member.voice.channelID);
        if (!voice_Channel) return msg.reply("Error: The voice channel does not exist!");
        let text_Channel = await discordClient.channels.fetch(msg.channel.id);
        if (!text_Channel) return msg.reply("Error: The text channel does not exist!");
        let voice_Connection = await voice_Channel.join();
        guildMap.set(mapKey, {
            'text_Channel': text_Channel,
            'voice_Channel': voice_Channel,
            'voice_Connection': voice_Connection,
            'debug': false,
        });
        speak_impl(voice_Connection, mapKey)
        voice_Connection.on('disconnect', async(e) => {
            if (e) console.log(e);
            guildMap.delete(mapKey);
        })
        logger.info('connected to Voice Channel')
        msg.reply('connected!')
    } catch (e) {
        console.log('connect: ' + e)
        msg.reply('Error: unable to join your voice channel.');
        throw e;
    }
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////


//////////////////////////////////////////
//////////// Voice & Commands ////////////
//////////////////////////////////////////
function process_commands_query(intent, mapKey, msg) {
    msg.content = PREFIX+intent;
    msg.guild.id = mapKey;
    return msg;
}

function speak_impl(voice_Connection, mapKey) {
    async function answercard(status, currentCard, i) {
        answer = await invoke('guiAnswerCard', 6, {"ease": i});
        logger.info(answer)
        status = await invoke('guiShowQuestion', 6);
        await sleep(500);
        logger.debug(status)
        if (status == false) {
            await_input = 0;
            msg.guild.ttsPlayer.say('Deck beendet, Wechsele zur Deckauswahl')
            msg = process_commands_query('quiz', mapKey, lastMsg);
            process_command(msg);
        }
        currentCard = await invoke('guiCurrentCard', 6);
        cardfront = removehtml(currentCard.fields.Front.value);
        msg.guild.ttsPlayer.say(cardfront)
        await invoke('guiStartCardTimer', 6);
        return {status, currentCard};
    }

    voice_Connection.on('speaking', async (user, speaking) => {
        if (speaking.bitfield === 0 || user.bot) {
            return
        }
        console.log(`I'm listening to ${user.username}`)
        // this creates a 16-bit signed PCM, stereo 48KHz stream
        const audioStream = voice_Connection.receiver.createStream(user, { mode: 'pcm' })
        audioStream.on('error',  (e) => {
            console.log('audioStream: ' + e)
        });
        let buffer = [];
        audioStream.on('data', (data) => {
            buffer.push(data)
        })
        audioStream.on('end', async () => {
            buffer = Buffer.concat(buffer)
            const duration = buffer.length / 48000 / 4;
            console.log("duration: " + duration)
            if (duration < 0.5 || duration > 19) { // 20 seconds max dur
                logger.warn("TOO SHORT / TOO LONG; SKPPING")
                return;
            }
            try {
                let new_buffer = await convert_audio(buffer)
                let out = await transcribe(new_buffer);
                const confidence = out.intents?.[0]?.confidence;
                let entities_exists = !_.isEmpty(out.entities);
                if (confidence !== undefined) {
                    if (out.intents[0].confidence > 0.8){

                        msg = process_commands_query(out.intents[0].name, mapKey, lastMsg);
                        logger.debug(out.intents[0].name)
                        logger.debug(await_input)
                        voice_Connection.play('beep.mp3', { volume: 0.9 });
                        var cardback, currentCard, status;

                        if(out.intents[0].name=='fast'||out.intents[0].name=='slow') {
                            if (out.intents[0].name=='fast'){
                                msg.guild.ttsPlayer.say('Setze Sprechgeschwindigkeit auf schnell')
                                msg = process_commands_query('speed normal', mapKey, lastMsg);
                                process_command(msg);
                            }
                            else {
                                msg.guild.ttsPlayer.say('Setze Sprechgeschwindigkeit auf langsam')
                                msg = process_commands_query('speed slow', mapKey, lastMsg);
                                process_command(msg);
                            }
                        }
                        else if (await_input === 1 ){
                            let __ret = {}
                            switch (out.intents[0].name){
                                case 'resp':
                                    currentCard = await invoke('guiCurrentCard', 6);
                                    await invoke('guiShowAnswer', 6);
                                    cardback = removehtml(currentCard.fields.Back.value);
                                    await invoke('guiStartCardTimer', 6);
                                    msg.guild.ttsPlayer.say(cardback)
                                    msg.guild.ttsPlayer.say('Nochmal Schwer Gut Einfach')
                                    break;
                                case 'repeat':
                                    __ret = await answercard(status, currentCard, 1);
                                    status = __ret.status;
                                    currentCard = __ret.currentCard;
                                    break;
                                case 'hard':
                                    __ret = await answercard(status, currentCard, 2);
                                    status = __ret.status;
                                    currentCard = __ret.currentCard;
                                    break;
                                case 'good':
                                    __ret = await answercard(status, currentCard, 3);
                                    status = __ret.status;
                                    currentCard = __ret.currentCard;
                                    break;
                                case 'easy':
                                    __ret = await answercard(status, currentCard, 4);
                                    status = __ret.status;
                                    currentCard = __ret.currentCard;
                                    break;
                                default:
                            }
                        }
                        else if(out.intents[0].name=='leave') {
                            let bye = ['Bis zum nächsten Mal', 'Ciao', 'Wiedersehen', 'Tschüss', 'TschüssliMüsli']
                            let i_bye = getRandomInt(4);
                            msg.guild.ttsPlayer.say(bye[i_bye]);
                            await invoke('guiDeckBrowser', 6);
                            await sleep(4000);
                            msg = process_commands_query('leave', mapKey, lastMsg);
                            process_command(msg);
                        }
                        else
                            await process_command(msg);
                    }
                }
                //DECK CHOICE ÜBER WITAI NUMBER ENTITIES
                else if (entities_exists){
                    if (await_input === 1 ){
                        var choice = {};
                        voice_Connection.play('bliip.mp3', { volume: 0.9 });
                        let number = out.entities['wit$number:number'][0]['value'];
                        choice.name = decks[number];
                        logger.debug('Ausgewaehltes Deck:',choice.name);
                        msg.guild.ttsPlayer.say(choice.name);
                        await invoke('guiDeckReview', 6, choice);
                        status = await invoke('guiShowQuestion', 6);
                        logger.debug(status)
                        if (status == false){
                            await_input = 0;
                            msg.guild.ttsPlayer.say('Deck beendet für Heute, Wechsele zur Deckauswahl')
                            msg = process_commands_query('quiz', mapKey, lastMsg);
                            process_command(msg);
                        }
                        else{
                            let currentCard = await invoke('guiCurrentCard', 6);
                            let cardfront = removehtml(currentCard.fields.Front.value);
                            msg.guild.ttsPlayer.say(cardfront)
                            await invoke('guiStartCardTimer', 6);
                        }
                    }
                }
            } catch (e) {logger.warn('Error in speak_impl: ' + e);}
        })
    })
}

//LOGGING STT to JSON FILE
/*/var usernames = JSON.stringify(userid);
fs.writeFileSync('logs.json', user.id,{flag:'a+'})
fs.writeFileSync('logs.json', " ",{flag:'a+'})
var outputs = JSON.stringify(txt);
fs.writeFileSync('logs.json', outputs+'\n',{flag: "a+"}) */


//////////////////////////////////////////
////// Natural Language Interface ////////
//////////////////////////////////////////

async function transcribe(buffer) {
    return transcribe_witai(buffer)
    // return transcribe_gspeech(buffer)
}

// WitAI
let witAI_lastcallTS = null;
const witClient = require('node-witai-speech');
let {result} = require("underscore");
async function transcribe_witai(buffer) {
    try {
        if (witAI_lastcallTS != null) {
            let now = Math.floor(new Date());
            while (now - witAI_lastcallTS < 1000) {
                console.log('sleep')
                await sleep(100);
                now = Math.floor(new Date());
            }
        }
    } catch (e) {
        console.log('transcribe_witai 837:' + e)
    }
    try {
        console.log('transcribe_witai')
        const extractSpeechIntent = util.promisify(witClient.extractSpeechIntent);
        let stream = Readable.from(buffer);
        const contenttype = "audio/raw;encoding=signed-integer;bits=16;rate=48k;endian=little"
        const output = await extractSpeechIntent(WITAPIKEY, stream, contenttype)
        witAI_lastcallTS = Math.floor(new Date());
        console.log(output)
        stream.destroy()
        /*
        if (output && '_text' in output && output._text.length)
            return output._text
        if (output && 'text' in output && output.text.length)
            return output.text */
        return output;
    } catch (e) { console.log('transcribe_witai 851:' + e); console.log(e) }
}

/*
// Google Speech API
// https://cloud.google.com/docs/authentication/production
const gspeech = require('@google-cloud/speech');
const gspeechclient = new gspeech.SpeechClient({
  projectId: 'discordbot',
  keyFilename: 'gspeech_key.json'
});

async function transcribe_gspeech(buffer) {
  try {
      console.log('transcribe_gspeech')
      const bytes = buffer.toString('base64');
      const audio = {
        content: bytes,
      };
      const config = {
        encoding: 'LINEAR16',
        sampleRateHertz: 48000,
        languageCode: 'en-US',  // https://cloud.google.com/speech-to-text/docs/languages
      };
      const request = {
        audio: audio,
        config: config,
      };

      const [response] = await gspeechclient.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
      console.log(`gspeech: ${transcription}`);
      return transcription;

  } catch (e) { console.log('transcribe_gspeech 368:' + e) }
}
*/
//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////

