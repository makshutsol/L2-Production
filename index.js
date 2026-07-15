require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// === КЛЮЧІ ===
const TELEGRAM_TOKEN = '8632082763:-bT7Vj_B1yKZsGge6JHBiTpVXjrnOs8';
const SUPABASE_URL = 'https://miotyurbyfhrkepqdmvv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pb3R5dXJieWZocmtlcHFkbXZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MjA2MTYsImV4cCI6MjA5OTQ5NjYxNn0.rEP9D65nAvA5_iQW47XKr2veQBesYjIZdbczJUuvHQY';
const ADMIN_CHAT_ID = '738066424';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// === ЗАПУСК СЕРВЕРА (RENDER) ===
const app = express();
app.get('/', (req, res) => res.send('L2 Production ERP Bot is LIVE!'));
app.listen(10000, '0.0.0.0', () => console.log('✅ Web-сервер запущено'));

// === ІНІЦІАЛІЗАЦІЯ БОТА ===
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

bot.deleteWebHook().then(() => {
    console.log("✅ Старий вебхук видалено, бот працює через Polling");
});

// === ДАНІ ТА СТАН ===
const states = {}; 
const shiftCarts = {}; 
const disputeBatches = {};

function buildKeyboard(list, cols) {
    let kb = [];
    for (let i = 0; i < list.length; i += cols) {
        let row = [];
        for (let j = 0; j < cols && i + j < list.length; j++) row.push({ text: list[i + j] });
        kb.push(row);
    }
    kb.push([{ text: "❌ Скасувати" }]);
    return kb;
}

function sendMenuByDept(chatId, dept) {
    let keyboard = []; let dpt = dept.toLowerCase(); let txt = "";
    
    if (dpt === "запаковка") {
        keyboard = [[{ text: "🛒 Забрати акуми" }, { text: "🏁 Закрити зміну" }]];
        txt = "📦 **МЕНЮ ЗАПАКОВЩИКА**\n\nВносьте забрані деталі та обов'язково закривайте зміну в кінці дня.";
    } else if (dpt === "пайка") {
        keyboard = [[{ text: "ℹ️ Довідка" }]];
        txt = "🔥 **МЕНЮ ПАЙЩИКА**\n\nПрацюйте спокійно. В кінці зміни запаковщик надішле вам чек на підтвердження.";
    } else if (dpt === "зварка") {
        keyboard = [[{ text: "📝 Здати роботу" }]];
        txt = "⚡ **МЕНЮ ЗВАРЮВАЛЬНИКА**\n\nТисніть 'Здати роботу', щоб внести виготовлені збірки.";
    } else if (dpt === "адмін") {
        keyboard = [[{ text: "📢 Надіслати Оголошення" }]];
        txt = "👑 **МЕНЮ АДМІНІСТРАТОРА**\n\nКерування базою через веб-панель.";
    } else {
        keyboard = [[{ text: "ℹ️ Довідка" }]];
        txt = "🏠 Головне меню. Зачекайте налаштування профілю адміном.";
    }
    bot.sendMessage(chatId, txt, { parse_mode: 'Markdown', reply_markup: { keyboard: keyboard, resize_keyboard: true } });
}

