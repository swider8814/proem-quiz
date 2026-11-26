// Treść zakładki Pomoc (PL, EN i UK obok siebie – poprawka tekstu = zwykły PR).
// Zasady: krótkie kroki, nazwy przycisków jak w panelu (pogrubione **…**), bez zrzutów ekranu
// (nie starzeją się przy zmianach wyglądu). tests/help.test.ts pilnuje, by wszystkie wersje były kompletne.

export type HelpLang = 'pl' | 'en' | 'uk';
export type HelpBlock = { title: string; summary: string; steps?: string[]; tips?: string[] };
export type HelpSection = { id: string; adminOnly?: boolean; pl: HelpBlock; en: HelpBlock; uk: HelpBlock };

export const HELP: HelpSection[] = [
	{
		id: 'start',
		pl: {
			title: 'Pierwsze kroki',
			summary: 'Logowanie, weryfikacja dwuetapowa i język panelu.',
			steps: [
				'Konto zakłada administrator – dostajesz e-mail z zaproszeniem. Kliknij link i ustaw hasło.',
				'Logujesz się adresem e-mail i hasłem na **quiz.proem.pl/login**.',
				'**Administratorzy** muszą mieć weryfikację dwuetapową (kod z aplikacji na telefonie, np. Google Authenticator). Pozostali mogą ją włączyć dobrowolnie: **Moje konto → Włącz weryfikację dwuetapową**. Od tej chwili przy logowaniu podajesz też kod z aplikacji.',
				'Kody zapasowe zapisz w bezpiecznym miejscu – pozwolą wejść, gdy zgubisz telefon.',
				'Język panelu zmienisz w menu języka (przycisk z kodem języka, np. **PL**): Polski, English albo Українська.'
			],
			tips: ['Zapomniane hasło: na stronie logowania kliknij „Nie pamiętasz hasła?” – link przyjdzie e-mailem.']
		},
		en: {
			title: 'Getting started',
			summary: 'Signing in, two-step verification and panel language.',
			steps: [
				'An administrator creates your account – you get an invitation e-mail. Click the link and set a password.',
				'Sign in with your e-mail and password at **quiz.proem.pl/login**.',
				'**Administrators** must use two-step verification (a code from a phone app, e.g. Google Authenticator). Everyone else can turn it on if they want: **My account → Turn on two-step verification**. From then on you also enter the code from the app when signing in.',
				'Keep the backup codes somewhere safe – they let you in if you lose your phone.',
				'Change the panel language in the language menu (the button with the language code, e.g. **EN**): Polski, English or Українська.'
			],
			tips: ['Forgot your password? On the sign-in page click “Forgot your password?” – the link arrives by e-mail.']
		},
		uk: {
			title: 'Перші кроки',
			summary: 'Вхід, двоетапна перевірка й мова панелі.',
			steps: [
				'Обліковий запис створює адміністратор – ви отримуєте лист із запрошенням. Натисніть посилання й встановіть пароль.',
				'Входьте за адресою ел. пошти й паролем на **quiz.proem.pl/login**.',
				'**Адміністратори** мусять мати двоетапну перевірку (код із застосунку на телефоні, напр. Google Authenticator). Інші можуть увімкнути її за бажанням: **Мій обліковий запис → Увімкнути двоетапну перевірку**. Відтоді під час входу ви вводите також код із застосунку.',
				'Збережіть резервні коди в надійному місці – вони дадуть змогу увійти, якщо ви загубите телефон.',
				'Мову панелі змінюйте в меню мови (кнопка з кодом мови, напр. **UK**): Polski, English або Українська.'
			],
			tips: ['Забули пароль? На сторінці входу натисніть «Забули пароль?» – посилання прийде ел. поштою.']
		}
	},
	{
		id: 'create',
		pl: {
			title: 'Tworzenie quizu',
			summary: 'Nowy quiz, pytania, obrazki i fragmenty piosenek.',
			steps: [
				'Na liście **Quizy** wpisz tytuł i kliknij **Utwórz quiz**. Na telefonie najpierw dotknij **+** obok nagłówka „Quizy”.',
				'Wybierz typ pytania i kliknij **Dodaj pytanie**. Na telefonie użyj **+** obok „Pytanie 1 z 1” albo przycisku na dole edytora.',
				'Wpisz treść, odpowiedzi i zaznacz **poprawna**. Zmiany zapisuj przyciskiem **Zapisz** (albo Ctrl+S). Gdy wszystko jest zapisane, przycisk pokazuje **Zapisano**.',
				'Obrazek do pytania: **Dodaj obrazek**. Zdjęcie z telefonu zostanie samo zmniejszone. Zamiast tekstu odpowiedzi możesz dać obrazek: **obrazek zamiast tekstu**.',
				'Pytanie audio („jaka to piosenka?”): wgraj plik MP3, przeciągnij niebieskie pole na fali, żeby wybrać fragment, i sprawdź go przyciskiem **Odsłuchaj fragment**.',
				'Kolejność pytań zmienisz strzałkami albo przeciągając je na liście. **Duplikuj** kopiuje pytanie.'
			],
			tips: [
				'Typy pytań: **Wybór (ABCD)**, **Prawda / fałsz**, **Audio**, **Wpisywana odpowiedź**, **Ułóż w kolejności**, **Ankieta** (bez punktów), **Suwak** (liczba) i **Slajd** (sam tekst, bez pytania).',
				'Pole **Tłumaczenie / drugi wiersz** pokazuje się pod pytaniem mniejszą czcionką – np. wersja angielska dla lekcji.',
				'Limity plików: audio do 30 MB, obrazki do 20 MB.'
			]
		},
		en: {
			title: 'Creating a quiz',
			summary: 'New quiz, questions, images and song clips.',
			steps: [
				'On the **Quizzes** list type a title and click **Create quiz**. On a phone, first tap **+** next to the “Quizzes” heading.',
				'Choose a question type and click **Add question**. On a phone use **+** next to “Question 1 of 1” or the button at the bottom of the editor.',
				'Type the question and answers and tick **correct**. Save with **Save** (or Ctrl+S). When everything is saved, the button shows **Saved**.',
				'Picture for the question: **Add image**. Photos from a phone are resized automatically. An answer can be a picture instead of text: **image instead of text**.',
				'Audio question (“name that song”): upload an MP3, drag the blue area on the waveform to pick the clip and check it with **Play clip**.',
				'Reorder questions with the arrows or by dragging them in the list. **Duplicate** copies a question.'
			],
			tips: [
				'Question types: **Multiple choice (ABCD)**, **True / false**, **Audio**, **Type the answer**, **Put in order**, **Poll** (no points), **Slider** (a number) and **Slide** (text only, no question).',
				'The **Translation / second line** field appears under the question in a smaller font – e.g. a Polish version for a lesson.',
				'File limits: audio up to 30 MB, images up to 20 MB.'
			]
		},
		uk: {
			title: 'Створення вікторини',
			summary: 'Нова вікторина, питання, зображення й фрагменти пісень.',
			steps: [
				'У списку **Вікторини** введіть назву й натисніть **Створити вікторину**. На телефоні спершу торкніться **+** біля заголовка «Вікторини».',
				'Виберіть тип питання й натисніть **Додати питання**. На телефоні скористайтеся **+** біля «Питання 1 з 1» або кнопкою внизу редактора.',
				'Введіть питання й відповіді та позначте **правильна**. Зберігайте кнопкою **Зберегти** (або Ctrl+S). Коли все збережено, кнопка показує **Збережено**.',
				'Зображення до питання: **Додати зображення**. Фото з телефона буде зменшено автоматично. Замість тексту відповіді можна дати зображення: **зображення замість тексту**.',
				'Аудіопитання («вгадай пісню»): завантажте MP3, перетягніть синю область на хвилі, щоб вибрати фрагмент, і перевірте його кнопкою **Прослухати фрагмент**.',
				'Порядок питань змінюйте стрілками або перетягуванням у списку. **Дублювати** копіює питання.'
			],
			tips: [
				'Типи питань: **Вибір відповіді (ABCD)**, **Правда / неправда**, **Аудіо**, **Введи відповідь**, **Розстав по порядку**, **Опитування** (без балів), **Повзунок** (число) і **Слайд** (лише текст, без питання).',
				'Поле **Переклад / другий рядок** з’являється під питанням меншим шрифтом – напр. український переклад для уроку англійської.',
				'Обмеження файлів: аудіо до 30 МБ, зображення до 20 МБ.'
			]
		}
	},
	{
		id: 'settings',
		pl: {
			title: 'Ustawienia quizu',
			summary: 'Czas, punkty, nicki, drużyny i muzyka.',
			steps: [
				'W edytorze kliknij **Ustawienia**. Tu wybierasz motyw (kolory i logo) oraz **Język gry** – napisy na ekranie i telefonach.',
				'**Domyślny czas na odpowiedź** dostaje każde nowe pytanie. W samym pytaniu możesz go zmienić (przyciski 10/20/30/60 albo pole **inny**).',
				'**Punkty** w pytaniu: **Zwykłe**, **Podwójne** (np. ostatnie pytanie) albo **Bez** (rozgrzewka).',
				'**Nicki graczy**: **Losowe lub własne** (z filtrem słów), **Tylko losowe** (najbezpieczniej dla młodszych dzieci) albo **Tylko własne** (każdy wpisuje imię lub nick).',
				'**Tryb drużynowy**: jeden telefon na drużynę. **Czas na naradę** pokazuje pytanie przed odpowiadaniem, żeby drużyna mogła się naradzić.',
				'**Muzyka w tle** gra z komputera prowadzącego. Milknie przy pytaniach audio i na podium.'
			]
		},
		en: {
			title: 'Quiz settings',
			summary: 'Time, points, nicknames, teams and music.',
			steps: [
				'In the editor click **Settings**. Here you choose the theme (colours and logo) and the **Game language** – texts on the screen and on phones.',
				'Every new question gets the **Default answer time**. You can change it in the question itself (10/20/30/60 buttons or the **other** field).',
				'**Points** per question: **Standard**, **Double** (e.g. the last question) or **None** (a warm-up).',
				'**Player nicknames**: **Random or custom** (with a word filter), **Random only** (safest for younger children) or **Custom only** (everyone types a name or nickname).',
				'**Team mode**: one phone per team. **Team discussion time** shows the question before answering so the team can discuss it.',
				'**Background music** plays from the host computer. It stops during audio questions and on the podium.'
			]
		},
		uk: {
			title: 'Налаштування вікторини',
			summary: 'Час, бали, нікнейми, команди й музика.',
			steps: [
				'У редакторі натисніть **Налаштування**. Тут ви вибираєте тему (кольори й логотип) і **Мову гри** – написи на екрані й телефонах.',
				'Кожне нове питання отримує **Час на відповідь за замовчуванням**. У самому питанні його можна змінити (кнопки 10/20/30/60 або поле **інший**).',
				'**Бали** за питання: **Звичайні**, **Подвійні** (напр. останнє питання) або **Без балів** (розминка).',
				'**Нікнейми гравців**: **Випадкові або власні** (з фільтром слів), **Лише випадкові** (найбезпечніше для молодших дітей) або **Лише власні** (кожен вводить ім’я чи нікнейм).',
				'**Командний режим**: один телефон на команду. **Час на обговорення в команді** показує питання до відповідей, щоб команда могла порадитися.',
				'**Фонова музика** грає з комп’ютера ведучого. Вона затихає на аудіопитаннях і на п’єдесталі.'
			]
		}
	},
	{
		id: 'host',
		pl: {
			title: 'Prowadzenie gry',
			summary: 'Uruchomienie, PIN, ekran dla widzów i sterowanie.',
			steps: [
				'Podłącz komputer do projektora lub telewizora i do głośników albo wyślij obraz z tabletu na telewizor (AirPlay, Chromecast). Otwórz quiz i kliknij **Uruchom grę**.',
				'Na ekranie pojawi się **PIN** i kod QR. Gracze wchodzą na **quiz.proem.pl** na telefonie i wpisują PIN (albo skanują kod).',
				'Komputer z drugim ekranem: **Otwórz ekran dla widzów** – otwiera osobne okno. Przeciągnij je na projektor i naciśnij **F** (pełny ekran). Na Twoim ekranie zostaje widok prowadzącego.',
				'Tablet albo jeden ekran powielony na telewizor: zostań w widoku prowadzącego i kliknij **Pełny ekran**. Widzowie widzą to samo co Ty.',
				'Kliknij **Test dźwięku**, zanim wejdą gracze. Jeśli przeglądarka zablokuje dźwięk, kliknij dowolny przycisk na stronie.',
				'Przy graczu w poczekalni: strzałka w kółku nadaje nowy losowy nick, **×** usuwa gracza (nie wróci z tego telefonu).',
				'Gdy wszyscy są, kliknij **Start**. Dalej: **spacja** lub strzałka w prawo przechodzi do kolejnego kroku, **R** odtwarza fragment piosenki ponownie.',
				'Na końcu jest podium, a raport zapisuje się sam.'
			],
			tips: ['W jednej grze może być do 300 graczy.']
		},
		en: {
			title: 'Running a game',
			summary: 'Starting, PIN, audience screen and controls.',
			steps: [
				'Connect the computer to the projector or TV and to the speakers, or send the tablet screen to the TV (AirPlay, Chromecast). Open the quiz and click **Start game**.',
				'The screen shows a **PIN** and a QR code. Players go to **quiz.proem.pl** on their phones and enter the PIN (or scan the code).',
				'Computer with a second screen: **Open audience screen** – opens a separate window. Drag it to the projector and press **F** (full screen). The host view stays on your screen.',
				'Tablet or one screen mirrored to the TV: stay in the host view and click **Full screen**. The audience sees the same as you.',
				'Click **Sound test** before players join. If the browser blocks sound, click any button on the page.',
				'Next to a player in the lobby: the circular arrow gives a new random nickname, **×** removes the player (they cannot rejoin from that phone).',
				'When everyone is in, click **Start**. Then **space** or the right arrow moves to the next step, **R** replays the song clip.',
				'The game ends with a podium and the report is saved automatically.'
			],
			tips: ['Up to 300 players can join one game.']
		},
		uk: {
			title: 'Проведення гри',
			summary: 'Запуск, PIN, екран для глядачів і керування.',
			steps: [
				'Підключіть комп’ютер до проєктора чи телевізора та до колонок або передайте зображення з планшета на телевізор (AirPlay, Chromecast). Відкрийте вікторину й натисніть **Почати гру**.',
				'На екрані з’являться **PIN** і QR-код. Гравці відкривають **quiz.proem.pl** на телефоні й вводять PIN (або сканують код).',
				'Комп’ютер із другим екраном: **Відкрити екран для глядачів** – відкриває окреме вікно. Перетягніть його на проєктор і натисніть **F** (повний екран). На вашому екрані залишається вигляд ведучого.',
				'Планшет або один екран, продубльований на телевізор: залишайтеся у вигляді ведучого й натисніть **Повний екран**. Глядачі бачать те саме, що й ви.',
				'Натисніть **Тест звуку**, перш ніж приєднаються гравці. Якщо браузер заблокує звук, натисніть будь-яку кнопку на сторінці.',
				'Біля гравця в лобі: стрілка в колі дає новий випадковий нікнейм, **×** видаляє гравця (з цього телефона він не повернеться).',
				'Коли всі на місці, натисніть **Починаємо**. Далі **пробіл** або стрілка праворуч переходить до наступного кроку, **R** повторює фрагмент пісні.',
				'Наприкінці – п’єдестал, а звіт зберігається автоматично.'
			],
			tips: ['В одній грі може бути до 300 гравців.']
		}
	},
	{
		id: 'checklist',
		pl: {
			title: 'Przed wydarzeniem – lista kontrolna',
			summary: 'Co sprawdzić dzień wcześniej i na miejscu.',
			steps: [
				'Przejdź cały quiz sam: **Uruchom grę** i dołącz z własnego telefonu.',
				'Sprawdź, czy obraz trafia na projektor (okno dla widzów na pełnym ekranie) i czy działają głośniki (**Test dźwięku**).',
				'Upewnij się, że na sali jest Wi-Fi albo dobry zasięg – gracze grają na swoich telefonach.',
				'Zrób próbną grę na 2–3 telefonach (najlepiej iPhone i Android).',
				'Podłącz komputer lub tablet do zasilania i wyłącz usypianie ekranu.'
			]
		},
		en: {
			title: 'Before the event – checklist',
			summary: 'What to check the day before and on site.',
			steps: [
				'Play the whole quiz yourself: **Start game** and join from your own phone.',
				'Check that the picture reaches the projector (audience window in full screen) and that the speakers work (**Sound test**).',
				'Make sure there is Wi-Fi or good mobile signal in the room – players use their own phones.',
				'Run a trial game on 2–3 phones (ideally an iPhone and an Android).',
				'Plug the computer or tablet in and turn off screen sleep.'
			]
		},
		uk: {
			title: 'Перед заходом – контрольний список',
			summary: 'Що перевірити напередодні й на місці.',
			steps: [
				'Пройдіть усю вікторину самі: **Почати гру** й приєднайтеся з власного телефона.',
				'Перевірте, чи зображення потрапляє на проєктор (вікно для глядачів на повний екран) і чи працюють колонки (**Тест звуку**).',
				'Переконайтеся, що в залі є Wi-Fi або добрий мобільний зв’язок – гравці грають на своїх телефонах.',
				'Проведіть пробну гру на 2–3 телефонах (найкраще iPhone і Android).',
				'Підключіть комп’ютер чи планшет до живлення й вимкніть сплячий режим екрана.'
			]
		}
	},
	{
		id: 'trouble',
		pl: {
			title: 'Gdy coś nie działa',
			summary: 'Najczęstsze problemy i szybkie rozwiązania.',
			steps: [
				'**Gracz nie może dołączyć** – sprawdź PIN i czy wpisuje adres **quiz.proem.pl**. Jeśli gra już trwa, w ustawieniach musi być włączone **Dołączanie w trakcie gry**.',
				'**Telefon się rozłączył** (blokada ekranu, Wi-Fi) – wystarczy wrócić do przeglądarki. Gra wznowi się sama z tymi samymi punktami.',
				'**Nie słychać dźwięku** – kliknij dowolny przycisk na stronie prowadzącego (przeglądarka wymaga kliknięcia), sprawdź głośność urządzenia i głośników, użyj **Test dźwięku**.',
				'**Okno dla widzów się nie otwiera** – zezwól w przeglądarce na wyskakujące okna dla quiz.proem.pl.',
				'**Plik jest za duży** – audio do 30 MB, obrazki do 20 MB. Długą piosenkę skróć albo zapisz w niższej jakości.',
				'Nadal nie działa? Napisz do administratora i podaj wersję ze stopki panelu.'
			]
		},
		en: {
			title: 'When something goes wrong',
			summary: 'The most common problems and quick fixes.',
			steps: [
				'**A player cannot join** – check the PIN and that they type **quiz.proem.pl**. If the game has already started, **Joining during the game** must be on in the settings.',
				'**A phone disconnected** (screen lock, Wi-Fi) – just go back to the browser. The game resumes with the same points.',
				'**No sound** – click any button on the host page (browsers require a click), check the device and speaker volume, use **Sound test**.',
				'**The audience window does not open** – allow pop-ups for quiz.proem.pl in the browser.',
				'**The file is too large** – audio up to 30 MB, images up to 20 MB. Shorten a long song or save it in lower quality.',
				'Still not working? Contact the administrator and give the version from the panel footer.'
			]
		},
		uk: {
			title: 'Коли щось не працює',
			summary: 'Найчастіші проблеми та швидкі рішення.',
			steps: [
				'**Гравець не може приєднатися** – перевірте PIN і чи вводить він адресу **quiz.proem.pl**. Якщо гра вже триває, у налаштуваннях має бути ввімкнено **Приєднання під час гри**.',
				'**Телефон від’єднався** (блокування екрана, Wi-Fi) – достатньо повернутися до браузера. Гра продовжиться сама з тими самими балами.',
				'**Немає звуку** – натисніть будь-яку кнопку на сторінці ведучого (браузер вимагає натискання), перевірте гучність пристрою та колонок, скористайтеся **Тест звуку**.',
				'**Вікно для глядачів не відкривається** – дозвольте в браузері спливні вікна для quiz.proem.pl.',
				'**Файл завеликий** – аудіо до 30 МБ, зображення до 20 МБ. Довгу пісню скоротіть або збережіть у нижчій якості.',
				'Досі не працює? Напишіть адміністраторові й вкажіть версію з нижнього колонтитула панелі.'
			]
		}
	},
	{
		id: 'reports',
		pl: {
			title: 'Raporty i udostępnianie',
			summary: 'Wyniki po grze, arkusz CSV i quizy wspólne z innymi.',
			steps: [
				'Po każdej grze raport zapisuje się sam: **Raporty** przy quizie. Zobaczysz wyniki i które pytania były najtrudniejsze.',
				'**Pobierz arkusz (CSV dla Excela)** – wyniki do dalszej pracy.',
				'Raporty zawierają tylko nicki graczy i znikają automatycznie po 90 dniach.',
				'**Udostępnij** w edytorze daje innej osobie dostęp do quizu: **może prowadzić grę** (bez zmieniania pytań) albo **może edytować i prowadzić**.'
			]
		},
		en: {
			title: 'Reports and sharing',
			summary: 'Results after a game, CSV sheet and quizzes shared with others.',
			steps: [
				'A report is saved automatically after every game: **Reports** next to the quiz. You will see the results and which questions were the hardest.',
				'**Download spreadsheet (CSV for Excel)** – results for further work.',
				'Reports contain only player nicknames and are deleted automatically after 90 days.',
				'**Share** in the editor gives another person access to the quiz: **can host the game** (without changing questions) or **can edit and host**.'
			]
		},
		uk: {
			title: 'Звіти й спільний доступ',
			summary: 'Результати після гри, таблиця CSV і вікторини, спільні з іншими.',
			steps: [
				'Після кожної гри звіт зберігається сам: **Звіти** біля вікторини. Ви побачите результати й те, які питання були найскладнішими.',
				'**Завантажити таблицю (CSV для Excel)** – результати для подальшої роботи.',
				'Звіти містять лише нікнейми гравців і автоматично зникають через 90 днів.',
				'**Поділитися** в редакторі дає іншій людині доступ до вікторини: **може проводити гру** (без зміни питань) або **може редагувати й проводити**.'
			]
		}
	},
	{
		id: 'admin',
		adminOnly: true,
		pl: {
			title: 'Dla administratora',
			summary: 'Użytkownicy, motywy, logo i ustawienia.',
			steps: [
				'**Użytkownicy → Zaproś osobę**: podaj e-mail, imię, rolę (**Autor** albo **Administrator**) i język konta. Lektorom anglojęzycznym ustaw **English**, osobom z Ukrainy – **Українська**.',
				'Link z zaproszenia działa 7 dni – potem kliknij **Nowy link**. Konto, które nie zostało aktywowane (np. z literówką w e-mailu), możesz **usunąć**. Aktywne konto można tylko **zablokować** – jego quizy zostają.',
				'**Motywy**: styl ekranów, kolory, czcionka i logo. Autor wybiera motyw w ustawieniach quizu.',
				'**Ustawienia**: logo w panelu, stan kopii zapasowych i sekcja **O aplikacji** (wersja, miejsce na serwerze).',
				'Nowa wersja aplikacji trafia na serwer dopiero po ręcznym wdrożeniu w GitHub Actions – numer wersji widać w stopce panelu.'
			]
		},
		en: {
			title: 'For administrators',
			summary: 'Users, themes, logo and settings.',
			steps: [
				'**Users → Invite a person**: enter the e-mail, name, role (**Author** or **Administrator**) and account language.',
				'The invitation link works for 7 days – after that click **New link**. An account that was never activated (e.g. a typo in the e-mail) can be **deleted**. Active accounts can only be **blocked** – their quizzes stay.',
				'**Themes**: screen style, colours, font and logo. Authors pick a theme in the quiz settings.',
				'**Settings**: panel logo, backup status and the **About** section (version, server space).',
				'A new app version reaches the server only after a manual deploy in GitHub Actions – the version number is in the panel footer.'
			]
		},
		uk: {
			title: 'Для адміністратора',
			summary: 'Користувачі, теми, логотип і налаштування.',
			steps: [
				'**Користувачі → Запросити людину**: вкажіть ел. пошту, ім’я, роль (**Автор** або **Адміністратор**) і мову облікового запису.',
				'Посилання-запрошення діє 7 днів – потім натисніть **Нове посилання**. Обліковий запис, який не активували (напр. через помилку в адресі), можна **видалити**. Активний обліковий запис можна лише **заблокувати** – його вікторини залишаються.',
				'**Теми**: стиль екранів, кольори, шрифт і логотип. Автор вибирає тему в налаштуваннях вікторини.',
				'**Налаштування**: логотип у панелі, стан резервних копій і розділ **Про застосунок** (версія, місце на сервері).',
				'Нова версія застосунку потрапляє на сервер лише після ручного розгортання в GitHub Actions – номер версії видно в нижньому колонтитулі панелі.'
			]
		}
	}
];

