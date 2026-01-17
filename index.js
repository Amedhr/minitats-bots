import TelegramBot from 'node-telegram-bot-api';
import OpenAI from 'openai';
import * as chrono from 'chrono-node';
import schedule from 'node-schedule';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
dotenv.config();

// ================== CONFIG ==================
const BASE = path.resolve('.');
const REMINDERS_FILE = path.join(BASE, 'reminders.json');
const USERS_FILE = path.join(BASE, 'users.json');
const STATUS_FILE = path.join(BASE, 'status.json');
const BACKUP_DIR = path.join(BASE, 'backups');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const ADMIN_ID = process.env.ADMIN_ID; // 👈 TU CHAT ID
const WIFE_NAME = process.env.WIFE_NAME || 'amor';
const BOT_NAME = 'Minitats';
const app = express();
const PORT = process.env.PORT || 3000;

if (!TELEGRAM_TOKEN) {
  console.error('⚠️ Falta TELEGRAM_TOKEN');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// ================== HELPERS ==================
async function ensureDir(dir) {
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
}

async function loadJSON(file, fallback) {
  try {
    const txt = await fs.readFile(file, 'utf8');
    return JSON.parse(txt || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

async function saveJSON(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

// ================== USERS ==================
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
    try { await bot.sendMessage(id, message); } catch {}
  }
}

// ================== REMINDERS ==================
async function loadReminders() {
  return await loadJSON(REMINDERS_FILE, []);
}

async function saveReminders(arr) {
  await saveJSON(REMINDERS_FILE, arr);
}

function scheduleReminder(rem) {
  const when = new Date(rem.date);
  if (when <= new Date()) return;

  schedule.scheduleJob(rem.id, when, async () => {
    await bot.sendMessage(
      rem.chatId,
      `⏰ *Recordatorio*: ${rem.text}\n\n💖 _Con cariño, ${BOT_NAME}_`,
      { parse_mode: 'Markdown' }
    );

    const arr = await loadReminders();
    const r = arr.find(x => x.id === rem.id);
    if (r) { r.sent = true; await saveReminders(arr); }
  });
}

async function deleteRemindersByText(chatId, query) {
  const arr = await loadReminders();
  const q = query.toLowerCase();

  const toDelete = arr.filter(
    r => r.chatId === chatId && r.text.toLowerCase().includes(q)
  );

  toDelete.forEach(r => {
    const job = schedule.scheduledJobs[r.id];
    if (job) job.cancel();
  });

  const filtered = arr.filter(r => !toDelete.includes(r));
  await saveReminders(filtered);
  return toDelete.length;
}

// ================== BACKUP ==================
async function backupReminders() {
  await ensureDir(BACKUP_DIR);
  const data = await loadReminders();
  const file = path.join(
    BACKUP_DIR,
    `reminders-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  await saveJSON(file, data);
}

// ================== STATUS / RESTART ==================
async function loadStatus() {
  return await loadJSON(STATUS_FILE, { lastStart: null });
}

(async () => {
  const status = await loadStatus();
  const now = Date.now();
  const FIVE_MIN = 5 * 60 * 1000;

  const last = status.lastStart ? new Date(status.lastStart).getTime() : 0;
  const isRestart = last && (now - last) > FIVE_MIN;

  status.lastStart = new Date(now).toISOString();
  await saveJSON(STATUS_FILE, status);

  const reminders = await loadReminders();
  reminders.filter(r => !r.sent).forEach(scheduleReminder);

  await backupReminders();

  if (isRestart) {
    await alertAllUsers(
      '⚠️ Estuve fuera de línea unos momentos, pero ya volví 💕'
    );
  }

  console.log(`🤖 ${BOT_NAME} listo`);
})();

// ================== RESPUESTAS ==================
const CANNED = [
  `Estoy contigo ${WIFE_NAME} 💖`,
  `Respira, todo va a estar bien 🌸`,
  `Paso a paso, tú puedes 💪`
];

function cannedReply(text) {
  const low = text.toLowerCase();
  if (low.includes('trist') || low.includes('mal')) {
    return `Aquí estoy contigo 💕`;
  }
  return CANNED[Math.floor(Math.random() * CANNED.length)];
}

async function generateReply(text) {
  if (!openai) return cannedReply(text);

  try {
    const r = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: [
        { role: 'system', content: `Eres ${BOT_NAME}, cariñosa y motivadora.` },
        { role: 'user', content: text }
      ],
      temperature: 0.8,
      max_output_tokens: 200
    });
    return r.output_text || cannedReply(text);
  } catch {
    return cannedReply(text);
  }
}

// ================== BOT ==================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  if (!text) return;

  await saveUser(chatId);
  const low = text.toLowerCase();

  app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    bot: 'online',
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Health server running on port ${PORT}`);
});

  // ===== ADMIN =====
  if (low === '/estado' && String(chatId) === ADMIN_ID) {
    return bot.sendMessage(chatId, '🟢 Bot activo y estable');
  }

  // ===== COMANDOS =====
  if (low === '/start') {
    return bot.sendMessage(chatId, `Hola 💖 Soy ${BOT_NAME}`);
  }

  if (low.startsWith('/recordatorio')) {
    const payload = text.replace('/recordatorio', '').trim();
    const parsed = chrono.parse(payload, new Date(), { forwardDate: true });
    if (!parsed.length) return bot.sendMessage(chatId, 'No entendí la fecha');

    const date = parsed[0].start.date();
    const reminderText = payload.replace(parsed[0].text, '').trim() || 'Recordatorio';

    const rem = {
      id: `r-${Date.now()}`,
      chatId,
      date: date.toISOString(),
      text: reminderText,
      sent: false
    };

    const arr = await loadReminders();
    arr.push(rem);
    await saveReminders(arr);
    scheduleReminder(rem);

    return bot.sendMessage(chatId, `✅ Guardado para ${date.toLocaleString()}`);
  }

  if (low === '/misrecordatorios') {
    const arr = await loadReminders();
    const mine = arr.filter(r => r.chatId === chatId && !r.sent);
    if (!mine.length) return bot.sendMessage(chatId, 'No tienes recordatorios');
    return bot.sendMessage(
      chatId,
      mine.map(r => `• ${new Date(r.date).toLocaleString()} — ${r.text}`).join('\n')
    );
  }

  if (low.startsWith('/borrar')) {
    const q = text.replace('/borrar', '').trim();
    const n = await deleteRemindersByText(chatId, q);
    return bot.sendMessage(chatId, `🗑️ Eliminados: ${n}`);
  }

  // ===== CHAT =====
  const reply = await generateReply(text);
  await bot.sendMessage(chatId, reply);
});