// === ОБРОБКА ПОВІДОМЛЕНЬ ===
bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text ? msg.text.trim() : '';
    if (!text) return;

    try {
        const { data: workers, error } = await supabase.from('workers').select('*').eq('chat_id', chatId);
        if (error) throw error;
        let user = workers && workers.length > 0 ? workers[0] : null;

        // Реєстрація
        if (!user) {
            if (text === '/start' || text.length < 3) {
                return bot.sendMessage(chatId, "👋 **Вітаємо у системі L2!**\n\n✍️ Напишіть своє **Прізвище та Ім'я** для реєстрації:", { parse_mode: 'Markdown' });
            }
            const { error: insErr } = await supabase.from('workers').insert([{ name: text, dept: 'Інше', chat_id: chatId, status: 'Очікує' }]);
            if (insErr) return bot.sendMessage(chatId, `❌ Помилка БД: ${insErr.message}`);
            return bot.sendMessage(chatId, "⏳ **Заявку надіслано!**\nВаш акаунт перевіряється адміністратором.");
        }

        if (user.status === 'Очікує') return bot.sendMessage(chatId, "⏳ Ваш акаунт все ще на перевірці.");

        let state = states[chatId];
        if (text === "/start" || text === "🔙 Головне меню" || text === "❌ Скасувати" || text === "ℹ️ Довідка") {
            delete states[chatId];
            return sendMenuByDept(chatId, user.dept);
        }

        const dpt = user.dept.toLowerCase();

        // АДМІН: Оголошення
        if (dpt === "адмін" && text === "📢 Надіслати Оголошення") {
            states[chatId] = { step: "WAIT_BROADCAST" };
            return bot.sendMessage(chatId, "📝 Введіть текст оголошення для всіх працівників:", { reply_markup: { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true } });
        }
        if (dpt === "адмін" && state && state.step === "WAIT_BROADCAST") {
            const { data: allWorkers } = await supabase.from('workers').select('chat_id').eq('status', 'Активний');
            if (allWorkers) allWorkers.forEach(w => { if (w.chat_id !== chatId) bot.sendMessage(w.chat_id, `📢 **ОГОЛОШЕННЯ:**\n\n${text}`); });
            delete states[chatId];
            bot.sendMessage(chatId, "✅ Оголошення надіслано.");
            return sendMenuByDept(chatId, user.dept);
        }

        // ЗВАРКА
        if (dpt === "зварка" && text === "📝 Здати роботу") {
            const { data: models } = await supabase.from('active_models').select('model');
            if (!models || models.length===0) return bot.sendMessage(chatId, "🤷‍♂️ Каталог на сьогодні порожній. Адмін ще не додав збірки.");
            states[chatId] = { step: "WELDER_MODEL" };
            return bot.sendMessage(chatId, "🔋 **Оберіть збірку з каталогу:**", { reply_markup: { keyboard: buildKeyboard(models.map(m=>m.model), 1), resize_keyboard: true } });
        }
        if (dpt === "зварка" && state && state.step === "WELDER_MODEL") {
            states[chatId] = { step: "WELDER_COUNT", model: text };
            return bot.sendMessage(chatId, `🔢 Введіть кількість (шт) для **${text}**:`, { reply_markup: { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true } });
        }
        if (dpt === "зварка" && state && state.step === "WELDER_COUNT") {
            let count = parseInt(text); if (isNaN(count) || count <= 0) return bot.sendMessage(chatId, "⚠️ Введіть коректне число.");
            let today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
            await supabase.from('reports_zvarka').insert([{ date: today, name: user.name, dept: user.dept, config: state.model, count: count, status: "Працював" }]);
            delete states[chatId]; bot.sendMessage(chatId, `🎉 **Збережено:** ${state.model} — ${count} шт.`);
            return sendMenuByDept(chatId, user.dept);
        }

        // ЗАПАКОВКА
        if (dpt === "запаковка" && text === "🛒 Забрати акуми") {
            const { data: solderers } = await supabase.from('workers').select('*').eq('dept', 'Пайка').eq('status', 'Активний');
            if (!solderers || solderers.length === 0) return bot.sendMessage(chatId, "❌ Немає активних пайщиків у базі.");
            states[chatId] = { step: "PACK_SOLDERER", solderers: solderers };
            return bot.sendMessage(chatId, "👥 Оберіть **Пайщика** з якого забираєте:", { reply_markup: { keyboard: buildKeyboard(solderers.map(s=>s.name), 2), resize_keyboard: true } });
        }
        if (dpt === "запаковка" && state && state.step === "PACK_SOLDERER") {
            let selected = state.solderers.find(s => s.name === text);
            if (!selected) return bot.sendMessage(chatId, "⚠️ Оберіть пайщика з клавіатури.");
            const { data: models } = await supabase.from('active_models').select('model');
            if (!models || models.length === 0) return bot.sendMessage(chatId, "❌ Каталог на сьогодні порожній.");
            states[chatId] = { step: "PACK_MODEL", sName: selected.name, sChatId: selected.chat_id };
            return bot.sendMessage(chatId, `✅ Пайщик: **${selected.name}**\n🔋 Оберіть збірку з каталогу:`, { reply_markup: { keyboard: buildKeyboard(models.map(m=>m.model), 1), resize_keyboard: true } });
        }
        if (dpt === "запаковка" && state && state.step === "PACK_MODEL") {
            states[chatId].step = "PACK_COUNT"; states[chatId].model = text;
            return bot.sendMessage(chatId, `🔢 Введіть кількість штук для **${text}**:`, { reply_markup: { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true } });
        }
        if (dpt === "запаковка" && state && state.step === "PACK_COUNT") {
            let count = parseInt(text); if (isNaN(count) || count <= 0) return bot.sendMessage(chatId, "⚠️ Введіть коректне число.");
            let timeNow = new Date().toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' });
            if(!shiftCarts[chatId]) shiftCarts[chatId] = [];
            shiftCarts[chatId].push({ time: timeNow, sName: state.sName, sChatId: state.sChatId, model: state.model, count: count });
            delete states[chatId]; bot.sendMessage(chatId, `📥 **Додано в кошик!**\n🕒 ${timeNow} | Від: ${state.sName} | ${state.model} (${count} шт)`);
            return sendMenuByDept(chatId, user.dept);
        }
        if (dpt === "запаковка" && text === "🏁 Закрити зміну") {
            let cart = shiftCarts[chatId]; if (!cart || cart.length === 0) return bot.sendMessage(chatId, "🤷‍♂️ Ваш кошик порожній.");
            let bySolderer = {};
            cart.forEach(item => { if (!bySolderer[item.sChatId]) bySolderer[item.sChatId] = { name: item.sName, items: [] }; bySolderer[item.sChatId].items.push(item); });
            
            for (let sChatId in bySolderer) {
                let batchId = "B" + Date.now().toString().slice(-6); 
                disputeBatches[batchId] = { pName: user.name, pChatId: chatId, sName: bySolderer[sChatId].name, items: bySolderer[sChatId].items };
                let msgText = `🕒 **ЗВЕДЕНИЙ ЗВІТ ЗА ЗМІНУ**\nЗапаковщик: **${user.name}**\n--------------------------\n`;
                bySolderer[sChatId].items.forEach(it => { msgText += `🔹 [${it.time}] — ${it.model} — **${it.count} шт**\n`; });
                bot.sendMessage(sChatId, msgText, { reply_markup: { inline_keyboard: [[{ text: "✅ ПІДТВЕРДИТИ", callback_data: `CONFIRM|${batchId}` }], [{ text: "❌ ОСКАРЖИТИ", callback_data: `DISPUTE|${batchId}` }]] }});
            }
            delete shiftCarts[chatId]; bot.sendMessage(chatId, "🏁 Зміну закрито. Чеки розіслано пайщикам.");
            return sendMenuByDept(chatId, user.dept);
        }

        // ОСКАРЖЕННЯ (ВІД ПАЙЩИКА -> АДМІНУ)
        if (state && state.step === "WAITING_REASON") {
            let batch = disputeBatches[state.batchId]; if(!batch) { delete states[chatId]; return bot.sendMessage(chatId, "⚠️ Дані застаріли."); }
            let item = batch.items[state.itemIndex]; delete states[chatId];
            
            // Надсилаємо адміну
            let alertMsg = `⚠️ **КОНФЛІКТНА СИТУАЦІЯ!**\n\n👨‍🏭 **Пайщик:** ${user.name}\n📦 **Запаковщик:** ${batch.pName}\n🕒 **Час запису:** ${item.time}\n🔋 **Збірка:** ${item.model} (${item.count} шт)\n\n🛑 **СКАРГА ВІД ПАЙЩИКА:**\n_${text}_`;
            bot.sendMessage(ADMIN_CHAT_ID, alertMsg, { parse_mode: 'Markdown' });
            
            // Надсилаємо запаковщику
            bot.sendMessage(batch.pChatId, `🛑 **Увага! Пайщик ${user.name} оскаржив запис (${item.model} — ${item.count} шт)!**\nЙого коментар: _${text}_\nДані передано Адміністратору.`);
            
            bot.sendMessage(chatId, "✅ Скаргу передано адміністратору на розгляд.");
            return sendMenuByDept(chatId, user.dept);
        }

    } catch (error) {
        console.error("Помилка:", error);
    }
});

