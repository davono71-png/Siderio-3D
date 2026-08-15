# Pubblica in officina

Solid Edge, che avete già in ufficio, è il **traduttore ufficiale** dell’`.ASM`.
Siderio sul server **non** apre i nativi: riceve ciò che Solid Edge ha già letto tramite API Siemens.

```text
Solid Edge aperto (SCALA.ASM)
        │
        │  Documents / AssemblyDocument
        │  Occurrences, Configurations
        │  SaveAs → STEP
        ▼
Siderio.Publisher.exe
        │
        │  POST /api/publish
        │  manifest.json + geometria.stp
        ▼
Siderio server (un PC)
        │
        ▼
QR officina  /c/26-0147
```

In officina **non serve** la licenza Solid Edge.

## Sul PC di Stefania / Giordano

1. Solid Edge aperto sull’assieme da pubblicare.
2. Siderio già avviato sul PC server (`avvia-siderio.bat`).
3. In questa cartella, su Windows:

```bat
dotnet publish -c Release
```

Poi lancia `bin\Release\net8.0-windows\Siderio.Publisher.exe`.

4. **Leggi assieme aperto** → controlla commessa / cliente / titolo.
5. **Pubblica in officina**.

Il programma usa solo COM ufficiale (`SolidEdge.Application`, occorrenze, configurazioni, `SaveAs`). Non c’è un parser `.asm` scritto da noi.

Le configurazioni Solid Edge (Completo, Solo carpenteria, Senza carter, Montaggio…) arrivano nel viewer come pulsanti.

Il pulsante ribbon nativo “dentro” Solid Edge si può agganciare in un secondo momento allo stesso exe: la logica è già questa.
