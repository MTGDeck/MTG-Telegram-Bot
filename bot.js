const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Token del bot da impostare come variabile d'ambiente BOT_TOKEN
const bot = new Telegraf(process.env.BOT_TOKEN || '7867515051:AAHzLtdIUHJ-yqvsCBR6WnGxbzrdgqTFhrs');

// Archivio per memorizzare temporaneamente i dati delle carte per utente
const userCardData = {};

// Configurazione statistiche
const STATS_FILE = path.join(__dirname, 'bot_stats.json');
let stats = {
  totalSearches: 0,
  uniqueUsers: {},
  topSearches: {},
  userSessions: {},
  lastReset: new Date().toISOString()
};

// Carica statistiche esistenti se disponibili
function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = fs.readFileSync(STATS_FILE, 'utf8');
      stats = JSON.parse(data);
      console.log('🔄 Statistiche caricate dal file');
    } else {
      saveStats(); // Crea il file se non esiste
      console.log('🆕 Nuovo file di statistiche creato');
    }
  } catch (error) {
    console.error('❌ Errore nel caricamento delle statistiche:', error);
  }
}

// Salva le statistiche su file
function saveStats() {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error('❌ Errore nel salvataggio delle statistiche:', error);
  }
}

// Aggiorna le statistiche per una ricerca
function trackSearch(userId, username, cardName) {
  // Incrementa contatore totale
  stats.totalSearches++;
  
  // Traccia utente unico
  const today = new Date().toISOString().split('T')[0];
  
  // Inizializza dati utente se non esistono
  if (!stats.uniqueUsers[userId]) {
    stats.uniqueUsers[userId] = {
      firstSeen: today,
      lastSeen: today,
      totalSearches: 0,
      username: username || `user_${userId}`
    };
  }
  
  // Aggiorna dati utente
  stats.uniqueUsers[userId].lastSeen = today;
  stats.uniqueUsers[userId].totalSearches++;
  if (username) {
    stats.uniqueUsers[userId].username = username;
  }
  
  // Traccia carta cercata
  if (!stats.topSearches[cardName]) {
    stats.topSearches[cardName] = 0;
  }
  stats.topSearches[cardName]++;
  
  // Sessione utente
  if (!stats.userSessions[today]) {
    stats.userSessions[today] = {};
  }
  stats.userSessions[today][userId] = true;
  
  // Salva le statistiche su file ogni 10 ricerche
  if (stats.totalSearches % 10 === 0) {
    saveStats();
  }
}

// Ottieni statistiche formattate per la visualizzazione
function getFormattedStats() {
  // Calcola utenti unici totali
  const totalUniqueUsers = Object.keys(stats.uniqueUsers).length;
  
  // Calcola utenti attivi negli ultimi 7 giorni
  const last7Days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    last7Days.push(date.toISOString().split('T')[0]);
  }
  
  let activeUsers7d = 0;
  const recentDays = Object.keys(stats.userSessions).filter(day => last7Days.includes(day));
  const activeUserSet = new Set();
  
  recentDays.forEach(day => {
    Object.keys(stats.userSessions[day] || {}).forEach(userId => {
      activeUserSet.add(userId);
    });
  });
  
  activeUsers7d = activeUserSet.size;
  
  // Ordina le ricerche più popolari
  const sortedSearches = Object.entries(stats.topSearches)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  // Formato il risultato
  return {
    totalSearches: stats.totalSearches,
    uniqueUsers: totalUniqueUsers,
    activeUsers7d: activeUsers7d,
    topSearches: sortedSearches,
    lastReset: stats.lastReset
  };
}

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

