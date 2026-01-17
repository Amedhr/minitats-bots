import TelegramBot from 'node-telegram-bot-api';
import OpenAI from 'openai';
import * as chrono from 'chrono-node';
import schedule from 'node-schedule';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import schedule from 'node-schedule';
dotenv.config();

const BASE = path.resolve('.');
const REMINDERS_FILE = path.join(BASE, 'reminders.json');
const STATUS_FILE = path.join(BASE, 'status.json');
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const WIFE_NAME = process.env.WIFE_NAME || 'amor';
const BOT_NAME = 'Minitats';
const FIVE_MIN = 5 * 60 * 1000;
const last = status.lastStart ? new Date(status.lastStart).getTime() : 0;
const nowTime = Date.now();

const isRestart = last && (nowTime - last) > FIVE_MIN;


if (!TELEGRAM_TOKEN) {
  console.error('⚠️ Por favor configura TELEGRAM_TOKEN en .env (obtenlo con @BotFather)');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// === MONITOREO Y ALERTAS ===
const USERS_FILE = path.join(BASE, 'users.json');

async function loadUsers() {
  try {
    const txt = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(txt || '[]');
  } catch {
    return [];
  }
}

async function saveUser(chatId) {
  const users = await loadUsers();
  if (!users.includes(chatId)) {
    users.push(chatId);
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
  }
}

async function alertAllUsers(message) {
  const users = await loadUsers();
  for (const id of users) {
    try {
      await bot.sendMessage(id, message);
    } catch (e) {
      console.error('No se pudo alertar a', id);
    }
  }
}
// ================= FIN MONITOREO =================

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// ================= FUNCIONES BASE =================
async function loadReminders() {
  try {
    const txt = await fs.readFile(REMINDERS_FILE, 'utf8');
    return JSON.parse(txt || '[]');
  } catch (e) {
    return [];
  }
}

async function saveReminders(arr) {
  await fs.writeFile(REMINDERS_FILE, JSON.stringify(arr, null, 2), 'utf8');
}

function scheduleReminder(rem) {
  const when = new Date(rem.date);
  if (when <= new Date()) return;
  schedule.scheduleJob(rem.id, when, async () => {
    try {
      await bot.sendMessage(
        rem.chatId,
        `⏰ *Recordatorio*: ${rem.text}\n\n💖 _Con cariño, ${BOT_NAME}_`,
        { parse_mode: 'Markdown' }
      );
      const arr = await loadReminders();
      const r = arr.find(x => x.id === rem.id);
      if (r) { r.sent = true; await saveReminders(arr); }
    } catch (err) {
      console.error('Error enviando reminder:', err);
    }
  });
}

// Al iniciar, reprogramar recordatorios pendientes
(async () => {
  const arr = await loadReminders();
  arr.filter(r => !r.sent).forEach(scheduleReminder);
  console.log(`Recordatorios cargados: ${arr.length}`);

    await alertAllUsers(
    '⚠️ Aviso: el asistente estuvo fuera de línea unos momentos, pero ya estoy de vuelta 💕'
  );
  
})();

// ================== FUNCIONES NUEVAS ==================
// 🗑️ Eliminar recordatorios por texto
async function deleteRemindersByText(chatId, text) {
  const arr = await loadReminders();
  const lowered = text.toLowerCase();

  const toDelete = arr.filter(
    r => r.chatId === chatId && r.text.toLowerCase().includes(lowered)
  );

  toDelete.forEach(r => {
    const job = schedule.scheduledJobs[r.id];
    if (job) job.cancel();
  });

  const filtered = arr.filter(
    r => !(r.chatId === chatId && r.text.toLowerCase().includes(lowered))
  );

  await saveReminders(filtered);
  return toDelete.length;
}


// ================== RESPUESTAS GENERADAS ==================
const CANNED_REPLIES = [
  `¡Hola ${WIFE_NAME}! 💕 Estoy aquí para acompañarte. ¿En qué te puedo ayudar hoy?`,
  `Eres increíble, recuerda respirar y darte un momento para ti. 🌸`,
  `¡Tú puedes! 💪 Cada paso cuenta — estoy contigo.`,
  `Si necesitas, puedo recordarte tus tareas o enviarte un mensaje de ánimo en cualquier momento. 💖`
];

function cannedReplyFor(text) {
  const low = text.toLowerCase();
  if (low.includes('cans') || low.includes('agot') || low.includes('fatiga')) {
    return `Siento que estás cansada 💗. Recuerda descansar un poquito, estás haciendo lo mejor que puedes. Estoy contigo.`;
  }
  if (low.includes('trist') || low.includes('deprim') || low.includes('mal')) {
    return `Lo siento que te sientas así 💖. Si quieres, cuéntame más o respira profundo conmigo: una vez... dos veces... 🌬️`;
  }
  if (low.includes('gracias') || low.includes('ok') || low.includes('perfecto')) {
    return `¡Con gusto! 💕 Me alegra ayudar.`;
  }
  return CANNED_REPLIES[Math.floor(Math.random() * CANNED_REPLIES.length)];
}

async function generateReply(text) {
  if (!openai) return cannedReplyFor(text);

  try {
    const resp = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: [
        { role: 'system', content: `Eres ${BOT_NAME}, una asistente cariñosa, positiva y empática. Respondes con cariño y siempre motivas a ${WIFE_NAME}. Mantén mensajes breves y cálidos.` },
        { role: 'user', content: text }
      ],
      temperature: 0.8,
      max_output_tokens: 400
    });

    if (resp.output_text) return resp.output_text;

    if (resp.output && Array.isArray(resp.output)) {
      return resp.output.map(o => o.content?.map(c => c.text || '').join('') || '').join('\n');
    }

    return JSON.stringify(resp);
  } catch (e) {
    console.error('Error OpenAI:', e);
    return cannedReplyFor(text);
  }
}