/** Krótkie podpowiedzi „?” w panelu; `section` = id sekcji Pomocy z pełnym opisem. */
export const HELP_TIPS = {
	team: {
		section: 'settings',
		pl: 'Jeden telefon na drużynę. Przy dołączaniu wpisuje się nazwę drużyny i imiona. Czas na naradę pokazuje pytanie, zanim drużyny mogą odpowiadać.',
		en: 'One phone per team. When joining, players enter a team name and members. Team discussion time shows the question before teams can answer.',
		uk: 'Один телефон на команду. Під час приєднання вводять назву команди й імена. Час на обговорення показує питання, перш ніж команди можуть відповідати.'
	},
	nick: {
		section: 'settings',
		pl: 'Losowe lub własne – gracz może zmienić losowy nick na swój (filtr słów). Tylko losowe – nikt nie wpisze nic nieodpowiedniego. Tylko własne – każdy wpisuje imię lub nick.',
		en: 'Random or custom – players may replace the random nickname with their own (word filter). Random only – nobody can type anything inappropriate. Custom only – everyone types a name or nickname.',
		uk: 'Випадкові або власні – гравець може замінити випадковий нікнейм своїм (фільтр слів). Лише випадкові – ніхто не введе нічого неприйнятного. Лише власні – кожен вводить ім’я чи нікнейм.'
	},
	points: {
		section: 'settings',
		pl: 'Zwykłe – do 1000 punktów, szybciej znaczy więcej. Podwójne – dwa razy więcej (np. na finał). Bez – pytanie na rozgrzewkę, nie zmienia rankingu.',
		en: 'Standard – up to 1000 points, faster means more. Double – twice as many (e.g. for the finale). None – a warm-up question that does not change the ranking.',
		uk: 'Звичайні – до 1000 балів, що швидше, то більше. Подвійні – удвічі більше (напр. на фінал). Без балів – розминкове питання, не змінює рейтинг.'
	},
	translation: {
		section: 'create',
		pl: 'Druga linia pod pytaniem, mniejszą czcionką – np. tłumaczenie na lekcję języka. Można zostawić puste.',
		en: 'A second line under the question in a smaller font – e.g. a translation for a language lesson. Can be left empty.',
		uk: 'Другий рядок під питанням меншим шрифтом – напр. переклад для уроку мови. Можна залишити порожнім.'
	},
	screen: {
		section: 'host',
		pl: 'Komputer z drugim ekranem: otwiera osobne okno dla projektora. Przeciągnij je na drugi ekran i naciśnij F. Na Twoim ekranie zostaje widok prowadzącego z graczami i przyciskami. Tablet z obrazem na telewizorze: wystarczy Pełny ekran.',
		en: 'Computer with a second screen: opens a separate window for the projector. Drag it to the second screen and press F. Your screen keeps the host view with players and buttons. Tablet mirrored to a TV: just use Full screen.',
		uk: 'Комп’ютер із другим екраном: відкриває окреме вікно для проєктора. Перетягніть його на другий екран і натисніть F. На вашому екрані залишається вигляд ведучого з гравцями й кнопками. Планшет із зображенням на телевізорі: достатньо «Повний екран».'
	},
	share: {
		section: 'reports',
		pl: '„Może prowadzić grę” – uruchamia quiz, ale nie zmienia pytań. „Może edytować i prowadzić” – zmienia pytania i prowadzi, ale nie usunie quizu ani nie udostępni go dalej.',
		en: '“Can host the game” – runs the quiz but cannot change questions. “Can edit and host” – changes questions and hosts, but cannot delete the quiz or share it further.',
		uk: '«Може проводити гру» – запускає вікторину, але не змінює питань. «Може редагувати й проводити» – змінює питання й проводить, але не видалить вікторину й не поділиться нею далі.'
	}
} satisfies Record<string, { section: string; pl: string; en: string; uk: string }>;

export type HelpTipId = keyof typeof HELP_TIPS;

/** **pogrubienie** → <strong>; reszta tekstu escapowana (treść jest nasza, ale bez wyjątków od escapowania). */
export function helpHtml(s: string) {
	const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	return esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
