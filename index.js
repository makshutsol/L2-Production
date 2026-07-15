const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// === 🔑 КОНФІГУРАЦІЯ СИСТЕМИ ===
const TELEGRAM_TOKEN = '8632082763:-bT7Vj_B1yKZsGge6JHBiTpVXjrnOs8';
const SUPABASE_URL = 'https://miotyurbyfhrkepqdmvv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pb3R5dXJieWZocmtlcHFkbXZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MjA2MTYsImV4cCI6MjA5OTQ5NjYxNn0.rEP9D65nAvA5_iQW47XKr2veQBesYjIZdbczJUuvHQY';
const ADMIN_CHAT_ID = '738066424';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// === 1. ЗАПУСК СЕРВЕРА ДЛЯ RENDER ===
const app = express();
app.get('/', (req, res) => res.send('L2 Production Bot is LIVE! 🚀'));
app.listen(10000, '0.0.0.0', () => console.log('✅ Веб-сервер успішно запущено на порту 10000'));

// === 2. АВТОВИДАЛЕННЯ СТАРОГО ВЕБХУКУ GOOGLE ===
fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteWebhook`)
    .then(res => res.json())
    .then(data => console.log('🧹 Синхронізація каналів зв\'язку:', data.description));

// === 3. СХОВИЩА ТА ДОВІДНИКИ ===
const states = {}; 
const shiftCarts = {}; 
const disputeBatches = {};
const DAYS_UA = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота"];

// Допоміжні функції HTTP API
async function api(method, params) {
    try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        return await res.json();
    } catch (e) { console.error(`Помилка API ${method}:`, e.message); }
}

async function sendMessage(chatId, text, options = {}) {
    return await api('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', ...options });
}

async function editMessageText(chatId, messageId, text, options = {}) {
    return await api('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown', ...options });
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
    txt = "📦 **МЕНЮ ЗАПАКОВЩИКА**\n\n🔹 Тисніть `🛒 Забрати акуми`, щоб внести передані вам деталі.\n🔹 Обов'язково тисніть `🏁 Закрити зміну` ввечері, щоб звіти пішли пайщикам для підтвердження.";
  } else if (dpt === "пайка") {
    keyboard = [[{ text: "📊 Моя статистика" }]];
    txt = "🔥 **МЕНЮ ПАЙЩИКА**\n\n Працюйте спокійно, вам нічого не потрібно вносити вручну! 🛠\n\n🔹 Запаковщик сам фіксує деталі, які забирає.\n🔹 В кінці зміни бот надішле загальний чек для перевірки та підтвердження.";
  } else if (dpt === "зварка") {
    keyboard = [[{ text: "📝 Здати роботу" }], [{ text: "📊 Моя статистика" }]];
    txt = "⚡ **МЕНЮ ЗВАРЮВАЛЬНИКА**\n\n🔹 Натисніть `📝 Здати роботу`, щоб обрати зроблені вами акумулятори із готового списку на сьогодні.";
  } else if (dpt === "адмін") {
    keyboard = [[{ text: "📢 Надіслати Оголошення" }, { text: "📊 Моя статистика" }]];
    txt = "👑 **МЕНЮ АДМІНІСТРАТОРА L2**\n\n🔹 Керування виробництвом, складом та перегляд графіків виконується через веб-панель.";
  } else {
    keyboard = [[{ text: "📊 Моя статистика" }]];
    txt = "🏠 Головне меню. Зачекайте, поки адміністратор призначить вам відділ у системі.";
  }
  await sendMessage(chatId, txt, { reply_markup: { keyboard: keyboard, resize_keyboard: true } });
}

// === 4. ОБРОБКА СТАТИСТИКИ ДЛЯ ПРАЦІВНИКІВ ===
async function sendStats(chatId, user, period) {
  let table = dpt === "пайка" ? "reports_payka" : (dpt === "запаковка" ? "reports_zapakovka" : "reports_zvarka");
  let periodText = period === "today" ? "за сьогодні" : (period === "week" ? "за останні 7 днів" : "за весь час");
  
  let todayObj = new Date(); let targetDate = new Date();
  if (period === "week") targetDate.setDate(todayObj.getDate() - 7);
  else if (period === "all") targetDate = new Date(2000, 0, 1);
  let todayStr = todayObj.toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });

  const { data } = await supabase.from(table).select('*').eq('name', user.name);
  if (!data || data.length === 0) return sendMessage(chatId, `🤷‍♂️ У вас немає записаної роботи ${periodText}.`);

  let historyByDate = {}; let grandTotalStats = {}; let grandTotalCount = 0;

  data.forEach(r => {
    let rowDateStr = r.date; let rowDateObj = new Date(rowDateStr);
    let include = (period === "today" && rowDateStr === todayStr) || (period !== "today" && rowDateObj >= targetDate);
    if (include) {
      let model = r.config || "Невідома збірка"; let count = parseInt(r.count || 0);
      if (count > 0) {
        grandTotalStats[model] = (grandTotalStats[model] || 0) + count; grandTotalCount += count;
        if (!historyByDate[rowDateStr]) historyByDate[rowDateStr] = { models: {}, dailyTotal: 0 };
        historyByDate[rowDateStr].models[model] = (historyByDate[rowDateStr].models[model] || 0) + count;
        historyByDate[rowDateStr].dailyTotal += count;
      }
    }
  });

  if (grandTotalCount === 0) return sendMessage(chatId, `🤷‍♂️ У вас немає записаної роботи ${periodText}.`);

  let msg = `📅 **Ваш звіт ${periodText}**\n➖➖➖➖➖➖➖➖➖➖\n`;
  if (period === "week" || period === "today") {
    let sortedDates = Object.keys(historyByDate).sort((a, b) => new Date(b) - new Date(a));
    sortedDates.forEach(dateStr => {
      let dObj = new Date(dateStr); let dayName = DAYS_UA[dObj.getDay()]; let formattedDate = dateStr.split('-').reverse().slice(0,2).join('.');
      msg += `📆 **${formattedDate} (${dayName})**\n`;
      for (let m in historyByDate[dateStr].models) msg += `▫️ ${m} — ${historyByDate[dateStr].models[m]} шт\n`;
      msg += `_*Всього за день: ${historyByDate[dateStr].dailyTotal} шт*_\n\n`;
    });
    msg += `➖➖➖➖➖➖➖➖➖➖\n📊 **ЗАГАЛЬНИЙ ПІДСУМОК:**\n`;
  } else msg += `📊 **ЗАГАЛЬНИЙ ПІДСУМОК:**\n`;

  for (let model in grandTotalStats) msg += `🔹 ${model}: ${grandTotalStats[model]} шт\n`;
  msg += `\n📦 **Всього зроблено: ${grandTotalCount} шт**`;
  await sendMessage(chatId, msg);
}

// === 5. ГОЛОВНИЙ ОБРОБНИК ПОВІДОМЛЕНЬ ===
async function handleMessage(msg) {
  const chatId = msg.chat.id.toString();
  const text = msg.text ? msg.text.trim() : '';
  if (!text) return;

  try {
    const { data: workers } = await supabase.from('workers').select('*').eq('chat_id', chatId);
    let user = workers && workers.length > 0 ? workers[0] : null;

    if (!user) {
      if (text === '/start' || text.length < 3) {
        return sendMessage(chatId, "👋 **Вітаємо у виробничій системі L2!**\n\n✍️ Будь ласка, напишіть своє **Прізвище та Ім'я** для реєстрації:");
      }
      await supabase.from('workers').insert([{ name: text, dept: 'Інше', chat_id: chatId, status: 'Очікує' }]);
      return sendMessage(chatId, "⏳ **Заявку надіслано!**\n\nВаш акаунт перевіряється адміністратором.");
    }

    if (user.status === 'Очікує') return sendMessage(chatId, "⏳ Ваш акаунт все ще знаходиться на перевірці.");

    let state = states[chatId];
    if (text === "/start" || text === "🔙 Головне меню" || text === "❌ Скасувати") {
      delete states[chatId]; return sendMenuByDept(chatId, user.dept);
    }

    // Меню статистики
    if (text === "📊 Моя статистика") {
      return sendMessage(chatId, "📈 **Перегляд статистики**\nОберіть період:", { reply_markup: { keyboard: [[{text: "📅 Сьогодні"}, {text: "🗓 За 7 днів"}], [{text: "📈 За весь час"}, {text: "🔙 Головне меню"}]], resize_keyboard: true } });
    }
    if (text === "📅 Сьогодні") return sendStats(chatId, user, "today");
    if (text === "🗓 За 7 днів") return sendStats(chatId, user, "week");
    if (text === "📈 За весь час") return sendStats(chatId, user, "all");

    const dpt = user.dept.toLowerCase();

    // --- ОГОЛОШЕННЯ АДМІНА ---
    if (dpt === "адмін" && text === "📢 Надіслати Оголошення") {
      states[chatId] = { step: "WAIT_BROADCAST" };
      return sendMessage(chatId, "📝 **Режим розсилки**\n\nВведіть текст оголошення для всіх працівників:", { reply_markup: { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true } });
    }
    if (dpt === "адмін" && state && state.step === "WAIT_BROADCAST") {
      const { data: allWorkers } = await supabase.from('workers').select('chat_id').eq('status', 'Активний');
      let counter = 0;
      if (allWorkers) {
        allWorkers.forEach(w => {
          if (w.chat_id !== chatId) { sendMessage(w.chat_id, `📢 **ОГОЛОШЕННЯ ВІД АДМІНІСТРАЦІЇ:**\n\n${text}`); counter++; }
        });
      }
      delete states[chatId];
      await sendMessage(chatId, `✅ Оголошення успішно надіслано до ${counter} працівників.`);
      return sendMenuByDept(chatId, user.dept);
    }

    // --- ЗВАРКА ---
    if (dpt === "зварка" && text === "📝 Здати роботу") {
      const { data: models } = await supabase.from('active_models').select('model');
      if (!models || models.length === 0) return sendMessage(chatId, "🤷‍♂️ На сьогодні адміністратор ще не активував жодної збірки.");
      states[chatId] = { step: "WELDER_MODEL" };
      return sendMessage(chatId, "🔋 **Оберіть збірку**, яку ви зварили:", { reply_markup: { keyboard: buildKeyboard(models.map(m=>m.model), 1), resize_keyboard: true } });
    }
    if (dpt === "зварка" && state && state.step === "WELDER_MODEL") {
      states[chatId] = { step: "WELDER_COUNT", model: text };
      return sendMessage(chatId, `✅ Збірка: **${text}**\n\n🔢 **Введіть кількість штук** (лише цифри):`, { reply_markup: { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true } });
    }
    if (dpt === "зварка" && state && state.step === "WELDER_COUNT") {
      let count = parseInt(text); if (isNaN(count) || count <= 0) return sendMessage(chatId, "⚠️ Введіть коректне число.");
      let today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
      await supabase.from('reports_zvarka').insert([{ date: today, name: user.name, dept: 'Зварка', config: state.model, count: count, status: "Працював" }]);
      delete states[chatId]; await sendMessage(chatId, `🎉 **Звіт збережено!**\n🔋 ${state.model} — ${count} шт.`);
      return sendMenuByDept(chatId, user.dept);
    }

    // --- ЗАПАКОВКА ---
    if (dpt === "запаковка" && text === "🛒 Забрати акуми") {
      const { data: solderers } = await supabase.from('workers').select('*').eq('dept', 'Пайка').eq('status', 'Активний');
      if (!solderers || solderers.length === 0) return sendMessage(chatId, "❌ Наразі в базі немає активних пайщиків.");
      states[chatId] = { step: "PACKAGER_SOLDERER", solderers };
      return sendMessage(chatId, "👥 **Крок 1.** Оберіть **Пайщика**, у якого ви забрали акумулятори:", { reply_markup: { keyboard: buildKeyboard(solderers.map(s=>s.name), 2), resize_keyboard: true } });
    }
    if (dpt === "запаковка" && state && state.step === "PACKAGER_SOLDERER") {
      let selected = state.solderers.find(s => s.name === text);
      if (!selected) return sendMessage(chatId, "⚠️ Будь ласка, оберіть пайщика з клавіатури.");
      const { data: models } = await supabase.from('active_models').select('model');
      if (!models || models.length === 0) return sendMessage(chatId, "❌ Каталог збірок на сьогодні порожній.");
      states[chatId] = { step: "PACKAGER_MODEL", soldererName: selected.name, soldererChatId: selected.chat_id };
      return sendMessage(chatId, `✅ Пайщик: **${selected.name}**\n\n🔋 **Крок 2.** Оберіть модель акумулятора:`, { reply_markup: { keyboard: buildKeyboard(models.map(m=>m.model), 1), resize_keyboard: true } });
    }
    if (dpt === "запаковка" && state && state.step === "PACKAGER_MODEL") {
      states[chatId].step = "PACKAGER_COUNT"; states[chatId].model = text;
      return sendMessage(chatId, `✅ Модель: **${text}**\n\n🔢 **Крок 3.** Введіть кількість забраних штук:`, { reply_markup: { keyboard: [[{ text: "❌ Скасувати" }]], resize_keyboard: true } });
    }
    if (dpt === "запаковка" && state && state.step === "PACKAGER_COUNT") {
      let count = parseInt(text); if (isNaN(count) || count <= 0) return sendMessage(chatId, "⚠️ Введіть коректне число.");
      let timeNow = new Date().toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' });
      if(!shiftCarts[chatId]) shiftCarts[chatId] = [];
      shiftCarts[chatId].push({ time: timeNow, soldererName: state.soldererName, soldererChatId: state.soldererChatId, model: state.model, count: count });
      delete states[chatId]; await sendMessage(chatId, `📥 **Дані додано в кошик зміни!**\n\n🕒 ${timeNow} | Від: ${state.soldererName} | 📦 ${state.model} (${count} шт)`);
      return sendMenuByDept(chatId, user.dept);
    }

    if (dpt === "запаковка" && text === "🏁 Закрити зміну") {
      let cart = shiftCarts[chatId]; if (!cart || cart.length === 0) return sendMessage(chatId, "🤷‍♂️ Ви ще нічого не забрали сьогодні.");
      let grouped = {};
      cart.forEach(it => { if (!grouped[it.soldererChatId]) grouped[it.soldererChatId] = { name: it.soldererName, items: [] }; grouped[it.soldererChatId].items.push(it); });
      
      for (let sChatId in grouped) {
        let bId = "B" + Date.now().toString().slice(-6) + Math.floor(Math.random()*100);
        disputeBatches[bId] = { packagerName: user.name, packagerChatId: chatId, soldererName: grouped[sChatId].name, items: grouped[sChatId].items };
        let reportMsg = `🕒 **ЗВЕДЕНИЙ ЗВІТ ЗА ЗМІНУ**\nВід: **${user.name.toUpperCase()}**\n--------------------------\n`;
        grouped[sChatId].items.forEach(it => { reportMsg += `🔹 [${it.time}] — ${it.model} — **${it.count} шт**\n`; });
        let total = grouped[sChatId].items.reduce((acc, current) => acc + current.count, 0);
        reportMsg += `--------------------------\n📦 **Загалом передано:** ${total} шт.\n\n👀 Перевірте та підтвердіть:`;
        await sendMessage(sChatId, reportMsg, { reply_markup: { inline_keyboard: [[{ text: "✅ ПІДТВЕРДИТИ ВСЕ", callback_data: `CONFIRM|${bId}` }], [{ text: "❌ ОСКАРЖИТИ ЗАПИС", callback_data: `DISPUTE|${bId}` }]] } });
      }
      delete shiftCarts[chatId]; await sendMessage(chatId, "🏁 **Зміну офіційно закрито!**\nЗвіти розіслано Пайщикам для підтвердження.");
      return sendMenuByDept(chatId, user.dept);
    }

    // --- СТАН: ПРИЧИНА ОСКАРЖЕННЯ ПАЙЩИКА ---
    if (state && state.step === "WAITING_REASON") {
      let batch = disputeBatches[state.batchId]; if(!batch) { delete states[chatId]; return sendMessage(chatId, "⚠️ Дані застаріли."); }
      let item = batch.items[state.itemIndex]; delete states[chatId];
      let alertMsg = `⚠️ **КОНФЛІКТНА СИТУАЦІЯ!**\n\n👨‍🏭 **Пайщик (оскаржує):** ${user.name}\n📦 **Запаковщик:** ${batch.packagerName}\n🕒 **Час:** ${item.time}\n🔋 **Збірка:** ${item.model} (${item.count} шт)\n\n🛑 **ПРИЧИНА СКАРГИ:**\n_${text}_`;
      await sendMessage(ADMIN_CHAT_ID, alertMsg);
      await sendMessage(batch.packagerChatId, `🛑 **Увага! Пайщик ${user.name} оскаржив ваш запис за ${item.time} (${item.model})!**\n\nВказана причина: _${text}_`);
      await sendMessage(chatId, "✅ **Вашу скаргу зареєстровано.**\nДані передано адміністратору для вирішення суперечки.");
      return sendMenuByDept(chatId, user.dept);
    }

  } catch (error) { console.error(error); }
}

async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id.toString(); const msgId = query.message.message_id; const data = query.data;
  api('answerCallbackQuery', { callback_query_id: query.id }).catch(()=>{});

  let parts = data.split("|"); let action = parts[0]; let bId = parts[1]; let idx = parts[2];
  let batch = disputeBatches[bId];
  if (!batch) return editMessageText(chatId, msgId, "⚠️ Звіт застарів або вже оброблений.");

  if (action === "CONFIRM") {
    let today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
    for (let it of batch.items) {
      await supabase.from('reports_payka').insert([{ date: today, name: batch.soldererName, dept: 'Пайка', config: it.model, count: it.count, status: "Працював" }]);
      await supabase.from('reports_zapakovka').insert([{ date: today, name: batch.packagerName, dept: 'Запаковка', config: it.model, count: it.count, status: "Працював" }]);
    }
    await editMessageText(chatId, msgId, `✅ **ЗВІТ УСПІШНО ПІДТВЕРДЖЕНО**\nВсі дані зараховано у статистику.`);
    await sendMessage(batch.packagerChatId, `✅ Пайщик **${batch.soldererName}** підтвердив ваш звіт за зміну!`);
    delete disputeBatches[bId];
  } 
  else if (action === "DISPUTE") {
    let inlineKeyboard = [];
    batch.items.forEach((it, i) => { inlineKeyboard.push([{ text: `❌ Оскаржити: ${it.time} (${it.count} шт)`, callback_data: `ITEMDISP|${bId}|${i}` }]); });
    await editMessageText(chatId, msgId, "👇 **Оберіть конкретний запис**, з яким ви не згодні:", { reply_markup: { inline_keyboard: inlineKeyboard } });
  }
  else if (action === "ITEMDISP") {
    let item = batch.items[idx];
    await editMessageText(chatId, msgId, `🛑 **Процес оскарження:** Запис о ${item.time} (${item.model} — ${item.count} шт)`);
    states[chatId] = { step: "WAITING_REASON", batchId: bId, itemIndex: idx };
    await sendMessage(chatId, `✍️ Напишіть текстом причину вашої незгоди:`, { reply_markup: { keyboard: [[{text: "❌ Скасувати"}]], resize_keyboard: true } });
  }
}

// Полінг
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

console.log("🚀 Повноцінну програму виробництва відновлено!");
poll();