const { Telegraf } = require('telegraf');
const axios = require('axios');
const cheerio = require('cheerio');

const bot = new Telegraf('7867515051:AAHzLtdIUHJ-yqvsCBR6WnGxbzrdgqTFhrs');

// Archivio per memorizzare temporaneamente i dati delle carte per utente
const userCardData = {};

// Comando /start
bot.start((ctx) => {
    ctx.reply('Benvenuto! Scrivi il nome di una carta di Magic e ti mostrerò la sua immagine, i formati giocabili, le varianti disponibili e i prezzi da Cardmarket e CardTrader.');
});

// Funzione per cercare la carta su Scryfall
async function searchCard(ctx, cardName) {
    try {
        // Prima cerchiamo i dettagli base della carta
        const response = await axios.get(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`);
        const card = response.data;
        
        // Ora cerchiamo tutte le versioni della carta
        const printingsResponse = await axios.get(`https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(card.name)}"&unique=prints`);
        const allPrintings = printingsResponse.data.data;
        
        // Salviamo i dati della carta per questo utente
        const userId = ctx.from.id;
        userCardData[userId] = {
            card: card,
            allPrintings: allPrintings,
            currentPrintingIndex: 0,
            messageId: null // Memorizzeremo l'ID del messaggio per aggiornarlo
        };
        
        // Mostriamo la prima versione della carta
        await showCardVersion(ctx, userId, 0);
    } catch (error) {
        console.error(error);
        ctx.reply('❌ Carta non trovata. Prova a scrivere il nome corretto.');
    }
}

// Funzione per mostrare una specifica versione della carta
async function showCardVersion(ctx, userId, printingIndex, messageId = null) {
    const userData = userCardData[userId];
    if (!userData || !userData.allPrintings || userData.allPrintings.length === 0) {
        return ctx.reply('❌ Dati della carta non disponibili. Cerca nuovamente una carta.');
    }
    
    // Aggiorniamo l'indice corrente
    userData.currentPrintingIndex = printingIndex;
    const card = userData.allPrintings[printingIndex];
    
    // Informazioni sulla versione corrente
    const versionInfo = `📜 Nome: ${card.name}\n📦 Set: ${card.set_name} (${card.set.toUpperCase()})\n🎨 Artista: ${card.artist || 'N/A'}\n🔢 ${printingIndex + 1}/${userData.allPrintings.length} versioni`;
    
    // Prezzi indicativi
    let priceInfo = {
        cardmarket: "Vedi dettagli",
        cardtrader: "Vedi dettagli"
    };
    
    // Aggiungiamo prezzi se disponibili nella risposta dell'API
    if (card.prices) {
        if (card.prices.eur) priceInfo.cardmarket = `€${card.prices.eur}`;
        if (card.prices.usd) priceInfo.cardtrader = `$${card.prices.usd}`;
    }
    
    const fullCaption = `${versionInfo}\n\n💰 Prezzo Cardmarket: ${priceInfo.cardmarket}\n💰 Prezzo CardTrader: ${priceInfo.cardtrader}`;
    
    // Prepariamo la tastiera inline con i bottoni
    const inlineKeyboard = [];
    
    // Bottoni per navigare tra le versioni nello stesso messaggio
    const navRow = [];
    if (userData.allPrintings.length > 1) {
        if (printingIndex > 0) {
            navRow.push({ text: '⬅️ Prec', callback_data: 'prev_version' });
        }
        
        navRow.push({ text: `${printingIndex + 1}/${userData.allPrintings.length}`, callback_data: 'version_info' });
        
        if (printingIndex < userData.allPrintings.length - 1) {
            navRow.push({ text: 'Succ ➡️', callback_data: 'next_version' });
        }
    }
    if (navRow.length > 0) {
        inlineKeyboard.push(navRow);
    }
    
    // Bottoni per i prezzi - Utilizziamo l'URL di ricerca di Cardmarket
    // Questo dovrebbe funzionare in modo più affidabile
    const cardMarketUrl = `https://www.cardmarket.com/it/Magic/Products/Search?searchString=${encodeURIComponent(card.name)}`;
    const cardTraderUrl = `https://www.cardtrader.com/search?q=${encodeURIComponent(card.name)}`;
    inlineKeyboard.push([
        { text: '💰 Cardmarket', url: cardMarketUrl },
        { text: '💰 CardTrader', url: cardTraderUrl }
    ]);
    
    // Raccogliamo i formati in cui la carta è legale con link ai migliori siti per deck
    const legalFormats = [];
    const encodedCardName = encodeURIComponent(card.name);
    
    const formats = [
        { 
            name: 'Standard', 
            legality: card.legalities.standard, 
            url: `https://www.mtggoldfish.com/metagame/standard#paper`
        },
        { 
            name: 'Pioneer', 
            legality: card.legalities.pioneer, 
            url: `https://www.mtggoldfish.com/metagame/pioneer#paper`
        },
        { 
            name: 'Modern', 
            legality: card.legalities.modern, 
            url: `https://www.mtggoldfish.com/metagame/modern#paper`
        },
        { 
            name: 'Legacy', 
            legality: card.legalities.legacy, 
            url: `https://www.mtgtop8.com/format?f=LE`
        },
        { 
            name: 'Vintage', 
            legality: card.legalities.vintage, 
            url: `https://www.mtgtop8.com/format?f=VI`
        },
        { 
            name: 'Pauper', 
            legality: card.legalities.pauper, 
            url: `https://www.mtggoldfish.com/metagame/pauper#paper`
        },
        { 
            name: 'Commander', 
            legality: card.legalities.commander, 
            url: `https://edhrec.com/commanders`
        }
    ];
    
    // Raccogliamo i formati in cui la carta è legale
    formats.forEach(format => {
        if (format.legality === 'legal') {
            legalFormats.push({ text: format.name, url: format.url });
        }
    });
    
    // Aggiungiamo fino a 3 formati per riga
    for (let i = 0; i < legalFormats.length; i += 3) {
        const formatRow = legalFormats.slice(i, i + 3);
        inlineKeyboard.push(formatRow);
    }
    
    // Link a Scryfall
    inlineKeyboard.push([
        { text: 'ℹ️ Dettagli su Scryfall', url: card.scryfall_uri }
    ]);
    
    // Otteniamo l'URL dell'immagine
    let imageUrl = card.image_uris ? card.image_uris.normal : (card.card_faces && card.card_faces[0].image_uris ? card.card_faces[0].image_uris.normal : null);
    
    if (!imageUrl) {
        return ctx.reply('❌ Immagine non disponibile per questa versione della carta.');
    }
    
    try {
        // Se stiamo aggiornando un messaggio esistente
        if (messageId) {
            try {
                // Aggiorniamo il messaggio esistente
                await ctx.telegram.editMessageMedia(
                    ctx.chat.id, 
                    messageId,
                    null, 
                    {
                        type: 'photo',
                        media: imageUrl,
                        caption: fullCaption
                    },
                    {
                        reply_markup: {
                            inline_keyboard: inlineKeyboard
                        }
                    }
                );
                return;
            } catch (error) {
                console.error('Errore nell\'aggiornamento del messaggio:', error);
                // Se fallisce l'aggiornamento, inviamo un nuovo messaggio
            }
        }
        
        // Inviamo un nuovo messaggio
        const sentMessage = await ctx.replyWithPhoto(imageUrl, {
            caption: fullCaption,
            reply_markup: {
                inline_keyboard: inlineKeyboard
            }
        });
        
        // Memorizziamo l'ID del messaggio per aggiornamenti futuri
        userData.messageId = sentMessage.message_id;
    } catch (error) {
        console.error('Errore nell\'invio dell\'immagine:', error);
        ctx.reply(`${fullCaption}\n\n❌ Errore nell'invio dell'immagine.`);
    }
}

