const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// === 🔑 ТВОЇ КЛЮЧІ ===
const TELEGRAM_TOKEN = '8632082763:-bT7Vj_B1yKZsGge6JHBiTpVXjrnOs8';
const SUPABASE_URL = 'https://miotyurbyfhrkepqdmvv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pb3R5dXJieWZocmtlcHFkbXZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MjA2MTYsImV4cCI6MjA5OTQ5NjYxNn0.rEP9D65nAvA5_iQW47XKr2veQBesYjIZdbczJUuvHQY';
const ADMIN_CHAT_ID = '738066424';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// === 1. ЗАПУСК ВЕБ-СЕРВЕРА ===
const app = express();
app.get('/', (req, res) => res.send('L2 ERP Bot Status: ACTIVE 🚀'));
app.listen(process.env.PORT || 10000, '0.0.0.0', () => console.log('✅ Web-сервер запущено'));

// Відв'язка старого Google-бота
fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteWebhook`).catch(()=>{});

// === 2. ФУНКЦІЇ ДЛЯ ТЕЛЕГРАМУ (БЕЗ БІБЛІОТЕК) ===
async function tg(method, payload) {
    try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await res.json();
    } catch(e) { console.error(`Помилка API:`, e); }
}

async function sendMessage(chat_id, text, reply_markup = null) {
    let payload = { chat_id, text, parse_mode: 'Markdown' };
    if(reply_markup) payload.reply_markup = reply_markup;
    return await tg('sendMessage', payload);
}

async function editMessageText(chat_id, message_id, text, reply_markup = null) {
    let payload = { chat_id, message_id, text, parse_mode: 'Markdown' };
    if(reply_markup) payload.reply_markup = reply_markup;
    return await tg('editMessageText', payload);
}

// === 3. ЗБЕРЕЖЕННЯ СТАНУ ===
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
    return { keyboard: kb, resize_keyboard: true };
}

async function sendMenuByDept(chatId, dept) {
    let dpt = dept.toLowerCase(); let txt = ""; let markup = null;
    
    if (dpt === "запаковка") {
        txt = "📦 **МЕНЮ ЗАПАКОВЩИКА**\n\n🔹 `🛒 Забрати акуми` — внести отримані деталі.\n🔹 `🏁 Закрити зміну` — надіслати чеки Пайщикам.";
        markup = { keyboard: [[{ text: "🛒 Забрати акуми" }, { text: "🏁 Закрити зміну" }]], resize_keyboard: true };
    } else if (dpt === "пайка") {
        txt = "🔥 **МЕНЮ ПАЙЩИКА**\n\nЗапаковщик сам фіксує деталі. Чекайте на вечірній звіт для підтвердження.";
        markup = { keyboard: [[{ text: "ℹ️ Довідка" }]], resize_keyboard: true };
    } else if (dpt === "зварка") {
        txt = "⚡ **МЕНЮ ЗВАРЮВАЛЬНИКА**\n\nТисніть 'Здати роботу', щоб внести виготовлені збірки.";
        markup = { keyboard: [[{ text: "📝 Здати роботу" }]], resize_keyboard: true };
    } else if (dpt === "адмін") {
        txt = "👑 **МЕНЮ АДМІНІСТРАТОРА**\n\nКерування здійснюється через веб-панель.";
        markup = { keyboard: [[{ text: "📢 Надіслати Оголошення" }]], resize_keyboard: true };
    } else {
        txt = "🏠 Очікуйте налаштування вашого профілю адміністратором.";
        markup = { keyboard: [[{ text: "ℹ️ Довідка" }]], resize_keyboard: true };
    }
    await sendMessage(chatId, txt, markup);
}

// === 4. ОБРОБКА ПОВІДОМЛЕНЬ ===
async function handleMessage(msg) {
    const chatId = msg.chat.id.toString();
    const text = msg.text ? msg.text.trim() : '';
    if (!text) return;

    const { data: workers } = await supabase.from('workers').select('*').eq('chat_id', chatId);
    let user = workers && workers.length > 0 ? workers[0] : null;

    if (!user) {
        if (text === '/start') return sendMessage(chatId, "👋 **Вітаємо!**\n\n✍️ Напишіть своє **Прізвище та Ім'я** для реєстрації:");
        await supabase.from('workers').insert([{ name: text, dept: 'Інше', chat_id: chatId, status: 'Очікує' }]);
        return sendMessage(chatId, "⏳ **Заявку надіслано!**\nОчікуйте допуску від адміністратора.");
    }

    if (user.status === 'Очікує') return sendMessage(chatId, "⏳ Акаунт перевіряється.");

    let state = states[chatId];
    if (text === "/start" || text === "🔙 Головне меню" || text === "❌ Скасувати" || text === "ℹ️ Довідка") {
        delete states[chatId];
        return sendMenuByDept(chatId, user.dept);
    }

    const dpt = user.dept.toLowerCase();

    // АДМІН: Оголошення
    if (dpt === "адмін" && text === "📢 Надіслати Оголошення") {
        states[chatId] = { step: "WAIT_BROADCAST" };
        return sendMessage(chatId, "📝 Введіть текст оголошення:", { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true });
    }
    if (dpt === "адмін" && state && state.step === "WAIT_BROADCAST") {
        const { data: all } = await supabase.from('workers').select('chat_id').eq('status', 'Активний');
        if (all) all.forEach(w => { if (w.chat_id !== chatId) sendMessage(w.chat_id, `📢 **ОГОЛОШЕННЯ:**\n\n${text}`); });
        delete states[chatId];
        await sendMessage(chatId, "✅ Оголошення надіслано.");
        return sendMenuByDept(chatId, user.dept);
    }

    // ЗВАРКА
    if (dpt === "зварка" && text === "📝 Здати роботу") {
        const { data: models } = await supabase.from('active_models').select('model');
        if (!models || models.length===0) return sendMessage(chatId, "🤷‍♂️ Каталог зміни порожній.");
        states[chatId] = { step: "WELDER_MODEL" };
        return sendMessage(chatId, "🔋 **Оберіть збірку:**", buildKeyboard(models.map(m=>m.model), 1));
    }
    if (dpt === "зварка" && state && state.step === "WELDER_MODEL") {
        states[chatId] = { step: "WELDER_COUNT", model: text };
        return sendMessage(chatId, `🔢 Введіть кількість (шт) для **${text}**:`, { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true });
    }
    if (dpt === "зварка" && state && state.step === "WELDER_COUNT") {
        let count = parseInt(text); if (isNaN(count) || count <= 0) return sendMessage(chatId, "⚠️ Введіть число.");
        let today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
        await supabase.from('reports_zvarka').insert([{ date: today, name: user.name, dept: user.dept, config: state.model, count: count, status: "Працював" }]);
        delete states[chatId]; await sendMessage(chatId, `🎉 **Збережено:** ${state.model} — ${count} шт.`);
        return sendMenuByDept(chatId, user.dept);
    }

    // ЗАПАКОВКА
    if (dpt === "запаковка" && text === "🛒 Забрати акуми") {
        const { data: solderers } = await supabase.from('workers').select('*').eq('dept', 'Пайка').eq('status', 'Активний');
        if (!solderers || solderers.length === 0) return sendMessage(chatId, "❌ Немає пайщиків у базі.");
        states[chatId] = { step: "PACK_SOLDERER", solderers: solderers };
        return sendMessage(chatId, "👥 Оберіть **Пайщика**:", buildKeyboard(solderers.map(s=>s.name), 2));
    }
    if (dpt === "запаковка" && state && state.step === "PACK_SOLDERER") {
        let selected = state.solderers.find(s => s.name === text);
        if (!selected) return sendMessage(chatId, "⚠️ Оберіть з клавіатури.");
        const { data: models } = await supabase.from('active_models').select('model');
        states[chatId] = { step: "PACK_MODEL", sName: selected.name, sChatId: selected.chat_id };
        return sendMessage(chatId, `🔋 Оберіть збірку:`, buildKeyboard(models.map(m=>m.model), 1));
    }
    if (dpt === "запаковка" && state && state.step === "PACK_MODEL") {
        states[chatId].step = "PACK_COUNT"; states[chatId].model = text;
        return sendMessage(chatId, `🔢 Введіть кількість штук для **${text}**:`, { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true });
    }
    if (dpt === "запаковка" && state && state.step === "PACK_COUNT") {
        let count = parseInt(text); if (isNaN(count) || count <= 0) return sendMessage(chatId, "⚠️ Введіть число.");
        let timeNow = new Date().toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' });
        if(!shiftCarts[chatId]) shiftCarts[chatId] = [];
        shiftCarts[chatId].push({ time: timeNow, sName: state.sName, sChatId: state.sChatId, model: state.model, count: count });
        delete states[chatId]; await sendMessage(chatId, `📥 **Додано в кошик!**\n🕒 ${timeNow} | Від: ${state.sName} | ${state.model} (${count} шт)`);
        return sendMenuByDept(chatId, user.dept);
    }
    if (dpt === "запаковка" && text === "🏁 Закрити зміну") {
        let cart = shiftCarts[chatId]; if (!cart || cart.length === 0) return sendMessage(chatId, "🤷‍♂️ Кошик порожній.");
        let bySolderer = {};
        cart.forEach(item => { if (!bySolderer[item.sChatId]) bySolderer[item.sChatId] = { name: item.sName, items: [] }; bySolderer[item.sChatId].items.push(item); });
        
        for (let sChatId in bySolderer) {
            let bId = "B" + Date.now().toString().slice(-6); 
            disputeBatches[bId] = { pName: user.name, pChatId: chatId, sName: bySolderer[sChatId].name, items: bySolderer[sChatId].items };
            let msgText = `🕒 **ЗВЕДЕНИЙ ЗВІТ** від **${user.name}**\n\n`;
            bySolderer[sChatId].items.forEach(it => { msgText += `🔹 [${it.time}] — ${it.model} — **${it.count} шт**\n`; });
            await sendMessage(sChatId, msgText, { inline_keyboard: [[{ text: "✅ ПІДТВЕРДИТИ", callback_data: `CONFIRM|${bId}` }], [{ text: "❌ ОСКАРЖИТИ", callback_data: `DISPUTE|${bId}` }]] });
        }
        delete shiftCarts[chatId]; await sendMessage(chatId, "🏁 Зміну закрито. Чеки розіслано пайщикам.");
        return sendMenuByDept(chatId, user.dept);
    }

    // ОСКАРЖЕННЯ ВІД ПАЙЩИКА -> АДМІНУ
    if (state && state.step === "WAITING_REASON") {
        let batch = disputeBatches[state.batchId]; if(!batch) { delete states[chatId]; return sendMessage(chatId, "⚠️ Дані застаріли."); }
        let item = batch.items[state.itemIndex]; delete states[chatId];
        let alertMsg = `⚠️ **КОНФЛІКТ!**\n\n👨‍🏭 Пайщик: ${user.name}\n📦 Запаковщик: ${batch.pName}\n🔋 Збірка: ${item.model} (${item.count} шт)\n\n🛑 Причина: _${text}_`;
        await sendMessage(ADMIN_CHAT_ID, alertMsg);
        await sendMessage(batch.pChatId, `🛑 Пайщик ${user.name} оскаржив запис (${item.model})!\nПричина: _${text}_`);
        await sendMessage(chatId, "✅ Скаргу передано адміністратору.");
        return sendMenuByDept(chatId, user.dept);
    }
}

// === 5. ОБРОБКА ІНЛАЙН КНОПОК ===
async function handleCallbackQuery(query) {
    const chatId = query.message.chat.id.toString(); const msgId = query.message.message_id; const data = query.data;
    tg('answerCallbackQuery', { callback_query_id: query.id }).catch(()=>{});

    let parts = data.split("|"); let action = parts[0]; let bId = parts[1]; let idx = parts[2];
    let batch = disputeBatches[bId];
    if (!batch) return editMessageText(chatId, msgId, "⚠️ Звіт вже оброблений.");

    if (action === "CONFIRM") {
        let today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
        for (let it of batch.items) {
            await supabase.from('reports_payka').insert([{ date: today, name: batch.sName, dept: 'Пайка', config: it.model, count: it.count, status: "Працював" }]);
            await supabase.from('reports_zapakovka').insert([{ date: today, name: batch.pName, dept: 'Запаковка', config: it.model, count: it.count, status: "Працював" }]);
        }
        await editMessageText(chatId, msgId, `✅ **ЗВІТ ПІДТВЕРДЖЕНО**`);
        await sendMessage(batch.pChatId, `✅ Пайщик **${batch.sName}** підтвердив звіт!`);
        delete disputeBatches[bId];
    } 
    else if (action === "DISPUTE") {
        let inlineKb = batch.items.map((it, i) => [{ text: `❌ Оскаржити: ${it.model} (${it.count} шт)`, callback_data: `ITEMDISP|${bId}|${i}` }]);
        await editMessageText(chatId, msgId, "👇 **Оберіть запис для оскарження:**", { inline_keyboard: inlineKb });
    }
    else if (action === "ITEMDISP") {
        let item = batch.items[idx];
        await editMessageText(chatId, msgId, `🛑 Оскарження запису: **${item.model}** (${item.count} шт)`);
        states[chatId] = { step: "WAITING_REASON", batchId: bId, itemIndex: idx };
        await sendMessage(chatId, `✍️ Напишіть причину незгоди:`, { keyboard: [[{text: "❌ Скасувати"}]], resize_keyboard: true });
    }
}

// === 6. БЕЗПЕЧНИЙ POLLING ДЛЯ RENDER ===
let lastUpdateId = 0;
async function poll() {
    try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=50`);
        const data = await res.json();
        if (data.ok && data.result) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;
                if (update.message) await handleMessage(update.message);
                if (update.callback_query) await handleCallbackQuery(update.callback_query);
            }
        }
    } catch (e) {} 
    setTimeout(poll, 1000);
}

poll();