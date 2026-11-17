const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const { Telegraf, Markup } = require('telegraf');

const {
  BOT_TOKEN, WEBAPP_URL, ADMIN_ID, ADMIN_PASSWORD, MONGO_URI,
  PORT = 3000,
} = process.env;

if (!BOT_TOKEN || !WEBAPP_URL || !ADMIN_ID || !ADMIN_PASSWORD || !MONGO_URI) {
  console.error('❌ .env o\'zgaruvchilari to\'liq emas (BOT_TOKEN, WEBAPP_URL, ADMIN_ID, ADMIN_PASSWORD, MONGO_URI)');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(express.json());

let users, lessons;

/* ───────────── Yordamchi funksiyalar ───────────── */
const SECTIONS = {
  writing: ['task1', 'task2'],
  reading: [''],
  listening: [''],
};

function checkInitData(initData) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    const dataCheck = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calc = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
    if (calc !== hash) return null;
    return JSON.parse(params.get('user'));
  } catch { return null; }
}

// Faqat ro'yxatdan o'tgan o'quvchilar kontentni ko'ra oladi
async function userAuth(req, res, next) {
  const u = checkInitData(req.headers['x-init-data'] || '');
  if (!u) return res.status(401).json({ error: 'Ruxsat yo\'q' });
  const dbUser = await users.findOne({ tgId: u.id, step: 'done' });
  if (!dbUser) return res.status(403).json({ error: 'Avval botda ro\'yxatdan o\'ting' });
  req.dbUser = dbUser;
  next();
}

function adminAuth(req, res, next) {
  const a = Buffer.from(req.headers['x-admin-password'] || '');
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  res.status(401).json({ error: 'Parol noto\'g\'ri' });
}

const openApp = () =>
  Markup.inlineKeyboard([[Markup.button.webApp('🚀 Mini App ni ochish', WEBAPP_URL)]]);

/* ───────────── BOT ───────────── */
bot.start(async (ctx) => {
  const tgId = ctx.from.id;
  let u = await users.findOne({ tgId });
  if (u && u.step === 'done') {
    return ctx.reply(
      `Xush kelibsiz, ${u.fullName}! 👋\nIELTS darslariga kirish uchun pastdagi tugmani bosing.`,
      openApp()
    );
  }
  await users.updateOne(
    { tgId },
    { $set: { tgId, username: ctx.from.username || null, step: 'name' }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
  await ctx.reply(
    '🎓 *Jasurbek Isaev IELTS Academy* ga xush kelibsiz!\n\nDavom etish uchun avval *ism va familiyangizni* yozing:',
    { parse_mode: 'Markdown', ...Markup.removeKeyboard() }
  );
});

bot.on('contact', async (ctx) => {
  const u = await users.findOne({ tgId: ctx.from.id });
  if (!u || u.step !== 'phone') return;
  const c = ctx.message.contact;
  if (c.user_id !== ctx.from.id) {
    return ctx.reply('❗ Iltimos, faqat o\'zingizning raqamingizni yuboring (tugma orqali).');
  }
  await finishRegistration(ctx, u, c.phone_number);
});

bot.on('text', async (ctx) => {
  const u = await users.findOne({ tgId: ctx.from.id });
  if (!u || u.step === 'done') return ctx.reply('Mini App ni ochish:', openApp());

  const text = ctx.message.text.trim();
  if (u.step === 'name') {
    if (text.length < 3 || text.split(/\s+/).length < 2) {
      return ctx.reply('❗ Iltimos, ism va familiyangizni to\'liq yozing. Masalan: Ali Valiyev');
    }
    await users.updateOne({ tgId: u.tgId }, { $set: { fullName: text.slice(0, 80), step: 'phone' } });
    return ctx.reply(
      '📱 Endi telefon raqamingizni yuboring.\nPastdagi tugmani bosing yoki raqamni +998901234567 ko\'rinishida yozing:',
      Markup.keyboard([[Markup.button.contactRequest('📞 Raqamni yuborish')]]).resize().oneTime()
    );
  }
  if (u.step === 'phone') {
    const phone = text.replace(/[\s\-()]/g, '');
    if (!/^\+?\d{9,15}$/.test(phone)) {
      return ctx.reply('❗ Raqam noto\'g\'ri. Masalan: +998901234567');
    }
    await finishRegistration(ctx, u, phone.startsWith('+') ? phone : '+' + phone);
  }
});

async function finishRegistration(ctx, u, phone) {
  await users.updateOne({ tgId: u.tgId }, { $set: { phone, step: 'done', registeredAt: new Date() } });
  await ctx.reply('✅ Ro\'yxatdan o\'tdingiz! Endi darslarga kirishingiz mumkin 👇', Markup.removeKeyboard());
  await ctx.reply('IELTS darslari:', openApp());
  const total = await users.countDocuments({ step: 'done' });
  bot.telegram.sendMessage(
    ADMIN_ID,
    `🆕 *Yangi o'quvchi!*\n\n👤 ${u.fullName}\n📞 ${phone}\n🔗 ${ctx.from.username ? '@' + ctx.from.username : 'username yo\'q'}\n🆔 ${u.tgId}\n\n📊 Jami o'quvchilar: ${total}`,
    { parse_mode: 'Markdown' }
  ).catch(() => {});
}

// Admin uchun /stats
bot.command('stats', async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return;
  const total = await users.countDocuments({ step: 'done' });
  const lc = await lessons.countDocuments();
  ctx.reply(`📊 O'quvchilar: ${total}\n🎬 Darslar: ${lc}\n\nAdmin panel: ${WEBAPP_URL}/admin`);
});

/* ───────────── MINI APP API ───────────── */
app.get('/api/lessons', userAuth, async (req, res) => {
  const { section, sub } = req.query;
  if (!SECTIONS[section]) return res.status(400).json({ error: 'Bo\'lim noto\'g\'ri' });
  const q = { section };
  if (sub) q.sub = sub;
  const list = await lessons.find(q).sort({ createdAt: 1 }).toArray();
  res.json(list);
});

app.get('/api/counts', userAuth, async (req, res) => {
  const agg = await lessons.aggregate([{ $group: { _id: { s: '$section', t: '$sub' }, n: { $sum: 1 } } }]).toArray();
  res.json(agg.map((a) => ({ section: a._id.s, sub: a._id.t, n: a.n })));
});

/* ───────────── ADMIN API ───────────── */
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  const total = await users.countDocuments({ step: 'done' });
  const since = new Date(Date.now() - 7 * 864e5);
  const week = await users.countDocuments({ step: 'done', registeredAt: { $gte: since } });
  const lc = await lessons.countDocuments();
  res.json({ total, week, lessons: lc });
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  const list = await users.find({ step: 'done' }).sort({ registeredAt: -1 }).toArray();
  res.json(list);
});

