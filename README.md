# Jasurbek Isaev IELTS Bot — o'rnatish

1. **BotFather**: /newbot → token oling. Telegram ID'ingizni @userinfobot dan biling.
2. **MongoDB Atlas** (bepul): cluster yarating → Database Access'da user → Network Access'da `0.0.0.0/0` → Connect → URI'ni oling.
3. **GitHub**: bu papkani yangi repository'ga yuklang (`.env` yuklanmaydi).
4. Ustoz rasmini `public/teacher.jpg` nomi bilan qo'ying.
5. **Render**: New → Web Service → GitHub repo tanlang.
   - Build: `npm install`   Start: `npm start`
   - Environment: `.env.example`dagi 5 ta o'zgaruvchi (WEBAPP_URL = Render bergan https manzil).
6. Deploy tugagach botga /start yozing. Admin panel: `WEBAPP_URL/admin`.

Eslatma: Render bepul tarifida server uxlab qoladi, birinchi ochilish 30-50 soniya olishi mumkin.
