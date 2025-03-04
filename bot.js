const { Telegraf } = require('telegraf');
const axios = require('axios');

// Token del bot da impostare come variabile d'ambiente BOT_TOKEN
const bot = new Telegraf(process.env.BOT_TOKEN || '7867515051:AAHzLtdIUHJ-yqvsCBR6WnGxbzrdgqTFhrs');

// Archivio per memorizzare temporaneamente i dati delle carte per utente
const userCardData = {};

// Comando /start
bot.start((ctx) => {
    ctx.reply('Benvenuto! Scrivi il nome di una carta di Magic (in italiano o inglese) e ti mostrerò la sua immagine, i formati giocabili, le varianti disponibili e i prezzi da Cardmarket e CardTrader.');
});

// Comando /help
bot.help((ctx) => {
    ctx.reply(
        'Ecco come usare questo bot:\n\n' +
        '• Scrivi il nome di una carta Magic in italiano o inglese\n' +
        '• Usa i bottoni ⬅️ e ➡️ per navigare tra le diverse versioni della carta\n' +
        '• Clicca sui formati per vedere i meta del formato\n' +
        '• Clicca su Cardmarket o CardTrader per vedere i prezzi dettagliati\n\n' +
        'Comandi disponibili:\n' +
        '/start - Inizia a usare il bot\n' +
        '/help - Mostra questo messaggio di aiuto'
    );
});