app.get('/api/admin/lessons', adminAuth, async (req, res) => {
  res.json(await lessons.find().sort({ createdAt: -1 }).toArray());
});

app.post('/api/admin/lessons', adminAuth, async (req, res) => {
  const { section, sub = '', title, videoUrl, description = '' } = req.body || {};
  if (!SECTIONS[section] || !SECTIONS[section].includes(sub)) return res.status(400).json({ error: 'Bo\'lim yoki qism noto\'g\'ri' });
  if (!title || !/^https?:\/\//i.test(videoUrl || '')) return res.status(400).json({ error: 'Nomi va to\'g\'ri video havola kerak' });
  const doc = { section, sub, title: title.trim().slice(0, 150), videoUrl: videoUrl.trim(), description: description.trim().slice(0, 1000), createdAt: new Date() };
  const r = await lessons.insertOne(doc);
  res.json({ ok: true, id: r.insertedId });
});

app.delete('/api/admin/lessons/:id', adminAuth, async (req, res) => {
  try { await lessons.deleteOne({ _id: new ObjectId(req.params.id) }); res.json({ ok: true }); }
  catch { res.status(400).json({ error: 'ID noto\'g\'ri' }); }
});

app.post('/api/admin/broadcast', adminAuth, async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Matn bo\'sh' });
  const list = await users.find({ step: 'done' }).toArray();
  let ok = 0;
  for (const u of list) {
    try { await bot.telegram.sendMessage(u.tgId, text); ok++; } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  res.json({ sent: ok, total: list.length });
});

/* ───────────── Statik sahifalar ───────────── */
app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, res) => res.send('ok'));

/* ───────────── Ishga tushirish ───────────── */
(async () => {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('ielts_bot');
  users = db.collection('users');
  lessons = db.collection('lessons');
  await users.createIndex({ tgId: 1 }, { unique: true });
  await lessons.createIndex({ section: 1, sub: 1 });

  app.use(bot.webhookCallback('/tg-webhook'));
  app.listen(PORT, async () => {
    console.log('Server port', PORT);
    await bot.telegram.setWebhook(`${WEBAPP_URL}/tg-webhook`);
    await bot.telegram.setChatMenuButton({
      menuButton: { type: 'web_app', text: 'Darslar', web_app: { url: WEBAPP_URL } },
    }).catch(() => {});
    console.log('✅ Bot ishga tushdi');
  });
})();