// === ОБРОБКА КНОПОК У ПАЙЩИКА ===
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id; const msgId = query.message.message_id; const data = query.data;
    bot.answerCallbackQuery(query.id).catch(()=>{});

    let parts = data.split("|"); let action = parts[0]; let bId = parts[1]; let idx = parts[2];
    let batch = disputeBatches[bId];
    if (!batch) return bot.editMessageText("⚠️ Звіт застарів або вже був оброблений.", { chat_id: chatId, message_id: msgId });

    if (action === "CONFIRM") {
        let today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
        for (let it of batch.items) {
            await supabase.from('reports_payka').insert([{ date: today, solderer_name: batch.sName, dept: 'Пайка', config: it.model, count: it.count, status: "Працював" }]);
            await supabase.from('reports_zapakovka').insert([{ date: today, packager_name: batch.pName, dept: 'Запаковка', config: it.model, count: it.count, status: "Працював" }]);
        }
        bot.editMessageText(`✅ **ЗВІТ УСПІШНО ПІДТВЕРДЖЕНО**\nВсі деталі записані в табель.`, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' });
        bot.sendMessage(batch.pChatId, `✅ Пайщик **${batch.sName}** підтвердив ваш чек!`);
        delete disputeBatches[bId];
    } 
    else if (action === "DISPUTE") {
        let inlineKb = batch.items.map((it, i) => [{ text: `❌ Оскаржити: ${it.model} (${it.count} шт)`, callback_data: `ITEMDISP|${bId}|${i}` }]);
        bot.editMessageText("👇 **Оберіть конкретний запис для оскарження:**", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: inlineKb } });
    }
    else if (action === "ITEMDISP") {
        let item = batch.items[idx];
        bot.editMessageText(`🛑 Оскарження запису: **${item.model}** (${item.count} шт)`, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' });
        states[chatId] = { step: "WAITING_REASON", batchId: bId, itemIndex: idx };
        bot.sendMessage(chatId, `✍️ Напишіть текстом, чому ви не згодні з цим записом:`, { reply_markup: { keyboard: [[{text: "❌ Скасувати"}]], resize_keyboard: true } });
    }
});