// ================== BOT PRINCIPAL ==================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
    await saveUser(chatId);
  if (!text) return;

  const low = text.toLowerCase();

  // ====== INICIO / AYUDA ======
  if (low === '/start') {
    return bot.sendMessage(chatId, `Hola 💖 Soy ${BOT_NAME}, tu asistente. Escribe "ayuda" para ver comandos.`);
  }

  if (low === 'ayuda' || low === '/help') {
    return bot.sendMessage(chatId,
      `Comandos:\n\n` +
      `• /recordatorio <texto con fecha>\n   Ej: /recordatorio Mañana a las 9 llamar al médico\n` +
      `• /misrecordatorios → lista tus recordatorios\n` +
      `• /borrar <texto> → elimina recordatorios que contengan ese texto\n\n` +
      `También puedes decir frases naturales como "borra el recordatorio del médico" 💕`
    );
  }

  // ====== AGREGAR RECORDATORIO ======
  if (low.startsWith('/recordatorio')) {
    const payload = text.replace(/^\/recordatorio\s*/i, '').trim();
    if (!payload) return bot.sendMessage(chatId, 'Escribe: /recordatorio mañana a las 9 llamar al médico');

    const parsed = chrono.parse(payload, new Date(), { forwardDate: true });
    if (!parsed || parsed.length === 0) {
      return bot.sendMessage(chatId, 'No pude entender la fecha. Prueba "mañana a las 9" o "25/10/2025 09:00".');
    }

    const date = parsed[0].start.date();
    const dateText = parsed[0].text;
    let reminderText = payload.replace(parsed[0].text, '').trim();
    if (!reminderText) reminderText = `Recordatorio (${dateText})`;

    const id = `r-${Date.now()}`;
    const rem = { id, chatId, date: date.toISOString(), text: reminderText, createdAt: new Date().toISOString(), sent: false };
    const arr = await loadReminders();
    arr.push(rem);
    await saveReminders(arr);
    scheduleReminder(rem);
    return bot.sendMessage(chatId, `✅ Guardado para ${date.toLocaleString()}: ${reminderText}`);
  }

  // ====== LISTAR RECORDATORIOS ======
  if (low === '/misrecordatorios') {
    const arr = await loadReminders();
    const mine = arr.filter(r => r.chatId === chatId && !r.sent);
    if (mine.length === 0) return bot.sendMessage(chatId, 'No tienes recordatorios pendientes.');
    const list = mine.map(r => `• ${new Date(r.date).toLocaleString()} — ${r.text}`).join('\n');
    return bot.sendMessage(chatId, `🗓️ Tus recordatorios:\n${list}`);
  }

  // ====== ELIMINAR RECORDATORIOS ======
  if (low.startsWith('/borrar')) {
    const query = text.replace(/^\/borrar\s*/i, '').trim();
    if (!query) return bot.sendMessage(chatId, 'Por favor indica qué recordatorio quieres borrar. Ej: /borrar médico');
    const count = await deleteRemindersByText(chatId, query);
    if (count > 0) return bot.sendMessage(chatId, `🗑️ Eliminé ${count} recordatorio(s) que contenían "${query}".`);
    else return bot.sendMessage(chatId, `❌ No encontré ningún recordatorio con "${query}".`);
  }

  // ====== MODO NATURAL (borra/elimina sin comando) ======
  if (low.startsWith('borra') || low.startsWith('elimina')) {
    const words = text.split(' ');
    words.shift();
    const query = words.join(' ').trim();
    if (!query) return bot.sendMessage(chatId, '¿Qué recordatorio quieres eliminar? ❤️');
    const count = await deleteRemindersByText(chatId, query);
    if (count > 0) return bot.sendMessage(chatId, `🗑️ Eliminé ${count} recordatorio(s) que contenían "${query}".`);
    else return bot.sendMessage(chatId, `❌ No encontré ningún recordatorio con "${query}".`);
  }

  // ====== RESPUESTA CON IA ======
  try {
    const reply = await generateReply(text);
    await bot.sendMessage(chatId, reply);
  } catch (err) {
    console.error('Error generando respuesta:', err);
    await bot.sendMessage(chatId, 'Lo siento, tuve un problema. Intenta más tarde 💕');
  }
});
