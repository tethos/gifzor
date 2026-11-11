# gifzor

Browser-Erweiterung für **Chrome und Firefox** (Manifest V3), die animierte „GIFs“ von **x.com / Twitter** als **echte `.gif`-Dateien** speichert – z. B. zum Teilen in Discord.

X liefert GIFs intern als MP4-Videos aus. gifzor wandelt sie **lokal in deinem Browser** in ein GIF um – ohne Server, ohne Account, ohne Tageslimit.

## Features

- **GIF-Button direkt am Post** (neben Antworten/Reposts/Likes), auch bei nachgeladenen Posts im Feed
- **Popover mit Optionen**: Breite (240 / 320 / 480 px / Original), Bildrate (10 / 15 / 20 fps), **frei wählbarer Dateiname**
- **Shift + Klick** auf den Button: sofort mit deinen Standardeinstellungen konvertieren
- **Größenlimit** (Standard 10 MB für Discord): Ist das GIF zu groß, werden Bildrate/Auflösung/Farben automatisch reduziert und neu kodiert
- **Fortschrittsanzeige** am Button und im Popover, Vorschau des fertigen GIFs
- Optional **Zwischenablage** (siehe Hinweis unten)
- **Original-MP4 speichern** mit einem Klick
- Deutsch & Englisch

## Datenschutz

