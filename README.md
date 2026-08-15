# Siderio 3D

Visualizzatore CAD per **officina, ufficio e commessa**. Non è un CAD: non modifica i file. Mostra la revisione pubblicata, con un QR che non cambia quando il progetto va avanti.

## Perché non c’è Docker

Le postazioni in officina e in ufficio **non installano nulla** di tutto questo. Aprono Chrome o Edge.

Un solo PC in rete (anche un PC ufficio già acceso) esegue Siderio come programma Node. Database e file stanno in una cartella sul disco (`data/`). Nessun container, nessun servizio da imparare sulle macchine dei ragazzi.

```text
PC server (uno solo)          Postazioni officina / ufficio
npm start  →  porta 3000  →   browser  →  /c/26-0147
```

## Come funziona

Il browser **non apre lo STEP da 300 MB**. Quando Stefania o Giordano pubblicano una revisione, il server la converte **una volta** in un modello leggero per il viewer (GLB + albero assieme). In officina si apre quello.

```text
SOLID EDGE (ufficio)                    SIDERIO
.ASM  →  API Siemens                    POST /api/publish
      →  Occurrences / Configurations → manifest + STEP
      →  SaveAs STEP                      ↓
                                     tessellazione una volta
                                          ↓
                                     GLB + QR officina
```

Lo STEP caricato a mano dalla home resta solo come riserva.

I file `.asm` **non si caricano nel browser né sul server**. Solid Edge li legge lui, con le API Siemens, quando il progettista preme **Pubblica in officina** (`publisher/`). Il server riceve albero, configurazioni e uno STEP esportato da Solid Edge. In officina non serve la licenza CAD.

## Tre usi, un software

| Modo | Indirizzo | A chi serve |
| --- | --- | --- |
| Pubblicazione | `/` | Ufficio: commessa, upload STEP, QR, revisioni |
| Officina | `/c/26-0147` | Tre postazioni: gira, isola, nascondi, esploso |
| Ufficio tecnico | `/office/26-0147` | Albero assieme, viste, mouse stile CAD |

Il QR punta alla commessa, non al file:

`http://NOME-PC:3000/c/26-0147`

Se pubblichi la REV.04, lo stesso QR apre la 04. Se sul foglio stampato c’è ancora la 03, si può usare:

`/c/26-0147?carta=03`

e in alto compare l’avviso che il cartaceo è superato.

## Avvio sul PC server

Serve [Node.js 22](https://nodejs.org/) (LTS). Poi, in questa cartella:

```bat
avvia-siderio.bat
```

oppure:

```bash
npm install
npm run build
npm start
```

All’avvio viene creata la commessa demo **26/0147 · ROSSI SPA · Scala ingresso · REV.03**.
La geometria inclusa è un cubo STEP di prova (così il giro pubblicazione → QR → officina funziona subito). Dalla home si carica lo STEP vero della scala: quella diventa la revisione pubblicata.

Sviluppo (due processi, sempre senza Docker):

```bash
npm run dev
```

- interfaccia: `http://localhost:5173`
- API: `http://localhost:3000`

## Officina, in cinque minuti

Mouse:

- clic sinistro → seleziona
- trascina → ruota
- rotella → zoom
- centrale o destro → sposta

Pulsanti: **Isola · Nascondi · Tutto · Centra · Esploso**

Non serve l’albero CAD. Si clicca il pezzo.

In ufficio il mouse può passare al preset **CAD classico** (tasto centrale ruota), più vicino a chi usa già Solid Edge. Non è una copia di Solid Edge: stessi gesti, interfaccia nostra.

## Cosa c’è in V1 e cosa no

**V1 (questa)** — pubblicazione, conversione, QR, revisioni, officina, ufficio, pubblicatore Solid Edge.

**V2** — comandi a voce/testo sul viewer (“isolami il telaio”). L’AI non potrà modificare lo STEP.

**V3** — link cliente con scadenza e senza download del CAD.

## Dati

Tutto resta in `data/` (cartella ignorata da git):

- `siderio.db` — commesse, revisioni, viste, (schema pronto per i link cliente)
- `storage/<commessa>/revN/` — STEP originale, `model.glb`, `assembly.json`

Il database è l’indice. I file pesanti stanno sullo storage. Nessun file CAD dentro al database.
