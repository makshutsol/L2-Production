require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// 1. ПІДКЛЮЧЕННЯ ДО БАЗИ ТА ТЕЛЕГРАМУ
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.BOT_TOKEN);

const ADMIN_CHAT_ID = "738066424"; // Твій ID для сповіщень

// Тимчасова пам'ять для роботи бота (замінює PropertiesService з Google)
const states = {}; 
const shiftCarts = {}; 
const batches = {}; 
let activeModels = []; // Каталог на сьогодні

// 2. ДОПОМІЖНІ ФУНКЦІЇ ДЛЯ РОБОТИ З БАЗОЮ SUPABASE
async function getUser(chatId) {
    const { data, error } = await supabase.from('workers').select('*').eq('chat_id', chatId.toString()).single();
    if (error || !data) return null;
    return data;
}

async function getActiveWorkersByDept(dept) {
    const { data } = await supabase.from('workers').select('*').eq('status', 'Активний').ilike('dept', dept);
    return data || [];
}

async function getArchiveOptions() {
    const { data } = await supabase.from('archive_models').select('*');
    if (!data) return { configs: [], elements: [] };
    const configs = [...new Set(data.map(r => r.config).filter(Boolean))];
    const elements = [...new Set(data.map(r => r.element).filter(Boolean))];
    return { configs, elements };
}

// 3. МЕНЮ ДЛЯ ПРАЦІВНИКІВ
function sendMenuByDept(ctx, dept) {
    const dpt = dept.toLowerCase();
    if (dpt === "запаковка") {
        ctx.reply("📦 МЕНЮ ЗАПАКОВЩИКА", Markup.keyboard([
            ['🛒 Забрати акуми', '🏁 Закрити зміну'], ['📊 Моя статистика']
        ]).resize());
    } else if (dpt === "пайка") {
        ctx.reply("🔥 МЕНЮ ПАЙЩИКА", Markup.keyboard([['📊 Моя статистика']]).resize());
    } else if (dpt === "зварка") {
        ctx.reply("⚡ МЕНЮ ЗВАРЮВАЛЬНИКА", Markup.keyboard([['📝 Здати роботу'], ['📊 Моя статистика']]).resize());
    } else if (dpt === "адмін") {
        ctx.reply("👑 МЕНЮ АДМІНІСТРАТОРА", Markup.keyboard([
            ['➕ Додати збірку на зміну', '🧹 Очистити список дня'],
            ['📢 Надіслати Оголошення', '📊 Моя статистика']
        ]).resize());
    } else {
        ctx.reply("🏠 Головне меню.", Markup.keyboard([['📊 Моя статистика']]).resize());
    }
}

function buildKeyboard(list, cols) {
    let kb = [];
    for(let i = 0; i < list.length; i += cols) {
        kb.push(list.slice(i, i + cols));
    }
    kb.push(['❌ Скасувати']);
    return Markup.keyboard(kb).resize();
}

// 4. ОБРОБКА КОМАНДИ /start (Реєстрація)
bot.start(async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const user = await getUser(chatId);
    
    if (!user) {
        return ctx.reply("👋 Вітаємо у виробничій системі L2!\n\n✍️ Будь ласка, напишіть своє Прізвище та Ім'я для реєстрації (просто текстом):");
    }
    
    if (user.status === 'Очікує') {
        return ctx.reply("⏳ Ваш акаунт на перевірці. Очікуйте активації.");
    }
    
    states[chatId] = null; // скидаємо стан
    sendMenuByDept(ctx, user.dept);
});

// 5. ОБРОБКА ТЕКСТОВИХ ПОВІДОМЛЕНЬ
bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const text = ctx.message.text.trim();
    
    let user = await getUser(chatId);
    
    // Якщо користувача немає в базі - реєструємо
    if (!user) {
        const { error } = await supabase.from('workers').insert([{
            name: text, dept: "Невідомо", chat_id: chatId, status: "Очікує"
        }]);
        if (!error) ctx.reply("✅ Заявку надіслано адміністратору.");
        else ctx.reply("❌ Помилка реєстрації. Спробуйте ще раз.");
        return;
    }
    
    if (user.status === 'Очікує') return ctx.reply("⏳ Ваш акаунт на перевірці.");
    
    let state = states[chatId] || {};
    let dept = user.dept.toLowerCase();

    // Глобальні кнопки
    if (text === "🔙 Головне меню" || text === "❌ Скасувати") {
        states[chatId] = null;
        return sendMenuByDept(ctx, user.dept);
    }

    // --- АДМІН ---
    if (dept === "адмін") {
        if (text === "➕ Додати збірку на зміну") {
            let opt = await getArchiveOptions();
            states[chatId] = { step: "ADMIN_CONFIG" };
            return ctx.reply("🧱 Оберіть конфігурацію:", buildKeyboard(opt.configs, 2));
        }
        if (state.step === "ADMIN_CONFIG") {
            let opt = await getArchiveOptions();
            states[chatId] = { step: "ADMIN_ELEMENT", config: text };
            return ctx.reply(`✅ Обрано: ${text}\n\nОберіть елемент:`, buildKeyboard(opt.elements, 2));
        }
        if (state.step === "ADMIN_ELEMENT") {
            let fullModel = `${state.config} ${text}`;
            if (!activeModels.includes(fullModel)) activeModels.push(fullModel);
            states[chatId] = null;
            ctx.reply(`✅ Збірку додано в каталог: ${fullModel}`);
            return sendMenuByDept(ctx, user.dept);
        }
        if (text === "🧹 Очистити список дня") {
            activeModels = [];
            return ctx.reply("🧹 Каталог очищено.");
        }
    }

    // --- ЗВАРКА ---
    if (dept === "зварка") {
        if (text === "📝 Здати роботу") {
            if (activeModels.length === 0) return ctx.reply("🤷‍♂️ На сьогодні адміністратор ще не активував жодної збірки.");
            states[chatId] = { step: "WELDER_MODEL" };
            return ctx.reply("🔋 Оберіть збірку:", buildKeyboard(activeModels, 1));
        }
        if (state.step === "WELDER_MODEL") {
            states[chatId] = { step: "WELDER_COUNT", model: text };
            return ctx.reply("🔢 Введіть кількість штук:", Markup.keyboard([['❌ Скасувати']]).resize());
        }
        if (state.step === "WELDER_COUNT") {
            let count = parseInt(text);
            if (isNaN(count)) return ctx.reply("⚠️ Введіть коректне число.");
            
            const today = new Date().toISOString().split('T')[0];
            await supabase.from('reports_zvarka').insert([{
                date: today, name: user.name, dept: "Зварка", model: state.model, count: count, status: "Працював"
            }]);
            
            states[chatId] = null;
            ctx.reply(`🎉 Звіт збережено: ${state.model} — ${count} шт.`);
            return sendMenuByDept(ctx, user.dept);
        }
    }

    sendMenuByDept(ctx, user.dept);
});

// 6. ЗАПУСК БОТА
bot.telegram.deleteWebhook().then(() => {
    bot.launch().then(() => {
        console.log("✅ Бот успішно запущено на Node.js + Supabase!");
    }).catch(err => {
        console.error("❌ Помилка запуску:", err);
    });
});

// Зупинка бота при закритті програми
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));