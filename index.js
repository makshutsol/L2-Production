require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// 1. ІНІЦІАЛІЗАЦІЯ
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "738066424";

// Веб-сервер (щоб Render не спав)
const app = express();
app.get('/', (req, res) => res.send('L2 Production Bot is LIVE!'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Веб-сервер запущено на порту ${PORT}`));

// Сховища пам'яті
const states = {}; 
const shiftCarts = {}; 
const disputeBatches = {}; 

// =========================================================
// 2. ДОПОМІЖНІ ФУНКЦІЇ
// =========================================================
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
    txt = "📦 **МЕНЮ ЗАПАКОВЩИКА**\n\n🔹 Тисніть `🛒 Забрати акуми`, щоб внести деталі.\n🔹 Обов'язково тисніть `🏁 Закрити зміну` ввечері, щоб звіти пішли пайщикам.";
  } else if (dpt === "пайка") {
    keyboard = [[{ text: "📊 Моя статистика" }]];
    txt = "🔥 **МЕНЮ ПАЙЩИКА**\n\nПрацюйте спокійно, вам нічого не потрібно вносити вручну! 🛠\n🔹 Запаковщик сам фіксує деталі, які забирає.\n🔹 В кінці зміни бот надішле загальний чек для перевірки.";
  } else if (dpt === "зварка") {
    keyboard = [[{ text: "📝 Здати роботу" }], [{ text: "📊 Моя статистика" }]];
    txt = "⚡ **МЕНЮ ЗВАРЮВАЛЬНИКА**\n\n🔹 Натисніть `📝 Здати роботу`, щоб обрати зроблені вами акумулятори.";
  } else if (dpt === "адмін") {
    keyboard = [[{ text: "📢 Надіслати Оголошення" }, { text: "📊 Моя статистика" }]];
    txt = "👑 **МЕНЮ АДМІНІСТРАТОРА L2**\n\n🔹 Управління базою здійснюється через Адмін-панель на сайті.";
  } else {
    keyboard = [[{ text: "📊 Моя статистика" }]];
    txt = "🏠 Головне меню.";
  }
  bot.sendMessage(chatId, txt, { parse_mode: 'Markdown', reply_markup: { keyboard: keyboard, resize_keyboard: true } });
}

// =========================================================
// 3. ГОЛОВНИЙ ОБРОБНИК ПОВІДОМЛЕНЬ
// =========================================================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text ? msg.text.trim() : '';
  if (!text) return;

  const { data: workers } = await supabase.from('workers').select('*').eq('chat_id', chatId);
  let user = workers && workers.length > 0 ? workers[0] : null;

  if (!user) {
    if (text.startsWith('/start') || text.length < 3) return bot.sendMessage(chatId, "👋 **Вітаємо у виробничій системі L2!**\n\n✍️ Будь ласка, напишіть своє **Прізвище та Ім'я** для реєстрації:", { parse_mode: 'Markdown' });
    await supabase.from('workers').insert([{ name: text, dept: 'Інше', chat_id: chatId, status: 'Очікує' }]);
    return bot.sendMessage(chatId, "⏳ **Заявку надіслано!**\n\nВаш акаунт перевіряється адміністратором.");
  }

  if (user.status === 'Очікує') return bot.sendMessage(chatId, "⏳ Ваш акаунт все ще знаходиться на перевірці.");

  let state = states[chatId];
  if (text === "/start" || text === "🔙 Головне меню" || text === "❌ Скасувати") {
    delete states[chatId];
    return sendMenuByDept(chatId, user.dept);
  }

  const dpt = user.dept.toLowerCase();

  // --- АДМІН ---
  if (dpt === "адмін" && text === "📢 Надіслати Оголошення") {
    states[chatId] = { step: "WAIT_BROADCAST" };
    return bot.sendMessage(chatId, "📝 **Режим розсилки**\n\nВведіть текст оголошення для всіх працівників:", { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true } });
  }
  if (dpt === "адмін" && state && state.step === "WAIT_BROADCAST") {
    const { data: allWorkers } = await supabase.from('workers').select('chat_id').eq('status', 'Активний');
    let count = 0;
    allWorkers.forEach(w => {
      if (w.chat_id !== chatId) { bot.sendMessage(w.chat_id, `📢 **ОГОЛОШЕННЯ ВІД АДМІНІСТРАЦІЇ:**\n\n${text}`, { parse_mode: 'Markdown' }); count++; }
    });
    delete states[chatId];
    bot.sendMessage(chatId, `✅ Оголошення успішно надіслано до ${count} працівників.`);
    return sendMenuByDept(chatId, user.dept);
  }

  // --- ЗВАРКА ---
  if (dpt === "зварка") {
    if (text === "📝 Здати роботу") {
      const { data: models } = await supabase.from('active_models').select('model');
      if (!models || models.length === 0) return bot.sendMessage(chatId, "🤷‍♂️ На сьогодні адміністратор ще не активував жодної збірки.");
      states[chatId] = { step: "WELDER_MODEL" };
      return bot.sendMessage(chatId, "🔋 **Оберіть збірку**, яку ви зварили:", { parse_mode: 'Markdown', reply_markup: { keyboard: buildKeyboard(models.map(m=>m.model), 1), resize_keyboard: true } });
    }
    if (state && state.step === "WELDER_MODEL") {
      states[chatId] = { step: "WELDER_COUNT", model: text };
      return bot.sendMessage(chatId, `✅ Збірка: **${text}**\n\n🔢 **Введіть кількість штук** (лише цифри):`, { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true } });
    }
    if (state && state.step === "WELDER_COUNT") {
      let count = parseInt(text);
      if (isNaN(count) || count <= 0) return bot.sendMessage(chatId, "⚠️ Введіть коректне число.");
      let today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
      await supabase.from('reports_zvarka').insert([{ date: today, name: user.name, dept: user.dept, config: state.model, count: count, status: "Працював" }]);
      delete states[chatId];
      bot.sendMessage(chatId, `🎉 **Звіт збережено!**\n🔋 ${state.model} — ${count} шт.`, { parse_mode: 'Markdown' });
      return sendMenuByDept(chatId, user.dept);
    }
  }

  // --- ЗАПАКОВКА (КОШИК) ---
  if (dpt === "запаковка") {
    if (text === "🛒 Забрати акуми") {
      const { data: solderers } = await supabase.from('workers').select('*').eq('dept', 'Пайка').eq('status', 'Активний');
      if (!solderers || solderers.length === 0) return bot.sendMessage(chatId, "❌ Наразі в базі немає активних пайщиків.");
      states[chatId] = { step: "PACK_SOLDERER", solderers: solderers };
      return bot.sendMessage(chatId, "👥 **Крок 1.** Оберіть **Пайщика**, у якого ви забрали акумулятори:", { parse_mode: 'Markdown', reply_markup: { keyboard: buildKeyboard(solderers.map(s=>s.name), 2), resize_keyboard: true } });
    }
    if (state && state.step === "PACK_SOLDERER") {
      let selected = state.solderers.find(s => s.name === text);
      if (!selected) return bot.sendMessage(chatId, "⚠️ Оберіть пайщика з клавіатури.");
      const { data: models } = await supabase.from('active_models').select('model');
      if (!models || models.length === 0) return bot.sendMessage(chatId, "❌ Каталог збірок на сьогодні порожній.");
      states[chatId] = { step: "PACK_MODEL", sName: selected.name, sChatId: selected.chat_id };
      return bot.sendMessage(chatId, `✅ Пайщик: **${selected.name}**\n\n🔋 **Крок 2.** Оберіть модель акумулятора:`, { parse_mode: 'Markdown', reply_markup: { keyboard: buildKeyboard(models.map(m=>m.model), 1), resize_keyboard: true } });
    }
    if (state && state.step === "PACK_MODEL") {
      states[chatId].step = "PACK_COUNT"; states[chatId].model = text;
      return bot.sendMessage(chatId, `✅ Модель: **${text}**\n\n🔢 **Крок 3.** Введіть кількість забраних штук:`, { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true } });
    }
    if (state && state.step === "PACK_COUNT") {
      let count = parseInt(text);
      if (isNaN(count) || count <= 0) return bot.sendMessage(chatId, "⚠️ Введіть коректне число.");
      let timeNow = new Date().toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' });
      if(!shiftCarts[chatId]) shiftCarts[chatId] = [];
      shiftCarts[chatId].push({ time: timeNow, sName: state.sName, sChatId: state.sChatId, model: state.model, count: count });
      delete states[chatId];
      bot.sendMessage(chatId, `📥 **Дані додано в кошик зміни!**\n\n🕒 ${timeNow} | Від: ${state.sName} | 📦 ${state.model} (${count} шт)`, { parse_mode: 'Markdown' });
      return sendMenuByDept(chatId, user.dept);
    }
    if (text === "🏁 Закрити зміну") {
      let cart = shiftCarts[chatId];
      if (!cart || cart.length === 0) return bot.sendMessage(chatId, "🤷‍♂️ Ви ще нічого не забрали сьогодні.");
      let bySolderer = {};
      cart.forEach(item => {
        if (!bySolderer[item.sChatId]) bySolderer[item.sChatId] = { name: item.sName, items: [] };
        bySolderer[item.sChatId].items.push(item);
      });
      for (let sChatId in bySolderer) {
        let batchId = "B" + Date.now().toString().slice(-6); 
        disputeBatches[batchId] = { pName: user.name, pChatId: chatId, sName: bySolderer[sChatId].name, items: bySolderer[sChatId].items };
        let msg = `🕒 **ЗВЕДЕНИЙ ЗВІТ ЗА ЗМІНУ**\nВід: **${user.name.toUpperCase()}**\n--------------------------\n`;
        let total = 0;
        bySolderer[sChatId].items.forEach(it => { msg += `🔹 [${it.time}] — ${it.model} — **${it.count} шт**\n`; total += it.count; });
        msg += `--------------------------\n📦 **Загалом передано:** ${total} шт.\n\n👀 Перевірте та підтвердіть:`;
        bot.sendMessage(sChatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
          [{ text: "✅ ПІДТВЕРДИТИ ВСЕ", callback_data: `CONFIRM|${batchId}` }],
          [{ text: "❌ ОСКАРЖИТИ ЗАПИС", callback_data: `DISPUTE|${batchId}` }]
        ]}});
      }
      delete shiftCarts[chatId];
      bot.sendMessage(chatId, "🏁 **Зміну офіційно закрито!**\nЗвіти розіслано Пайщикам для підтвердження.", { parse_mode: 'Markdown' });
      return sendMenuByDept(chatId, user.dept);
    }
  }

  // --- ОСКАРЖЕННЯ ---
  if (state && state.step === "WAIT_REASON") {
    let batch = disputeBatches[state.batchId];
    if(!batch) { delete states[chatId]; return bot.sendMessage(chatId, "⚠️ Дані застаріли."); }
    let item = batch.items[state.itemIdx];
    let alertMsg = `⚠️ **КОНФЛІКТНА СИТУАЦІЯ!**\n\n👨‍🏭 **Пайщик:** ${user.name}\n📦 **Запаковщик:** ${batch.pName}\n🕒 **Час:** ${item.time}\n🔋 **Збірка:** ${item.model} (${item.count} шт)\n\n🛑 **ПРИЧИНА СКАРГИ:**\n_${text}_`;
    bot.sendMessage(ADMIN_CHAT_ID, alertMsg, { parse_mode: 'Markdown' });
    bot.sendMessage(batch.pChatId, `🛑 **Увага! Пайщик ${user.name} оскаржив ваш запис за ${item.time} (${item.model})!**\n\nВказана причина: _${text}_`, { parse_mode: 'Markdown' });
    delete states[chatId];
    bot.sendMessage(chatId, "✅ **Скаргу зареєстровано.**\nДані передано адміністратору для вирішення суперечки.", { parse_mode: 'Markdown' });
    return sendMenuByDept(chatId, user.dept);
  }

  if (text === "📊 Моя статистика" || text === "📅 Сьогодні" || text === "🗓 За 7 днів" || text === "📈 За весь час") {
    bot.sendMessage(chatId, "👷‍♂️ Розділ статистики доступний в адмін-панелі.");
  }
});

// =========================================================
// 4. ОБРОБКА ІНЛАЙН КНОПОК
// =========================================================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;
  bot.answerCallbackQuery(query.id).catch(()=>{});

  let parts = data.split("|");
  let action = parts[0]; let bId = parts[1]; let idx = parts[2];
  let batch = disputeBatches[bId];

  if (!batch) return bot.editMessageText("⚠️ Звіт застарів або вже оброблений.", { chat_id: chatId, message_id: msgId });

  if (action === "CONFIRM") {
    let today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
    for (let it of batch.items) {
      await supabase.from('reports_payka').insert([{ date: today, name: batch.sName, dept: 'Пайка', config: it.model, count: it.count, status: "Працював" }]);
      await supabase.from('reports_zapakovka').insert([{ date: today, name: batch.pName, dept: 'Запаковка', config: it.model, count: it.count, status: "Працював" }]);
    }
    bot.editMessageText(`✅ **ЗВІТ УСПІШНО ПІДТВЕРДЖЕНО**\nВсі дані зараховано у статистику.`, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' });
    bot.sendMessage(batch.pChatId, `✅ Пайщик **${batch.sName}** підтвердив ваш звіт за зміну!`);
    delete disputeBatches[bId];
  } 
  else if (action === "DISPUTE") {
    let kbd = batch.items.map((it, i) => [{ text: `❌ Оскаржити: ${it.time} (${it.count} шт)`, callback_data: `ITEMDISP|${bId}|${i}` }]);
    bot.editMessageText("👇 **Оберіть конкретний запис**, з яким ви не згодні:", { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: kbd } });
  }
  else if (action === "ITEMDISP") {
    let item = batch.items[idx];
    bot.editMessageText(`🛑 **Процес оскарження:** Запис о ${item.time} (${item.model} — ${item.count} шт)`, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' });
    states[chatId] = { step: "WAIT_REASON", batchId: bId, itemIdx: idx };
    bot.sendMessage(chatId, `✍️ Напишіть текстом причину вашої незгоди:`, { reply_markup: { keyboard: [[{text: "❌ Скасувати"}]], resize_keyboard: true } });
  }
});