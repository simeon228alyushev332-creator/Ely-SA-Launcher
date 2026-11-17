# ElySA Launcher

Вариант SA Launcher 1.5.0 с входом через **Ely.by** вместо Microsoft. Проект из двух частей:

| Папка | Что это |
|---|---|
| `site/index.html` | Сайт ElySA Launcher (замена вашего `index.html`) |
| `worker.js`, `wrangler.jsonc` | Бэкенд сайта на Cloudflare Workers: `/download/<os>`, `/api/launcher`, `/api/search`, `/api/versions` |
| `launcher/` | Лаунчер (Electron): сборки, каталог Modrinth/CurseForge, 20 языков, темы, установщик |

## Как работает вход через Ely.by
1. В лаунчере «Войти» → форма: email или ник + пароль аккаунта Ely.by (при включённой 2FA лаунчер попросит код).
2. Логин и пароль отправляются **только** на `https://authserver.ely.by` (Yggdrasil API). Сайт и ваш сервер в этом не участвуют.
3. Лаунчер хранит токен доступа (шифруется safeStorage: DPAPI / Keychain / libsecret). Перед каждым запуском токен проверяется и при необходимости обновляется.
4. Игра стартует с **authlib-injector** (`-javaagent:…=https://authserver.ely.by/api/authlib-injector`). Лаунчер сам скачивает его один раз в `shared/authlib-injector.jar` (источники: authlib-injector.yushi.moe → GitHub → BMCLAPI). Благодаря ему работают скины и плащи Ely.by, а также вход на серверы с авторизацией Ely.by.

⚠️ Аккаунты Ely.by не пройдут на серверы в online-режиме, которые проверяют аккаунты Mojang. Это ограничение Ely.by, а не лаунчера. В одиночной игре и на серверах с Ely.by всё работает.

## 1.1.1 — исправление запуска NeoForge 26.x
NeoForge для Minecraft 26.1+ (версии 26.1.0.x) в профиле больше не передаёт `-DlibraryDirectory`. Без него загрузчик не находит `minecraft` и `neoforge` и показывает «Your NeoForge installation is corrupted / neoforge is not installed», хотя установка прошла нормально. Теперь лаунчер сам добавляет это свойство для Forge/NeoForge, если его нет в профиле (`core/mc.js` → `fmlProps`). Fabric, Quilt и vanilla не затрагиваются.

## Версия 1.1.0 (основана на SA Launcher 1.5.0)
Добавлено «Установить в лаунчер»: ссылки `elysalauncher://install?src=modrinth|curseforge&project=<id>&version=<id>&type=mod|resourcepack|shader|modpack`. Кнопка «Открыть в ElySA Launcher» есть в каталоге на сайте. Схема `elysalauncher://` (не `salauncher://`), поэтому оба лаунчера можно держать на одном компьютере. Протокол регистрируется установщиком; ссылки проверяются (формат ID, тип), перед установкой лаунчер показывает подтверждение.

## Что изменено относительно SA Launcher
- `core/auth.js` — новый: вход, проверка и обновление токена Ely.by, выход.
- `core/authlib.js` — новый: загрузка authlib-injector.
- `core/mc.js` — запуск с `-javaagent`, `user_type=mojang`, `launcher_name=ElySA-Launcher`.
- `core/instances.js` — убрана обязательная проверка лицензии Microsoft.
- `core/store.js` — при старте остаются только аккаунты Ely.by; токены хранятся вместе с `clientToken`.
- Интерфейс: форма входа Ely.by (email/ник, пароль, 2FA), головы игроков из скинов Ely.by, строки на 7 языках (остальные — на английском).
- Название везде «ElySA Launcher», ID приложения `app.elysa-launcher`, установщики `ElySA-Launcher-Setup-<версия>.exe` и т. д. Данные лаунчера лежат в отдельной папке и не смешиваются с SA Launcher.
- Лицензии установщика (en/ru/pl/uk) обновлены.
- Версия ElySA: 1.1.1.

## Сайт
- Страница «Войти» теперь объясняет, что вход делается в лаунчере, и даёт ссылки на регистрацию Ely.by. Вход через Microsoft и страница «аккаунт» убраны.
- Тексты About и Privacy переписаны (сайт ничего не хранит об аккаунтах), 20 языков в карточках и на странице входа.
- Блок SignPath убран: ElySA Launcher — новый проект, и подписанным его считать нельзя, пока вы не пройдёте регистрацию в SignPath.
- Сайт по-прежнему обращается к вашему backend: `/api/search`, `/api/versions`, `/api/launcher`, `/download/<os>` (Cloudflare Pages Functions из SA Launcher). Скопируйте их в новый проект. Роуты `/auth/microsoft/*`, `/api/me`, `/api/logout`, `/launcher/login` и `/api/link/*` больше не нужны.

## Сборка
1. В `launcher/package.json` поставьте свой адрес в `"saSite"` (сейчас `https://elysa-launcher.pages.dev`).
2. Windows: `cd launcher && npm install && npm run dist` → `launcher/dist/ElySA-Launcher-Setup-1.1.1.exe`.
3. Без Windows: загрузите проект на GitHub, в Variables задайте `SA_SITE`, затем `git tag v1.1.1 && git push --tags` — `.exe`, `.dmg`, `.AppImage` появятся в Releases (`.github/workflows/build.yml`).
4. Проверка синтаксиса и переводов: `cd launcher && npm run check`.

## Что проверено, а что нет
- ✅ Синтаксис всех файлов, 20 языков × 77 ключей, форма входа в интерфейсе (включая шаг с 2FA), сайт в браузере (главная, вход, ru, privacy, без ошибок JS).
- ✅ Весь поток `auth.js` (вход, 2FA, неверный пароль, проверка токена, обновление, выход) на тестовом Yggdrasil-сервере.
- ⚠️ Не проверено в реальном окружении (не было интернета и Electron): живой вход на Ely.by, скачивание authlib-injector, запуск Minecraft со скином Ely.by, NSIS-установщик. Первую сборку прогоните так: войти → создать сборку Fabric → играть → проверить скин.
- Иконка и логотип остались от SA Launcher (`launcher/build/icon.png`, `src/renderer/logo.png`). Если нужен отдельный логотип ElySA, замените эти файлы.
