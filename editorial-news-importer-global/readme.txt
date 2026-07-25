=== Editorial News Importer Global ===
Contributors: editorial-news
Tags: rss, news, importer, global, seo, google-news
Requires at least: 6.2
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 3.3.0
License: GPLv2 or later

Importator RSS global fără AI. Creează direct articole WordPress și administrează un catalog internațional de surse active.

== Descriere ==

Editorial News Importer Global 3.3.0 include:

* catalog internațional extins, organizat pe regiuni și țări;
* surse noi active implicit;
* import direct în Articole, fără procesare AI;
* procesare round-robin în loturi pentru evitarea timeout-urilor;
* maximum configurabil de articole noi per sursă;
* deduplicare după GUID și URL normalizat;
* circuit breaker: fluxurile cu erori repetate sunt suspendate temporar;
* stare Draft/Pending/Publish configurabilă;
* aprobare editorială și noindex până la verificarea umană;
* meta description, canonical, Open Graph și NewsArticle fallback;
* sitemap Google News la /eani-news-sitemap.xml;
* categorii regionale și etichete de sursă/țară;
* integrare sigură cu Yoast, Rank Math, SEOPress și AIOSEO.

== Instalare ==

1. În WordPress, deschide Module > Adaugă modul > Încarcă modul.
2. Încarcă arhiva ZIP și înlocuiește versiunea anterioară.
3. Activează modulul.
4. Deschide Editorial News > Catalog global.
5. Apasă Sincronizează sursele noi.
6. Păstrează inițial starea articolelor pe Ciornă.
7. Verifică Editorial News > Surse RSS pentru fluxurile suspendate sau eșuate.

== Recomandări ==

* Nu activa publicarea automată înainte de testarea pe staging.
* Pentru publicațiile comerciale, folosește titlu + link.
* Rezumatele RSS sunt configurate numai pentru surse proprii, publice sau deschise.
* Verifică termenii fiecărei publicații înainte de utilizare comercială.
* WP-Cron trebuie să funcționeze; pentru trafic redus este recomandat un cron real pe hosting.

== Actualizare de la 3.2.1 ==

Sursele deja existente și configurările lor sunt păstrate. Sursele noi din catalog sunt adăugate active. Un URL personalizat existent nu este suprascris. Fluxurile care eșuează de mai multe ori sunt suspendate temporar, nu șterse.

== Changelog ==

= 3.3.0 =
* Catalog global extins cu surse suplimentare din toate regiunile.
* Surse noi active implicit.
* Procesare round-robin în loturi.
* Circuit breaker pentru fluxuri instabile.
* Import direct în Articole.
* Deduplicare URL/GUID îmbunătățită.
* Panou global și filtre pe regiune/stare.
* Noindex până la aprobarea editorială.
* Sitemap Google News multilingv.
