# 🤖 Minitats – Asistente Virtual para Telegram

Minitats es un asistente cariñoso y motivador que envía recordatorios y responde con mensajes de ánimo.
Esta versión puede funcionar **sin ninguna API de pago**: si no colocas `OPENAI_API_KEY` en el archivo `.env`, Minitats usará respuestas predefinidas y seguirá funcionando gratuitamente.

---

## 🚀 Funcionalidades
- Recordatorios con lenguaje natural (ej.: "mañana a las 9").
- Mensajes motivadores (plantillas) si no configuras una API de IA.
- Integración opcional con OpenAI si quieres respuestas más naturales.

---

## 📋 Requisitos
- Node.js >= 18
- Token de bot Telegram (desde @BotFather)
- (Opcional) OpenAI API Key si quieres respuestas IA más potentes.

---

## ⚙️ Instalación
```bash
# desde la carpeta del proyecto
npm install
cp .env.example .env
# editar .env y poner TELEGRAM_TOKEN (y opcionalmente OPENAI_API_KEY)
npm start
```

---

## 💬 Comandos
- `/start` — inicia la conversación.
- `ayuda` o `/help` — muestra ayuda.
- `/recordatorio <texto con fecha>` — crea un recordatorio. Ej: `/recordatorio mañana a las 9 llamar al médico`
- `/misrecordatorios` — lista recordatorios pendientes.

---

## 💾 Persistencia
Los recordatorios se guardan en `reminders.json`. Para producción, considera una base de datos (SQLite/Postgres).

---

## 🔒 Notas de privacidad
El bot guardará recordatorios localmente. Protege el servidor y no compartas tu token ni claves.

---

## ❤️ Personalización
El nombre que verá tu esposa es **Minitats**. Puedes cambiar mensajes en `index.js`.

