import TelegramBot from 'node-telegram-bot-api';
import OpenAI from 'openai';
import * as chrono from 'chrono-node';
import schedule from 'node-schedule';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

/* ================== CONFIG ================== */
const BASE = path.resolve('.');
const REMINDERS_FILE = path.join(BASE, 'reminders.json');
const USERS_FILE = path.join(BASE, 'users.json');
const STATUS_FILE = path.join(BASE, 'status.json');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const WIFE_NAME = process.env.WIFE_NAME || 'amor';
const BOT_NAME = 'Minitats';

if (!TELEGRAM_TOKEN) {
  console.error('⚠️ Falta TELEGRAM_TOKEN');
  process.exit(1);
}

/* ================== EXPRESS (Railway) ================== */
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 Minitats activo');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🌐 HTTP server escuchando en puerto ${PORT}`);
});

/* ================== TELEGRAM ================== */
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/* ================== HELPERS ================== */
async function loadJSON(file, fallback) {
  try {
    const txt = await fs.readFile(file, 'utf8');
    return JSON.parse(txt || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

async function saveJSON(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

/* ================== USERS ================== */
async function saveUser(chatId) {
  const users = await loadJSON(USERS_FILE, []);
  if (!users.includes(chatId)) {
    users.push(chatId);
    await saveJSON(USERS_FILE, users);
  }
}

async function alertAllUsers(message) {
  const users = await loadJSON(USERS_FILE, []);
  for (const id of users) {
    try {
      await bot.sendMessage(id, message);
    } catch {}
  }
}

/* ================== REMINDERS ================== */
function scheduleReminder(rem) {
  const when = new Date(rem.date);
  if (when <= new Date()) return;

  schedule.scheduleJob(rem.id, when, async () => {
    await bot.sendMessage(
      rem.chatId,
      `⏰ *Recordatorio*: ${rem.text}\n\n💖 _Con cariño, ${BOT_NAME}_`,
      { parse_mode: 'Markdown' }
    );

    const arr = await loadJSON(REMINDERS_FILE, []);
    const r = arr.find(x => x.id === rem.id);
    if (r) {
      r.sent = true;
      await saveJSON(REMINDERS_FILE, arr);
    }
  });
}

/* ================== STARTUP CHECK ================== */
(async () => {
  const status = await loadJSON(STATUS_FILE, { lastStart: null });
  const isRestart = status.lastStart !== null;

  status.lastStart = new Date().toISOString();
  await saveJSON(STATUS_FILE, status);

  const reminders = await loadJSON(REMINDERS_FILE, []);
  reminders.filter(r => !r.sent).forEach(scheduleReminder);

  console.log(`⏰ Recordatorios cargados: ${reminders.length}`);

  if (isRestart) {
    await alertAllUsers(
      '⚠️ Estuve fuera de línea un momento, pero ya estoy de regreso 💕'
    );
  }
})();

/* ================== DELETE REMINDERS ================== */
async function deleteRemindersByText(chatId, text) {
  const arr = await loadJSON(REMINDERS_FILE, []);
  const lowered = text.toLowerCase();

  const toDelete = arr.filter(
    r => r.chatId === chatId && r.text.toLowerCase().includes(lowered)
  );

  toDelete.forEach(r => {
    const job = schedule.scheduledJobs[r.id];
    if (job) job.cancel();
  });

  const filtered = arr.filter(r => !toDelete.includes(r));
  await saveJSON(REMINDERS_FILE, filtered);

  return toDelete.length;
}

/* ================== AI / RESPUESTAS ================== */
const CANNED_REPLIES = [
  `¡Hola ${WIFE_NAME}! 💕 Estoy aquí contigo.`,
  `Eres increíble 🌸`,
  `Paso a paso, lo estás haciendo genial 💪`,
  `Cuenta conmigo siempre 💖`
];

function cannedReplyFor(text) {
  const low = text.toLowerCase();
  if (low.includes('cans')) return 'Descansa un poquito 💗';
  if (low.includes('trist')) return 'Estoy contigo 💖';
  return CANNED_REPLIES[Math.floor(Math.random() * CANNED_REPLIES.length)];
}

async function generateReply(text) {
  if (!openai) return cannedReplyFor(text);

  try {
    const r = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: text,
      max_output_tokens: 200
    });
    return r.output_text || cannedReplyFor(text);
  } catch {
    return cannedReplyFor(text);
  }
}

/* ================== BOT ================== */
bot.on('message', async msg => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  if (!text) return;

  await saveUser(chatId);
  const low = text.toLowerCase();

  if (low === '/start') {
    return bot.sendMessage(chatId, `Hola 💖 Soy ${BOT_NAME}`);
  }

  if (low === '/misrecordatorios') {
    const arr = await loadJSON(REMINDERS_FILE, []);
    const mine = arr.filter(r => r.chatId === chatId && !r.sent);
    if (!mine.length) return bot.sendMessage(chatId, 'No tienes recordatorios.');
    return bot.sendMessage(
      chatId,
      mine.map(r => `• ${new Date(r.date).toLocaleString()} — ${r.text}`).join('\n')
    );
  }

  if (low.startsWith('/recordatorio')) {
    const payload = text.replace('/recordatorio', '').trim();
    const parsed = chrono.parse(payload, new Date(), { forwardDate: true });
    if (!parsed.length) return bot.sendMessage(chatId, 'No entendí la fecha.');

    const date = parsed[0].start.date();
    let reminderText = payload.replace(parsed[0].text, '').trim();
    if (!reminderText) reminderText = 'Recordatorio';

    const rem = {
      id: `r-${Date.now()}`,
      chatId,
      date: date.toISOString(),
      text: reminderText,
      sent: false
    };

    const arr = await loadJSON(REMINDERS_FILE, []);
    arr.push(rem);
    await saveJSON(REMINDERS_FILE, arr);
    scheduleReminder(rem);

    return bot.sendMessage(chatId, `✅ Guardado para ${date.toLocaleString()}`);
  }

  if (low.startsWith('/borrar')) {
    const q = text.replace('/borrar', '').trim();
    const n = await deleteRemindersByText(chatId, q);
    return bot.sendMessage(chatId, n ? `🗑️ Eliminados ${n}` : 'No encontré nada.');
  }

  const reply = await generateReply(text);
  await bot.sendMessage(chatId, reply);
});
