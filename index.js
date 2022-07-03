const { Bot, Context, InlineKeyboard, session} = require("grammy")
const fs= require("fs")
const TonWeb= require("tonweb")
const tonMnemonic= require("tonweb-mnemonic")
const dotenv = require("dotenv")
dotenv.config()


const BN = TonWeb.utils.BN;
const toNano = TonWeb.utils.toNano;

const providerUrl = 'https://testnet.toncenter.com/api/v2/jsonRPC'; // TON HTTP API url. Use this url for testnet
const apiKey = '512254e3c87a80f4bb74f17d5c1b46650c73b156f9705204141788bb9d27dfdb';
const tonweb = new TonWeb(new TonWeb.HttpProvider(providerUrl, {apiKey})); // Initialize TON SDK


// Create bot in BotFather if you want start him
const bot = new Bot(process.env.TG_TOKEN);

let savedPrivates = {}
const PRIVATES_FILE_LOCATION = './privates.json'


let file = fs.readFileSync(PRIVATES_FILE_LOCATION, "utf-8")
try {
    savedPrivates = JSON.parse(file)
    console.log("Privates settled")
}
catch (e) {
    console.log("Reseted privates")
}

function saveAllToFile() {
    fs.writeFileSync(PRIVATES_FILE_LOCATION, JSON.stringify(savedPrivates), 'utf-8')
}

const games = [
    {

    }
];
function initial() {
    return { currentGameID: null };
}
bot.use(session({ initial }));


async function startChannel(aMnemonic, bMnemonic, aBet, bBet) {
    let keyPairA = await tonMnemonic.mnemonicToKeyPair(aMnemonic.split(" "))
    let keyPairB = await tonMnemonic.mnemonicToKeyPair(bMnemonic.split(" "))

    const walletA = tonweb.wallet.create({
        publicKey: keyPairA.publicKey
    });
    const walletAddressA = await walletA.getAddress();
    console.log('walletAddressA = ', walletAddressA.toString(true, true, true));

    const walletB = tonweb.wallet.create({
        publicKey: keyPairB.publicKey
    });
    const walletAddressB = await walletB.getAddress();
    console.log('walletAddressB = ', walletAddressB.toString(true, true, true));



    const channelInitState = {
        balanceA: toNano(aBet),
        balanceB: toNano(bBet),
        seqnoA: new BN(0),
        seqnoB: new BN(0),
        currentBet: new BN(0)
    };

    const channelConfig = {
        channelId: new BN(124),
        addressA: walletAddressA,
        addressB: walletAddressB,
        initBalanceA: channelInitState.balanceA,
        initBalanceB: channelInitState.balanceB
    }


    const channelA = tonweb.payments.createChannel({
        ...channelConfig,
        isA: true,
        myKeyPair: keyPairA,
        hisPublicKey: keyPairB.publicKey,
    });
    const channelAddress = await channelA.getAddress(); // address of this payment channel smart-contract in blockchain
    console.log('channelAddress=', channelAddress.toString(true, true, true));

    const channelB = tonweb.payments.createChannel({
        ...channelConfig,
        isA: false,
        myKeyPair: keyPairB,
        hisPublicKey: keyPairA.publicKey,
    });

    if ((await channelB.getAddress()).toString() !== channelAddress.toString()) {
        throw new Error('Channels address not same');
    }

    const fromWalletA = channelA.fromWallet({
        wallet: walletA,
        secretKey: keyPairA.secretKey
    });

    const fromWalletB = channelB.fromWallet({
        wallet: walletB,
        secretKey: keyPairB.secretKey
    });

    await fromWalletA.deploy().send(toNano('0.05'));
    console.log(await channelA.getChannelState());
    const data = await channelA.getData();
    console.log('balanceA = ', data.balanceA.toString())
    console.log('balanceB = ', data.balanceB.toString())


    await fromWalletA
        .topUp({coinsA: channelInitState.balanceA, coinsB: new BN(0)})
        .send(channelInitState.balanceA.add(toNano('0.05')));

    await fromWalletB
        .topUp({coinsA: new BN(0), coinsB: channelInitState.balanceB})
        .send(channelInitState.balanceB.add(toNano('0.05')));

    await fromWalletA.init(channelInitState).send(toNano('0.05'));
}

async function createGame(aMnemonic, bMnemonic, aBet, bBet) {

}



async function bot_games(ctx) {

    const text = `Available games:`
    const gamesKeyboard = new InlineKeyboard()
    gamesKeyboard.text("🪙 Create a new game").row()
    games.map((e, i) => {
        gamesKeyboard.text("🎮 Game #" + i, "game_"+i).row()
    })
    ctx.reply(text, {reply_markup: gamesKeyboard})
}


bot.command("start", async (ctx) => {

    await ctx.reply(`🪙 Welcome to the TONFlip!
    
Is a game "Head and Tail" implemented as a Telegram Bot.

How it works?

First of all bot generates result hashes for "Head" and "Tail" where hash equals one
or zero plus random number wrapped this all in hash function.

Then, players top up their balances by sending money to the channel. Next, they place their bets and choose "Head" or "Tail".

If both players have chosen Head or Tail, then nothing happens and balances stay unchanged.

After all these actions, bot reveal the result, balances change and players can continue or leave the game and commit changes of balances.
`)
} );
bot.command("games", bot_games);

// bot.hears(/\/connect\s([^]+)/i, (ctx) => {
//     ctx.session
// })

bot.on('callback_query:data', async (ctx) => {
    if(ctx.callbackQuery.data.includes("game_")) {
        if(ctx.session.currentGameID !== null) return await ctx.answerCallbackQuery("You're already in game")
        let rawData = ctx.callbackQuery.data.split("_")
        let gameId = rawData[1]
        console.log(ctx.session)
        if(games[gameId]) {
            let game = games[gameId];
            if(game.memberA === undefined) {
                game.memberA = ctx.from.id
                ctx.session.currentGameID = gameId
                return await ctx.answerCallbackQuery("Throw up...")
            }
            else if(game.memberB === undefined) {
                game.memberB = ctx.from.id
                ctx.session.currentGameID = gameId
                return await ctx.answerCallbackQuery("Throw up...")
            }
            else return await ctx.answerCallbackQuery("Game already started")
        }
    }
    else await ctx.answerCallbackQuery()
})
bot.start();