// Funzione per cercare la carta su Scryfall (supporta italiano e inglese)
async function searchCard(ctx, cardName) {
    try {
        console.log(`🔍 Cercando: "${cardName}"`);
        
        // Prima proviamo con il nome esatto (supporta sia inglese che italiano)
        try {
            const response = await axios.get(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`);
            const card = response.data;
            
            // Cerca tutte le versioni disponibili della carta
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
            return;
        } catch (error) {
            console.log('Ricerca diretta fallita, proverò a cercare la versione italiana...');
        }
        
        // Se arriviamo qui, proviamo a cercare in base alla lingua italiana
        const translationResponse = await axios.get(`https://api.scryfall.com/cards/search?q=lang:it "${encodeURIComponent(cardName)}"&include_multilingual=true`);
        
        if (translationResponse.data.data && translationResponse.data.data.length > 0) {
            // Otteniamo il nome inglese dalla carta italiana
            const italienCard = translationResponse.data.data[0];
            const englishName = italienCard.printed_name ? italienCard.name : italienCard.name;
            
            console.log(`🔄 Trovata traduzione: "${cardName}" → "${englishName}"`);
            
            // Ora cerchiamo tutte le versioni con il nome inglese
            const printingsResponse = await axios.get(`https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(englishName)}"&unique=prints`);
            const allPrintings = printingsResponse.data.data;
            
            // Salviamo i dati della carta per questo utente
            const userId = ctx.from.id;
            userCardData[userId] = {
                card: translationResponse.data.data[0],
                allPrintings: allPrintings,
                currentPrintingIndex: 0,
                messageId: null // Memorizzeremo l'ID del messaggio per aggiornarlo
            };
            
            // Mostriamo la prima versione della carta
            await showCardVersion(ctx, userId, 0);
            return;
        }
        
        // Se arriviamo qui, la carta non è stata trovata
        ctx.reply('❌ Carta non trovata. Prova a scrivere il nome corretto in italiano o inglese.');
        
    } catch (error) {
        console.error('Errore nella ricerca della carta:', error);
        ctx.reply('❌ Errore nella ricerca della carta. Riprova più tardi o con un nome diverso.');
    }
}

// Funzione per mostrare una specifica versione della carta
async function showCardVersion(ctx, userId, printingIndex, messageId = null) {
    try {
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
        
        // Bottoni per i prezzi
        const cardMarketUrl = `https://www.cardmarket.com/it/Magic/Products/Search?searchString=${encodeURIComponent(card.name)}`;
        const cardTraderUrl = `https://www.cardtrader.com/search?q=${encodeURIComponent(card.name)}`;
        inlineKeyboard.push([
            { text: '💰 Cardmarket', url: cardMarketUrl },
            { text: '💰 CardTrader', url: cardTraderUrl }
        ]);
        
        // Raccogliamo i formati in cui la carta è legale con link ai migliori siti per formato
        const legalFormats = [];
        
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
        let imageUrl = null;
        
        if (card.image_uris && card.image_uris.normal) {
            imageUrl = card.image_uris.normal;
        } else if (card.card_faces && card.card_faces[0].image_uris && card.card_faces[0].image_uris.normal) {
            imageUrl = card.card_faces[0].image_uris.normal;
        }
        
        if (!imageUrl) {
            return ctx.reply('❌ Immagine non disponibile per questa versione della carta.');
        }
        
        // Se abbiamo un ID messaggio (cioè stiamo aggiornando una carta esistente)
        if (messageId) {
            try {
                // Aggiorniamo il messaggio esistente con la nuova immagine
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
                // Se l'aggiornamento fallisce, continua e invia un nuovo messaggio
            }
        }
        
        // Se non stiamo aggiornando o l'aggiornamento è fallito, inviamo un nuovo messaggio
        const sentMessage = await ctx.replyWithPhoto(imageUrl, {
            caption: fullCaption,
            reply_markup: {
                inline_keyboard: inlineKeyboard
            }
        });
        
        // Salviamo l'ID del messaggio per futuri aggiornamenti
        userData.messageId = sentMessage.message_id;
    } catch (error) {
        console.error('Errore nel mostrare la carta:', error);
        ctx.reply('❌ Si è verificato un errore. Riprova più tardi.');
    }
}

// Gestione navigazione versioni precedenti
bot.action('prev_version', async (ctx) => {
    try {
        const userId = ctx.from.id;
        if (userCardData[userId]) {
            const currentIndex = userCardData[userId].currentPrintingIndex;
            
            if (currentIndex > 0) {
                await ctx.answerCbQuery('Caricamento versione precedente...');
                await showCardVersion(ctx, userId, currentIndex - 1, ctx.callbackQuery.message.message_id);
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

// Gestione navigazione versioni successive
bot.action('next_version', async (ctx) => {
    try {
        const userId = ctx.from.id;
        if (userCardData[userId]) {
            const currentIndex = userCardData[userId].currentPrintingIndex;
            const maxIndex = userCardData[userId].allPrintings.length - 1;
            
            if (currentIndex < maxIndex) {
                await ctx.answerCbQuery('Caricamento versione successiva...');
                await showCardVersion(ctx, userId, currentIndex + 1, ctx.callbackQuery.message.message_id);
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
    try {
        const userId = ctx.from.id;
        if (userCardData[userId]) {
            const currentIndex = userCardData[userId].currentPrintingIndex;
            const maxIndex = userCardData[userId].allPrintings.length - 1;
            await ctx.answerCbQuery(`Versione ${currentIndex + 1} di ${maxIndex + 1}`);
        } else {
            await ctx.answerCbQuery('Dati non disponibili.');
        }
    } catch (error) {
        console.error('Errore nell\'azione version_info:', error);
        await ctx.answerCbQuery('Si è verificato un errore.');
    }
});

// Pulizia della memoria ogni 12 ore per evitare perdite di memoria
setInterval(() => {
    console.log('🧹 Pulizia della memoria...');
    
    // Rimuoviamo le ricerche più vecchie di 6 ore
    const now = Date.now();
    const sixHoursMs = 6 * 60 * 60 * 1000;
    
    for (const userId in userCardData) {
        if (userCardData[userId].timestamp && (now - userCardData[userId].timestamp) > sixHoursMs) {
            delete userCardData[userId];
        }
    }
    
    console.log(`✅ Pulizia completata. Utenti attivi: ${Object.keys(userCardData).length}`);
}, 12 * 60 * 60 * 1000);

// Quando l'utente scrive un nome di una carta
bot.on('text', (ctx) => {
    const cardName = ctx.message.text;
    searchCard(ctx, cardName);
});

// Gestione degli errori globale
bot.catch((err, ctx) => {
    console.error(`Errore per ${ctx.updateType}:`, err);
    ctx.reply('❌ Si è verificato un errore interno. Riprova più tardi.');
});

// Avvia il bot
bot.launch().then(() => {
    console.log('✅ Bot avviato con successo!');
}).catch(err => {
    console.error('❌ Errore nell\'avvio del bot:', err);
});

// Gestione della chiusura
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));