- Die Konvertierung läuft vollständig lokal (WebCodecs + [gifenc](https://github.com/mattdesl/gifenc) in einem Web Worker).
- Die Erweiterung kontaktiert **nur**:
  - `video.twimg.com` – die MP4-Datei des GIFs
  - `cdn.syndication.twimg.com` – nur falls die Video-URL nicht direkt auf der Seite steht (öffentlicher Endpunkt für eingebettete Posts)
- Es werden **keine Cookies, Login-Tokens oder sonstigen Daten** gespeichert oder an Dritte übertragen. Gespeichert werden nur deine Einstellungen (`storage.sync`).

**Berechtigungen:** `storage` (Einstellungen), `downloads` (Datei speichern), `clipboardWrite` (optional kopieren), `offscreen` (nur Chrome – Hintergrund-Dokument für die Konvertierung), Host-Zugriff nur auf die zwei Domains oben.

## Voraussetzungen

- Chrome / Edge / Brave **116+** oder Firefox **140+**
- Zum Bauen: [Node.js](https://nodejs.org/) 20+ (inkl. npm). Alle Abhängigkeiten landen lokal in `node_modules/` dieses Ordners.

## Bauen

```bash
npm install
npm run build           # Chrome  → .output/chrome-mv3/
npm run build:firefox   # Firefox → .output/firefox-mv3/
```

## Installation

### Chrome / Edge / Brave (entpackt)

1. `npm run build`
2. `chrome://extensions` öffnen (Edge: `edge://extensions`)
3. Oben rechts den **Entwicklermodus** aktivieren
4. **„Entpackte Erweiterung laden“** → den Ordner `.output/chrome-mv3` auswählen
5. Optional: Erweiterung über das Puzzle-Symbol anheften. Ein Klick aufs Icon öffnet die Einstellungen.

Nach Code-Änderungen: neu bauen und auf der Erweiterungsseite auf „Neu laden“ klicken.

### Firefox – temporär (zum Testen)

1. `npm run build:firefox`
2. `about:debugging#/runtime/this-firefox` öffnen
3. **„Temporäres Add-on laden…“** → die Datei `.output/firefox-mv3/manifest.json` auswählen

Temporäre Add-ons werden beim Beenden von Firefox entfernt.

### Firefox – dauerhaft (signiert über AMO)

Firefox (Release) installiert dauerhaft nur von Mozilla signierte Add-ons.

1. `npm run zip:firefox` erzeugt in `.output/`:
   - `gifzor-<version>-firefox.zip` – die Erweiterung
   - `gifzor-<version>-sources.zip` – den Quellcode (verlangt AMO, weil der Code gebündelt wird)
2. Auf <https://addons.mozilla.org/developers/> anmelden → **„Neues Add-on einreichen“**
3. Vertriebsweg wählen:
   - **„Auf eigene Faust“ (unlisted)** – wird automatisch signiert, du bekommst eine `.xpi` zum Selbst-Installieren
   - **„Auf dieser Website“ (listed)** – öffentlich im Add-on-Katalog (mit Review)
4. Erweiterungs-ZIP hochladen, bei der Frage nach Quellcode die Sources-ZIP hochladen. Build-Anleitung für Reviewer: `npm install && npm run build:firefox`
5. Die signierte `.xpi` in Firefox öffnen bzw. per Drag & Drop installieren.

Alternativ per CLI (API-Schlüssel unter *Developer Hub → Tools → API-Schlüssel verwalten*):

```bash
npm run build:firefox
npx web-ext sign -s .output/firefox-mv3 --channel=unlisted --api-key=$AMO_JWT_ISSUER --api-secret=$AMO_JWT_SECRET
```

## Benutzung

1. Auf x.com einen Post mit GIF öffnen oder im Feed finden.
2. Auf den **GIF-Button** in der Aktionsleiste klicken.
3. Breite, Bildrate und Dateinamen wählen → **Konvertieren**.
4. Das GIF landet in deinem Download-Ordner. Im Popover siehst du Vorschau, Größe und kannst es erneut herunterladen.

**Shift + Klick** auf den Button überspringt das Popover.

### Einstellungen

Rechtsklick auf das Erweiterungs-Icon → *Optionen* (oder einfach Linksklick aufs Icon):

| Einstellung | Standard | Beschreibung |
|---|---|---|
| Breite | 480 px | Zielbreite (nie größer als das Original) |
| Bildrate | 15 fps | |
| Farben | 256 | weniger Farben = kleinere Datei |
| Max. Cliplänge | 0 (unbegrenzt) | längere Clips werden abgeschnitten |
| Max. Dateigröße | 10 MB | 0 = kein Limit |
| Automatisch verkleinern | an | reduziert Bildrate → Auflösung → Farben, bis die Datei passt (max. 6 Versuche) |
| Dateinamen-Muster | `{user}_{id}` | Platzhalter: `{user}`, `{id}`, `{date}`, `{n}` |
| Zwischenablage | aus | siehe unten |

### Hinweis zur Zwischenablage

Browser erlauben über die Clipboard-API derzeit nur PNG-Bilder und Text – **kein animiertes `image/gif`**. gifzor versucht trotzdem zuerst, das GIF zu kopieren. Klappt das nicht, wird stattdessen der **MP4-Link** kopiert (Discord & Co. zeigen ihn als abspielbares Video an). Der Download findet immer statt.

## Wie es funktioniert

```
Content Script (x.com)      Button + Popover, erkennt GIF-Posts per MutationObserver,
        │                   ermittelt MP4-URL (aus <video>/Poster oder Syndication-API)
        │ runtime.connect (Fortschritt zurück)
Background                  Job-Queue, Downloads
        │
Chrome: Offscreen-Dokument  ─┐
Firefox: Background-Seite   ─┴─ MP4 laden → mp4box.js + WebCodecs dekodieren
                                → Frames skalieren/abtasten → gifenc (Web Worker)
                                → zu groß? Parameter anpassen und erneut kodieren
```

Der GIF-Encoder nutzt eine globale Palette und schreibt unveränderte Pixel als transparent (verlustfrei), was die Dateigröße deutlich reduziert. Falls WebCodecs ein Video nicht dekodieren kann, wird auf ein `<video>`-Element zurückgegriffen.

## Entwicklung

```bash
npm run dev            # Chrome mit geladener Erweiterung + Hot Reload
npm run dev:firefox    # dasselbe für Firefox
npm test               # Unit-Tests (Vitest)
npm run compile        # TypeScript-Prüfung
npm run lint:firefox   # Firefox-Build + web-ext lint (AMO-Regeln)
npm run e2e            # Headless-Chrome-Test der kompletten Konvertierung
```

Projektstruktur:

```
entrypoints/
  background.ts        Service Worker / Event-Page
  content/             Button, Popover, Toast, Clipboard
  offscreen/           Chrome-Offscreen-Dokument
  options/             Einstellungsseite
lib/
  converter/           Fetch, Decoder (WebCodecs/<video>), Sampler, GIF-Worker, Größenanpassung
  tweet.ts             DOM-Selektoren für x.com
  mp4url.ts            Syndication-API
  settings.ts, messages.ts, filename.ts, i18n.ts
scripts/               Icon-/Sprachdatei-Generator, E2E-Test
tests/                 Vitest + HTML/JSON-Fixtures
```

UI-Texte werden in `scripts/gen-locales.mjs` gepflegt (`node scripts/gen-locales.mjs` erzeugt `public/_locales/*`).

## Fehlerbehebung

- **Kein Button sichtbar:** Seite neu laden (nach Installation/Update der Erweiterung nötig). Ändert X sein HTML, müssen ggf. die Selektoren in `lib/tweet.ts` angepasst werden.
- **„Verbindung zur Erweiterung verloren“:** Die Erweiterung wurde neu geladen – Seite neu laden.
- **GIF größer als das Limit:** Bei sehr langen Clips reicht die automatische Verkleinerung evtl. nicht. Max. Cliplänge setzen oder kleinere Breite wählen.
- **Download-Dialog erscheint jedes Mal:** Das ist eine Browser-Einstellung („Vor dem Herunterladen nach Speicherort fragen“).

## Lizenz

[MIT](LICENSE) © tethos
