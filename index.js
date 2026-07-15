require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// --- 1. Міні-сервер для Render (Щоб не було помилки портів) ---
const app = express();
app.get('/', (req, res) => res.send('L2 Production Bot is LIVE!'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Web-сервер запущено на порту ${PORT} (Render задоволений)`);
});

// --- 2. Ініціалізація Бота ---
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "738066424";

console.log("🚀 Telegram-бот запущено в режимі Polling");

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
    txt = "🏠 Очікуйте налаштування вашого профілю.";
  }
  bot.sendMessage(chatId, txt, { parse_mode: 'Markdown', reply_markup: { keyboard: keyboard, resize_keyboard: true } });
}

// --- ГОЛОВНА ЛОГІКА ---
bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text ? msg.text.trim() : '';
  if (!text) return;

  try {
    const { data: workers, error: fetchError } = await supabase.from('workers').select('*').eq('chat_id', chatId);
    if (fetchError) throw fetchError;
    let user = workers && workers.length > 0 ? workers[0] : null;

    // Реєстрація
    if (!user) {
      if (text.startsWith('/start') || text.length < 3) return bot.sendMessage(chatId, "👋 **Вітаємо!** Напишіть своє **Прізвище та Ім'я** для реєстрації:", { parse_mode: 'Markdown' });
      const { error: insertError } = await supabase.from('workers').insert([{ name: text, dept: 'Інше', chat_id: chatId, status: 'Очікує' }]);
      if (insertError) return bot.sendMessage(chatId, `❌ **Помилка БД:** ${insertError.message}`);
      return bot.sendMessage(chatId, "⏳ **Заявку надіслано!**");
    }

    if (user.status === 'Очікує') return bot.sendMessage(chatId, "⏳ Акаунт на перевірці.");

    let state = states[chatId];
    if (text === "/start" || text === "🔙 Головне меню" || text === "❌ Скасувати") {
      delete states[chatId]; return sendMenuByDept(chatId, user.dept);
    }

    const dpt = user.dept.toLowerCase();

    // Адмін
    if (dpt === "адмін" && text === "📢 Надіслати Оголошення") {
      states[chatId] = { step: "WAIT_BROADCAST" };
      return bot.sendMessage(chatId, "📝 Введіть текст оголошення:", { reply_markup: { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true } });
    }
    if (dpt === "адмін" && state && state.step === "WAIT_BROADCAST") {
      const { data: allWorkers } = await supabase.from('workers').select('chat_id').eq('status', 'Активний');
      if (allWorkers) allWorkers.forEach(w => { if (w.chat_id !== chatId) bot.sendMessage(w.chat_id, `📢 **ОГОЛОШЕННЯ:**\n\n${text}`); });
      delete states[chatId]; return sendMenuByDept(chatId, user.dept);
    }

    // Зварка
    if (dpt === "зварка" && text === "📝 Здати роботу") {
      const { data: models } = await supabase.from('active_models').select('model');
      if (!models || models.length===0) return bot.sendMessage(chatId, "🤷‍♂️ Каталог порожній.");
      states[chatId] = { step: "WELDER_MODEL" };
      return bot.sendMessage(chatId, "🔋 **Оберіть збірку:**", { reply_markup: { keyboard: buildKeyboard(models.map(m=>m.model), 1), resize_keyboard: true } });
    }
    if (dpt === "зварка" && state && state.step === "WELDER_MODEL") {
      states[chatId] = { step: "WELDER_COUNT", model: text };
      return bot.sendMessage(chatId, `🔢 Введіть кількість (шт) для **${text}**:`, { reply_markup: { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true } });
    }
    if (dpt === "зварка" && state && state.step === "WELDER_COUNT") {
      let count = parseInt(text); if (isNaN(count) || count <= 0) return bot.sendMessage(chatId, "⚠️ Введіть число.");
      let today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
      await supabase.from('reports_zvarka').insert([{ date: today, name: user.name, dept: user.dept, config: state.model, count: count, status: "Працював" }]);
      delete states[chatId]; bot.sendMessage(chatId, `🎉 **Збережено:** ${state.model} — ${count} шт.`);
      return sendMenuByDept(chatId, user.dept);
    }

    // Запаковка (Кошик)
    if (dpt === "запаковка" && text === "🛒 Забрати акуми") {
      const { data: solderers } = await supabase.from('workers').select('*').eq('dept', 'Пайка').eq('status', 'Активний');
      states[chatId] = { step: "PACK_SOLDERER", solderers: solderers };
      return bot.sendMessage(chatId, "👥 Оберіть **Пайщика**:", { reply_markup: { keyboard: buildKeyboard(solderers.map(s=>s.name), 2), resize_keyboard: true } });
    }
    if (dpt === "запаковка" && state && state.step === "PACK_SOLDERER") {
      let selected = state.solderers.find(s => s.name === text);
      const { data: models } = await supabase.from('active_models').select('model');
      states[chatId] = { step: "PACK_MODEL", sName: selected.name, sChatId: selected.chat_id };
      return bot.sendMessage(chatId, `🔋 Оберіть модель:`, { reply_markup: { keyboard: buildKeyboard(models.map(m=>m.model), 1), resize_keyboard: true } });
    }
    if (dpt === "запаковка" && state && state.step === "PACK_MODEL") {
      states[chatId].step = "PACK_COUNT"; states[chatId].model = text;
      return bot.sendMessage(chatId, `🔢 Введіть кількість:`, { reply_markup: { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true } });
    }
    if (dpt === "запаковка" && state && state.step === "PACK_COUNT") {
      let count = parseInt(text);
      let timeNow = new Date().toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' });
      if(!shiftCarts[chatId]) shiftCarts[chatId] = [];
      shiftCarts[chatId].push({ time: timeNow, sName: state.sName, sChatId: state.sChatId, model: state.model, count: count });
      delete states[chatId]; bot.sendMessage(chatId, `📥 **Додано!** ${state.model} (${count} шт)`);
      return sendMenuByDept(chatId, user.dept);
    }

    if (dpt === "запаковка" && text === "🏁 Закрити зміну") {
      let cart = shiftCarts[chatId]; if (!cart || cart.length === 0) return bot.sendMessage(chatId, "🤷‍♂️ Кошик порожній.");
      let bySolderer = {};
      cart.forEach(item => { if (!bySolderer[item.sChatId]) bySolderer[item.sChatId] = { name: item.sName, items: [] }; bySolderer[item.sChatId].items.push(item); });
      
      for (let sChatId in bySolderer) {
        let batchId = "B" + Date.now().toString().slice(-6); 
        disputeBatches[batchId] = { pName: user.name, pChatId: chatId, sName: bySolderer[sChatId].name, items: bySolderer[sChatId].items };
        let msg = `🕒 **ЗВІТ** від **${user.name}**\n\n`;
        bySolderer[sChatId].items.forEach(it => { msg += `🔹 [${it.time}] — ${it.model} — **${it.count} шт**\n`; });
        bot.sendMessage(sChatId, msg, { reply_markup: { inline_keyboard: [[{ text: "✅ ПІДТВЕРДИТИ", callback_data: `CONFIRM|${batchId}` }]] }});
      }
      delete shiftCarts[chatId]; bot.sendMessage(chatId, "🏁 Зміну закрито. Чекаємо підтверджень."); return sendMenuByDept(chatId, user.dept);
    }

    if (text === "📊 Моя статистика") return bot.sendMessage(chatId, "👷‍♂️ Розділ статистики доступний в адмін-панелі.");

  } catch (error) { console.error(error); }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id; const msgId = query.message.message_id; const data = query.data;
  let parts = data.split("|"); let bId = parts[1]; let batch = disputeBatches[bId];
  if (!batch) return bot.editMessageText("⚠️ Звіт вже оброблений.", { chat_id: chatId, message_id: msgId });

  let today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
  for (let it of batch.items) {
    await supabase.from('reports_payka').insert([{ date: today, solderer_name: batch.sName, config: it.model, count: it.count, status: "Працював" }]);
    await supabase.from('reports_zapakovka').insert([{ date: today, packager_name: batch.pName, config: it.model, count: it.count, status: "Працював" }]);
  }
  bot.editMessageText(`✅ **ПІДТВЕРДЖЕНО**`, { chat_id: chatId, message_id: msgId });
  bot.sendMessage(batch.pChatId, `✅ **${batch.sName}** підтвердив звіт!`);
  delete disputeBatches[bId];
});