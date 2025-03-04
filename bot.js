const { Telegraf } = require('telegraf');
const axios = require('axios');
const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN); // Usa il token dalla variabile d'ambiente
const userCardData = {}; // Archivio per le carte cercate

const app = express();
app.use(express.json());

// Endpoint Webhook per ricevere i messaggi da Telegram
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    bot.handleUpdate(req.body);
    res.sendStatus(200);
});

// Avvia il server Express su Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🌍 Server Webhook avviato sulla porta ${PORT}`);

    try {
        const webhookUrl = `https://tuo-progetto.railway.app/bot${process.env.BOT_TOKEN}`;
        await bot.telegram.setWebhook(webhookUrl);
        console.log(`✅ Webhook impostato con successo: ${webhookUrl}`);
    } catch (error) {
        console.error("❌ Errore nell'impostazione del Webhook:", error);
    }
});

// Funzione per cercare una carta su Scryfall, supporta nomi in IT e EN
async function searchCard(ctx, cardName) {
    try {
        console.log(`🔍 Ricerca della carta: ${cardName}`);
        let response = await axios.get(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`);

        if (response.status === 200) {
            return showCardDetails(ctx, response.data);
        }
    } catch (error) {
        console.log("❌ Carta non trovata con il nome originale, provo in italiano...");
    }

    try {
        const translationResponse = await axios.get(`https://api.scryfall.com/cards/search?q=lang:it ${encodeURIComponent(cardName)}`);
        if (translationResponse.data.data.length > 0) {
            const englishName = translationResponse.data.data[0].name;
            console.log(`🔄 Traduzione trovata: ${cardName} → ${englishName}`);

            const finalResponse = await axios.get(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(englishName)}`);
            return showCardDetails(ctx, finalResponse.data);
        }
    } catch (error) {
        console.log("❌ Nessuna traduzione trovata, la carta non esiste in italiano.");
        ctx.reply("❌ Carta non trovata. Assicurati di scrivere il nome corretto.");
    }
}

// Funzione per mostrare i dettagli della carta
async function showCardDetails(ctx, card) {
    const cardInfo = `📜 Nome: ${card.name}\n📦 Set: ${card.set_name}\n🎨 Artista: ${card.artist}`;
    let imageUrl = card.image_uris ? card.image_uris.normal : card.card_faces[0].image_uris.normal;

    const cardMarketUrl = `https://www.cardmarket.com/it/Magic/Products/Search?searchString=${encodeURIComponent(card.name)}`;
    const cardTraderUrl = `https://www.cardtrader.com/search?q=${encodeURIComponent(card.name)}`;

    const inlineKeyboard = [
        [{ text: "💰 Cardmarket", url: cardMarketUrl }, { text: "💰 CardTrader", url: cardTraderUrl }],
        [{ text: "ℹ️ Dettagli su Scryfall", url: card.scryfall_uri }]
    ];

    await ctx.replyWithPhoto(imageUrl, {
        caption: cardInfo,
        reply_markup: { inline_keyboard: inlineKeyboard }
    });
}

// Funzione per mostrare le versioni della carta
async function showCardVersion(ctx, userId, printingIndex, messageId = null) {
    const userData = userCardData[userId];
    if (!userData || !userData.allPrintings || userData.allPrintings.length === 0) {
        return ctx.reply('❌ Dati della carta non disponibili. Cerca nuovamente una carta.');
    }

    userData.currentPrintingIndex = printingIndex;
    const card = userData.allPrintings[printingIndex];

    const versionInfo = `📜 Nome: ${card.name}\n📦 Set: ${card.set_name} (${card.set.toUpperCase()})\n🎨 Artista: ${card.artist || 'N/A'}\n🔢 ${printingIndex + 1}/${userData.allPrintings.length} versioni`;
    let imageUrl = card.image_uris ? card.image_uris.normal : card.card_faces[0].image_uris.normal;

    const inlineKeyboard = [
        [{ text: "⬅️ Prec", callback_data: 'prev_version' }, { text: `${printingIndex + 1}/${userData.allPrintings.length}`, callback_data: 'version_info' }, { text: "Succ ➡️", callback_data: 'next_version' }],
        [{ text: "ℹ️ Dettagli su Scryfall", url: card.scryfall_uri }]
    ];

    await ctx.replyWithPhoto(imageUrl, {
        caption: versionInfo,
        reply_markup: { inline_keyboard: inlineKeyboard }
    });
}

// Navigazione tra le versioni
bot.action('prev_version', async (ctx) => {
    const userId = ctx.from.id;
    if (userCardData[userId]) {
        const currentIndex = userCardData[userId].currentPrintingIndex;
        if (currentIndex > 0) {
            await showCardVersion(ctx, userId, currentIndex - 1);
        }
    }
});

bot.action('next_version', async (ctx) => {
    const userId = ctx.from.id;
    if (userCardData[userId]) {
        const currentIndex = userCardData[userId].currentPrintingIndex;
        if (currentIndex < userCardData[userId].allPrintings.length - 1) {
            await showCardVersion(ctx, userId, currentIndex + 1);
        }
    }
});

// Comando /clearall per eliminare i messaggi del bot
bot.command('clearall', async (ctx) => {
    try {
        const chatId = ctx.chat.id;
        const messageId = ctx.message.message_id;

        for (let i = 0; i < 10; i++) {
            try {
                await ctx.telegram.deleteMessage(chatId, messageId - i);
            } catch (err) {
                console.error(`Errore nella cancellazione del messaggio ${messageId - i}:`, err);
            }
        }

        const confirmationMessage = await ctx.reply('🧹 Pulizia completata!');
        setTimeout(() => {
            ctx.deleteMessage(confirmationMessage.message_id);
        }, 3000);
    } catch (error) {
        console.error('Errore nel comando /clearall:', error);
    }
});

// Keep-alive per evitare che il bot si spenga su Railway
setInterval(() => {
    console.log("✅ Keep-alive: Il bot è ancora attivo!");
}, 5 * 60 * 1000);

// Avvia il bot
bot.launch().then(() => {
    console.log('✅ Bot avviato con successo!');
}).catch(err => {
    console.error('❌ Errore nell\'avvio del bot:', err);
});

// Gestione della chiusura
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