// Comando admin per vedere le statistiche
bot.command('stats', async (ctx) => {
  // Ottieni l'ID dell'utente
  const userId = ctx.from.id;
  
  // Lista di admin autorizzati (il tuo ID Telegram)
  const admins = [77417420]; // Sostituisci con il tuo ID Telegram
  
  // Verifica se l'utente è un admin
  if (!admins.includes(userId)) {
    return ctx.reply('❌ Non sei autorizzato ad utilizzare questo comando.');
  }
  
  // Ottieni statistiche formattate
  const formattedStats = getFormattedStats();
  
  // Crea messaggio di statistiche
  let statsMessage = `📊 *Statistiche Bot MTG*\n\n`;
  statsMessage += `• Totale ricerche: ${formattedStats.totalSearches}\n`;
  statsMessage += `• Utenti unici: ${formattedStats.uniqueUsers}\n`;
  statsMessage += `• Utenti attivi (7 giorni): ${formattedStats.activeUsers7d}\n\n`;
  
  statsMessage += `🔝 *Top 10 Carte Cercate*\n`;
  formattedStats.topSearches.forEach((search, index) => {
    statsMessage += `${index + 1}. "${search[0]}" - ${search[1]} ricerche\n`;
  });
  
  statsMessage += `\n⏱️ Ultimo reset: ${formattedStats.lastReset}`;
  
  // Invia messaggio delle statistiche
  ctx.reply(statsMessage, { parse_mode: 'Markdown' });
});

// Comando admin per resettare le statistiche
bot.command('resetstats', async (ctx) => {
  // Ottieni l'ID dell'utente
  const userId = ctx.from.id;
  
  // Lista di admin autorizzati (il tuo ID Telegram)
  const admins = [5347720595]; // Sostituisci con il tuo ID Telegram
  
  // Verifica se l'utente è un admin
  if (!admins.includes(userId)) {
    return ctx.reply('❌ Non sei autorizzato ad utilizzare questo comando.');
  }
  
  // Backup delle statistiche attuali
  const backupFile = path.join(__dirname, `bot_stats_backup_${new Date().toISOString().replace(/:/g, '-')}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(stats, null, 2));
  
  // Reset delle statistiche
  stats = {
    totalSearches: 0,
    uniqueUsers: {},
    topSearches: {},
    userSessions: {},
    lastReset: new Date().toISOString()
  };
  
  // Salva le statistiche resettate
  saveStats();
  
  // Conferma reset
  ctx.reply('✅ Statistiche resettate con successo. È stato creato un backup delle statistiche precedenti.');
});

// Funzione per cercare la carta su Scryfall (supporta italiano e inglese)
async function searchCard(ctx, cardName) {
    try {
        console.log(`🔍 Cercando: "${cardName}"`);
        
        let card = null;
        let allPrintings = [];
        
        // Step 1: Prima proviamo con la ricerca diretta fuzzy (funziona per nomi inglesi e alcuni italiani)
        try {
            console.log(`Provo ricerca diretta per: "${cardName}"`);
            const response = await axios.get(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`);
            card = response.data;
            
            // Se la carta è stata trovata, cerchiamo tutte le sue stampe
            const printingsResponse = await axios.get(`https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(card.name)}"&unique=prints`);
            allPrintings = printingsResponse.data.data;
            
            console.log(`✅ Carta trovata direttamente: ${card.name}`);
        } catch (error) {
            console.log(`❌ Ricerca diretta fallita per: "${cardName}". Proverò altre strategie...`);
        }
        
        // Step 2: Se la ricerca diretta fallisce, proviamo con la ricerca specifica in italiano
        if (!card) {
            try {
                console.log(`Provo ricerca in italiano per: "${cardName}"`);
                // Cerchiamo carte in italiano che corrispondono alla query
                const italianSearchUrl = `https://api.scryfall.com/cards/search?q=lang:it "${encodeURIComponent(cardName)}"`;
                console.log(`URL ricerca italiana: ${italianSearchUrl}`);
                
                const italianResponse = await axios.get(italianSearchUrl);
                
                if (italianResponse.data.data && italianResponse.data.data.length > 0) {
                    // Prendiamo la prima carta trovata in italiano
                    const italianCard = italianResponse.data.data[0];
                    console.log(`✅ Trovata carta in italiano: ${italianCard.printed_name || italianCard.name}`);
                    
                    // Otteniamo il nome inglese della carta
                    const englishName = italianCard.name; // Il campo 'name' contiene sempre il nome inglese
                    console.log(`🔄 Nome inglese della carta: "${englishName}"`);
                    
                    // Ora cerchiamo tutte le versioni con il nome inglese
                    const printingsResponse = await axios.get(`https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(englishName)}"&unique=prints`);
                    
                    // Impostiamo i risultati
                    card = italianCard;
                    allPrintings = printingsResponse.data.data;
                }
            } catch (error) {
                console.log(`❌ Ricerca in italiano fallita per: "${cardName}"`);
                console.error(error.response?.data || error.message);
            }
        }
        
        // Step 3: Se ancora non abbiamo trovato nulla, proviamo una ricerca più generica
        if (!card) {
            try {
                console.log(`Provo ricerca generica per: "${cardName}"`);
                // Cerchiamo in modo più generico (può trovare carte simili)
                const genericSearchUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(cardName)}`;
                console.log(`URL ricerca generica: ${genericSearchUrl}`);
                
                const genericResponse = await axios.get(genericSearchUrl);
                
                if (genericResponse.data.data && genericResponse.data.data.length > 0) {
                    // Prendiamo la prima carta trovata
                    card = genericResponse.data.data[0];
                    console.log(`✅ Trovata carta con ricerca generica: ${card.name}`);
                    
                    // Cerchiamo tutte le versioni
                    const printingsResponse = await axios.get(`https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(card.name)}"&unique=prints`);
                    allPrintings = printingsResponse.data.data;
                }
            } catch (error) {
                console.log(`❌ Ricerca generica fallita per: "${cardName}"`);
                console.error(error.response?.data || error.message);
            }
        }
        
        // Se abbiamo trovato la carta, mostriamola
        if (card && allPrintings.length > 0) {
            // Salviamo i dati della carta per questo utente
            const userId = ctx.from.id;
            userCardData[userId] = {
                card: card,
                allPrintings: allPrintings,
                currentPrintingIndex: 0,
                messageId: null, // Memorizzeremo l'ID del messaggio per aggiornarlo
                timestamp: Date.now() // Aggiungiamo timestamp per pulizia memoria
            };
            
            // Mostriamo la prima versione della carta
            await showCardVersion(ctx, userId, 0);
        } else {
            // Se non abbiamo trovato nulla, informiamo l'utente
            ctx.reply('❌ Carta non trovata. Prova a scrivere il nome corretto in italiano o inglese.');
        }
        
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
        userData.timestamp = Date.now();
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

