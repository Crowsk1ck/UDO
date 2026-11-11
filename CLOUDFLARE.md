# Запуск УДО через GitHub + Cloudflare Workers

1. У Cloudflare створіть D1 database `udo-db`. Скопіюйте Database ID.
2. Створіть приватний R2 bucket `udo-screenshots`. Не вмикайте публічний доступ до bucket.
3. Workers & Pages → Create application → Import a repository → `Crowsk1ck/UDO`.
4. Назва Worker: `udo-panel`; production branch: `main`.
5. Build command: `npm run build:cloudflare`.
6. Deploy command: `npm run deploy:cloudflare`.
7. У build variables додайте `CF_D1_DATABASE_ID` з кроку 1. Якщо bucket має іншу назву, додайте `CF_R2_BUCKET`.
8. Для build token потрібні права Workers Scripts Edit, D1 Edit та Workers R2 Storage Edit у цьому акаунті. Токен зберігайте лише в Cloudflare, не в репозиторії або чаті.
9. Після першого розгортання у Worker → Settings → Variables and Secrets додайте секрет `UDO_ADMIN_PASSWORD` — унікальний ASCII-пароль щонайменше 16 символів. Збережіть і застосуйте зміни.
10. Відкрийте адресу Worker. Логін: `admin`; пароль: значення секрету. За відсутності секрету сервер повертає 503 і не відкриває дані.

Доступ захищено HTTP Basic Auth для всіх маршрутів, включно зі скріншотами та API. Це один спільний обліковий запис керівництва; окремих ролей працівників у цій версії немає. Використовуйте HTTPS. Браузер може запам’ятовувати авторизацію до закриття сесії.

Міграції D1 застосовуються перед публікацією. Подальші зміни `main` запускають Workers Builds, якщо Git-інтеграцію увімкнено. Робочі записи Sites та скріншоти автоматично не переносяться: нова база починає роботу з порожнього реєстру.
