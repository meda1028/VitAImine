## VITAIMINE

## Docker
If you prefer using Docker instead of manually installing it.
Copy the `Dockerfile.sample` to `Dockerfile` and edit it.
Near the bottom you have to provide API Credentials either using the `settings.json` file or setting the ENV variables.
Refer to the settings section below for details on these.
Once you've configured the Dockerfile you can build and run it:

1. run `docker build -t name .`  this may take a minute or two.
2. run `docker run -it name`
3. Proceed to Usage section below.

## Installation
You need nodeJS version 14+ with npm on your machine.
Using shell or command prompt execute the following:
```
git clone https://github.com/meda1028/name.git
cd name
npm install
```

## Settings
Create a (free) discord bot and obtain the API credentials (Bot Token). Here's an easy tutorial: https://www.writebots.com/discord-bot-token/ Note: Give your bot enough permissions or simply grant it Administrator rights.

Create a (free) WitAI account and obtain the API credentials (Server Access Token): https://wit.ai/

Rename the file `settings-sample.json` to `settings.json` and enter the obtained API credentials:
```
{
    "discord_token": "your_token",
    "wit_ai_token": "your_token"
}
```

If you are using Digitalocean Apps, Heroku or another service you can also use Environment Variables instead of a settings file. Configure these with the appropriate values:
```
DISCORD_TOK
WITAPIKEY
```

## Running

Execute the following in your shell or prompt:
```
node index.js
```

Use [PM2](https://www.npmjs.com/package/pm2) to keep the bot running 24/7, it will also restart the bot in case of a crash or on memory limits (2GB default):
```
pm2 start ecosystem.config.js
```

## Usage

By now you have a discord server, the DiscordEarsBot is running and is a part of your server. Make sure your server has a text and voice channel.

1. Enter one of your voice channels.
2. In one of your text channels type: `*join`, the bot will join the voice channel.
3. Everything said within that channel will be transcribed into text (as long as the bot is within the voice channel).
4. Type `*leave` to make the bot leave the voice channel.
5. Type `*help` for a list of commands.

### notes:
- When the bot is inside a voice channel it listens to all speech and transcribes audio into text.
- Each user is a separate audio channel, the bot hears everyone separately.
- Only when your user picture turns green in the voice channel will the bot receive your audio.
- A long pause interrupts the audio input.
- (WitAI only) The duration of a single audio input is limited to 20 seconds, longer audio is not transcribed.

## Language
WitAI supports over 120 languages (https://wit.ai/faq), however only one language can be used at a time.
If you're not speaking English on Discord, then change your default language on WitAI under "settings" for your app.

You can also change the language using the following bot command:

```
*language <code>

*language en     for English
*language es     for Spanish
*language ru     for Russian
...

The bot should reply with a success message.

<code> should be an ISO 639-1 language code (2 digits):
https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes
```




### Speech-To-Text

By default WitAI's free API is used for voice recognition / transcription. But you can easily integrate any other API into the bot. You can use Google's Speech-to-Text API as follows:

1. Open `index.js`, inside the function `transcribe(file)` make sure that `transcribe_gspeech` is being used and the other one(s) are disabled.
2. You may want to adjust the `languageCode` value if you're speaking a non-English language.
3. Enable Google Speech API here: https://console.cloud.google.com/apis/library/speech.googleapis.com
4. Create a new Service Account (or use your existing one): https://console.cloud.google.com/apis/credentials
5. Create a new Service Account Key (or use existing) and download the json file.
6. Put the json file inside your bot directory and rename it to `gspeech_key.json`.