// Quando l'utente scrive un nome di una carta
bot.on('text', (ctx) => {
    const cardName = ctx.message.text;
    const userId = ctx.from.id;
    const username = ctx.from.username;
    
    // Traccia la ricerca nelle statistiche
    trackSearch(userId, username, cardName);
    
    // Chiama la funzione di ricerca originale
    searchCard(ctx, cardName);
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

// Salva le statistiche periodicamente (ogni ora)
setInterval(() => {
    console.log('💾 Salvataggio periodico delle statistiche...');
    saveStats();
}, 60 * 60 * 1000);

// Gestione degli errori globale
bot.catch((err, ctx) => {
    console.error(`Errore per ${ctx.updateType}:`, err);
    ctx.reply('❌ Si è verificato un errore interno. Riprova più tardi.');
});

// Inizializza le statistiche all'avvio del bot
loadStats();

// Avvia il bot
bot.launch().then(() => {
    console.log('✅ Bot avviato con successo!');
}).catch(err => {
    console.error('❌ Errore nell\'avvio del bot:', err);
});

// Gestione della chiusura
process.once('SIGINT', () => {
    saveStats(); // Salva le statistiche prima di chiudere
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    saveStats(); // Salva le statistiche prima di chiudere
    bot.stop('SIGTERM');
});