import TelegramBot from 'node-telegram-bot-api';
import OpenAI from 'openai';
import * as chrono from 'chrono-node';
import schedule from 'node-schedule';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
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
async