// Gestione navigazione versioni precedenti in modo inline
bot.action('prev_version', async (ctx) => {
    try {
        const userId = ctx.from.id;
        if (userCardData[userId]) {
            const currentIndex = userCardData[userId].currentPrintingIndex;
            const messageId = ctx.callbackQuery.message.message_id;
            
            if (currentIndex > 0) {
                await ctx.answerCbQuery('Caricamento versione precedente...');
                await showCardVersion(ctx, userId, currentIndex - 1, messageId);
            } else {
                await ctx.answerCbQuery('Questa è la prima versione!');
            }
        } else {
            await ctx.answerCbQuery('Dati non disponibili. Cerca nuovamente una carta.');
        }
    } catch (error) {
        console.error('Errore nell\'azione prev_version:', error);
        await ctx.answerCbQuery('Si è verificato un errore. Riprova.');
    }
});

// Gestione navigazione versioni successive in modo inline
bot.action('next_version', async (ctx) => {
    try {
        const userId = ctx.from.id;
        if (userCardData[userId]) {
            const currentIndex = userCardData[userId].currentPrintingIndex;
            const maxIndex = userCardData[userId].allPrintings.length - 1;
            const messageId = ctx.callbackQuery.message.message_id;
            
            if (currentIndex < maxIndex) {
                await ctx.answerCbQuery('Caricamento versione successiva...');
                await showCardVersion(ctx, userId, currentIndex + 1, messageId);
            } else {
                await ctx.answerCbQuery('Questa è l\'ultima versione!');
            }
        } else {
            await ctx.answerCbQuery('Dati non disponibili. Cerca nuovamente una carta.');
        }
    } catch (error) {
        console.error('Errore nell\'azione next_version:', error);
        await ctx.answerCbQuery('Si è verificato un errore. Riprova.');
    }
});

// Informazioni sulla versione
bot.action('version_info', async (ctx) => {
    const userId = ctx.from.id;
    if (userCardData[userId]) {
        const currentIndex = userCardData[userId].currentPrintingIndex;
        const maxIndex = userCardData[userId].allPrintings.length - 1;
        await ctx.answerCbQuery(`Versione ${currentIndex + 1} di ${maxIndex + 1}`);
    } else {
        await ctx.answerCbQuery('Dati non disponibili.');
    }
});

// Quando l'utente scrive un nome di una carta
bot.on('text', (ctx) => {
    const cardName = ctx.message.text;
    searchCard(ctx, cardName);
});

// Gestione degli errori
bot.catch((err, ctx) => {
    console.error(`Errore per ${ctx.updateType}`, err);
    ctx.reply('Si è verificato un errore interno. Riprova più tardi.');
});

// Aggiungiamo comandi di aiuto
bot.help((ctx) => {
    ctx.reply(
        'Ecco come usare questo bot:\n\n' +
        '• Scrivi il nome di una carta Magic per cercarla\n' +
        '• Usa i bottoni ⬅️ e ➡️ per navigare tra le diverse versioni della carta\n' +
        '• Clicca sui formati per vedere i deck che utilizzano questa carta\n' +
        '• Clicca su Cardmarket o CardTrader per vedere i prezzi dettagliati\n\n' +
        'Comandi disponibili:\n' +
        '/start - Inizia a usare il bot\n' +
        '/help - Mostra questo messaggio di aiuto'
    );
});

// Avvia il bot
bot.launch().then(() => {
    console.log('Bot avviato con successo!');
}).catch(err => {
    console.error('Errore nell\'avvio del bot:', err);
});

// Gestione della chiusura
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));