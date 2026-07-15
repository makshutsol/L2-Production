const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// === 🔑 ТВОЇ КЛЮЧІ ===
// ВСТАВ СЮДИ НОВИЙ ТОКЕН З @BotFather МІЖ ОДИНАРНИМИ ЛАПКАМИ:
const TELEGRAM_TOKEN = '8632082763:AAHs-bT7Vj_B1yKZsGge6JHBiTpVXjrnOs8';
const SUPABASE_URL = 'https://miotyurbyfhrkepqdmvv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pb3R5dXJieWZocmtlcHFkbXZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MjA2MTYsImV4cCI6MjA5OTQ5NjYxNn0.rEP9D65nAvA5_iQW47XKr2veQBesYjIZdbczJUuvHQY';
const ADMIN_CHAT_ID = '738066424';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// === 1. ЗАПУСК ВЕБ-СЕРВЕРА (ДЛЯ RENDER) ===
const app = express();
app.get('/', (req, res) => res.send('L2 Production Bot is LIVE!'));
app.listen(10000, '0.0.0.0', () => console.log('✅ Web-сервер запущено на порту 10000'));

// === 2. ВБИВАЄМО СТАРИЙ GOOGLE SCRIPT ===
fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteWebhook`)
    .then(res => res.json())
    .then(data => {
        if(data.ok) console.log('✅ Старий Google-зв\'язок успішно знищено!');
        else console.log('⚠️ Статус токена:', data.description);
    });

// === 3. ПРЯМА РОБОТА З ТЕЛЕГРАМОМ (БЕЗ БІБЛІОТЕК) ===
const states = {}; 
const shiftCarts = {}; 
const disputeBatches = {};

async function sendMessage(chatId, text, options = {}) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown', ...options })
    });
}

async function editMessageText(text, options = {}) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, parse_mode: 'Markdown', ...options })
    });
}

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

async function sendMenuByDept(chatId, dept) {
  let keyboard = []; let dpt = dept.toLowerCase(); let txt = "";
  if (dpt === "запаковка") {
    keyboard = [[{ text: "🛒 Забрати акуми" }, { text: "🏁 Закрити зміну" }], [{ text: "📊 Моя статистика" }]];
    txt = "📦 **МЕНЮ ЗАПАКОВЩИКА**";
  } else if (dpt === "пайка") {
    keyboard = [[{ text: "📊 Моя статистика" }]];
    txt = "🔥 **МЕНЮ ПАЙЩИКА**\nЗапаковщик сам фіксує деталі.";
  } else if (dpt === "зварка") {
    keyboard = [[{ text: "📝 Здати роботу" }], [{ text: "📊 Моя статистика" }]];
    txt = "⚡ **МЕНЮ ЗВАРЮВАЛЬНИКА**";
  } else if (dpt === "адмін") {
    keyboard = [[{ text: "📢 Надіслати Оголошення" }]];
    txt = "👑 **МЕНЮ АДМІНІСТРАТОРА**";
  } else {
    keyboard = [[{ text: "📊 Моя статистика" }]];
    txt = "🏠 Очікуйте налаштування вашого профілю адміністратором.";
  }
  await sendMessage(chatId, txt, { reply_markup: { keyboard: keyboard, resize_keyboard: true } });
}

// === 4. ОБРОБКА ПОВІДОМЛЕНЬ ===
async function handleMessage(msg) {
  const chatId = msg.chat.id.toString();
  const text = msg.text ? msg.text.trim() : '';
  if (!text) return;

  try {
    const { data: workers, error: fetchError } = await supabase.from('workers').select('*').eq('chat_id', chatId);
    if (fetchError) throw fetchError;

    let user = workers && workers.length > 0 ? workers[0] : null;

    if (!user) {
      if (text === '/start') {
        return sendMessage(chatId, "👋 **Вітаємо у системі L2!**\n\n✍️ Напишіть своє **Прізвище та Ім'я** для реєстрації:");
      }
      
      const { error: insertError } = await supabase.from('workers').insert([{ name: text, dept: 'Інше', chat_id: chatId, status: 'Очікує' }]);
      if (insertError) {
          return sendMessage(chatId, `❌ **Помилка бази даних!**\n\nДеталі: _${insertError.message}_\n\n❗️ **Адміну:** Перевір у Supabase, чи є в таблиці 'workers' колонки: name, dept, chat_id, status.`);
      }
      return sendMessage(chatId, "⏳ **Заявку надіслано!**\nВаш акаунт перевіряється адміністратором.");
    }

    if (user.status === 'Очікує') return sendMessage(chatId, "⏳ Ваш акаунт все ще на перевірці.");

    let state = states[chatId];
    if (text === "/start" || text === "🔙 Головне меню" || text === "❌ Скасувати") {
      delete states[chatId];
      return sendMenuByDept(chatId, user.dept);
    }

    const dpt = user.dept.toLowerCase();

    if (dpt === "зварка" && text === "📝 Здати роботу") {
      const { data: models } = await supabase.from('active_models').select('model');
      if (!models || models.length===0) return sendMessage(chatId, "🤷‍♂️ Каталог порожній.");
      states[chatId] = { step: "WELDER_MODEL" };
      return sendMessage(chatId, "🔋 **Оберіть збірку:**", { reply_markup: { keyboard: buildKeyboard(models.map(m=>m.model), 1), resize_keyboard: true } });
    }
    if (dpt === "зварка" && state && state.step === "WELDER_MODEL") {
      states[chatId] = { step: "WELDER_COUNT", model: text };
      return sendMessage(chatId, `🔢 Введіть кількість (шт) для **${text}**:`, { reply_markup: { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true } });
    }
    if (dpt === "зварка" && state && state.step === "WELDER_COUNT") {
      let count = parseInt(text); if (isNaN(count) || count <= 0) return sendMessage(chatId, "⚠️ Введіть число.");
      let today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
      await supabase.from('reports_zvarka').insert([{ date: today, name: user.name, dept: user.dept, config: state.model, count: count, status: "Працював" }]);
      delete states[chatId]; sendMessage(chatId, `🎉 **Збережено:** ${state.model} — ${count} шт.`);
      return sendMenuByDept(chatId, user.dept);
    }

    if (dpt === "запаковка" && text === "🛒 Забрати акуми") {
      const { data: solderers } = await supabase.from('workers').select('*').eq('dept', 'Пайка').eq('status', 'Активний');
      states[chatId] = { step: "PACK_SOLDERER", solderers: solderers };
      return sendMessage(chatId, "👥 Оберіть **Пайщика**:", { reply_markup: { keyboard: buildKeyboard(solderers.map(s=>s.name), 2), resize_keyboard: true } });
    }
    if (dpt === "запаковка" && state && state.step === "PACK_SOLDERER") {
      let selected = state.solderers.find(s => s.name === text);
      if(!selected) return sendMessage(chatId, "Оберіть з клавіатури!");
      const { data: models } = await supabase.from('active_models').select('model');
      states[chatId] = { step: "PACK_MODEL", sName: selected.name, sChatId: selected.chat_id };
      return sendMessage(chatId, `🔋 Оберіть модель:`, { reply_markup: { keyboard: buildKeyboard(models.map(m=>m.model), 1), resize_keyboard: true } });
    }
    if (dpt === "запаковка" && state && state.step === "PACK_MODEL") {
      states[chatId].step = "PACK_COUNT"; states[chatId].model = text;
      return sendMessage(chatId, `🔢 Введіть кількість:`, { reply_markup: { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true } });
    }
    if (dpt === "запаковка" && state && state.step === "PACK_COUNT") {
      let count = parseInt(text);
      let timeNow = new Date().toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' });
      if(!shiftCarts[chatId]) shiftCarts[chatId] = [];
      shiftCarts[chatId].push({ time: timeNow, sName: state.sName, sChatId: state.sChatId, model: state.model, count: count });
      delete states[chatId]; sendMessage(chatId, `📥 **Додано!** ${state.model} (${count} шт)`);
      return sendMenuByDept(chatId, user.dept);
    }

    if (dpt === "запаковка" && text === "🏁 Закрити зміну") {
      let cart = shiftCarts[chatId]; if (!cart || cart.length === 0) return sendMessage(chatId, "🤷‍♂️ Кошик порожній.");
      let bySolderer = {};
      cart.forEach(item => { if (!bySolderer[item.sChatId]) bySolderer[item.sChatId] = { name: item.sName, items: [] }; bySolderer[item.sChatId].items.push(item); });
      
      for (let sChatId in bySolderer) {
        let batchId = "B" + Date.now().toString().slice(-6); 
        disputeBatches[batchId] = { pName: user.name, pChatId: chatId, sName: bySolderer[sChatId].name, items: bySolderer[sChatId].items };
        let msgText = `🕒 **ЗВІТ** від **${user.name}**\n\n`;
        bySolderer[sChatId].items.forEach(it => { msgText += `🔹 [${it.time}] — ${it.model} — **${it.count} шт**\n`; });
        sendMessage(sChatId, msgText, { reply_markup: { inline_keyboard: [[{ text: "✅ ПІДТВЕРДИТИ", callback_data: `CONFIRM|${batchId}` }]] }});
      }
      delete shiftCarts[chatId]; sendMessage(chatId, "🏁 Зміну закрито. Чекаємо підтверджень."); return sendMenuByDept(chatId, user.dept);
    }

    if (text === "📊 Моя статистика") return sendMessage(chatId, "👷‍♂️ Статистика доступна в адмін-панелі.");

  } catch (error) { console.error(error); }
}

async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id; const msgId = query.message.message_id; const data = query.data;
  fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: query.id }) }).catch(()=>{});

  let parts = data.split("|"); let action = parts[0]; let bId = parts[1]; let batch = disputeBatches[bId];
  if (!batch) return editMessageText("⚠️ Звіт вже оброблений.", { chat_id: chatId, message_id: msgId });

  if (action === "CONFIRM") {
    let today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
    for (let it of batch.items) {
      await supabase.from('reports_payka').insert([{ date: today, name: batch.sName, dept: 'Пайка', config: it.model, count: it.count, status: "Працював" }]);
      await supabase.from('reports_zapakovka').insert([{ date: today, name: batch.pName, dept: 'Запаковка', config: it.model, count: it.count, status: "Працював" }]);
    }
    editMessageText(`✅ **ПІДТВЕРДЖЕНО**`, { chat_id: chatId, message_id: msgId });
    sendMessage(batch.pChatId, `✅ **${batch.sName}** підтвердив звіт!`);
    delete disputeBatches[bId];
  }
}

// === 5. ПРЯМИЙ POLLING (З ЛОГАМИ ПОМИЛОК) ===
let lastUpdateId = 0;
async function poll() {
    try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=50`);
        const data = await res.json();
        
        if(res.ok && data.ok && data.result) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;
                if (update.message) await handleMessage(update.message);
                if (update.callback_query) await handleCallbackQuery(update.callback_query);
            }
        } else if (!data.ok) {
            console.error("❌ Телеграм каже, що токен помилковий:", data.description);
        }
    } catch (e) {
        console.error("Помилка мережі:", e.message);
    }
    setTimeout(poll, 1000);
}

console.log("🚀 Telegram Bot успішно запущено!");
poll();