import type { Lesson } from '@cyberlab/core';

/**
 * Crypto fundamentals, aimed at one confusion.
 *
 * Encoding is not encryption. Every year people "decrypt" base64 in a report
 * and every year someone stores passwords with MD5 because "it's hashed". The
 * lesson is built around telling the three operations apart by their *purpose*
 * and their *reversibility*, and it ends on password storage because that is
 * where getting it wrong costs the most.
 */
export const cryptoLesson: Lesson = {
  id: 'found.crypto',
  moduleId: 'mod.web-foundations',
  title: 'Crittografia fondamentale',
  subtitle: 'Encoding, hashing, cifratura: tre cose diverse',
  status: 'theory-only',
  difficulty: 'intermediate',
  estimatedMinutes: 30,
  skills: ['crypto-basics', 'encoding'],
  prerequisites: ['found.http'],
  objectives: [
    'Distinguere encoding, hashing e cifratura per scopo e reversibilità.',
    'Spiegare a cosa serve una chiave simmetrica e a cosa una coppia asimmetrica.',
    'Capire cosa dimostra una firma digitale.',
    'Scegliere come si conservano le password, e dire perché SHA-256 non basta.',
  ],
  theory: [
    { id: 'a-h', kind: 'heading', level: 2, eyebrow: 'SECTION A · TRE OPERAZIONI', text: 'Le tre cose che vengono confuse' },
    {
      id: 'a-table',
      kind: 'table',
      columns: ['Operazione', 'A cosa serve', 'Serve una chiave?', 'Si torna indietro?', 'Esempi'],
      rows: [
        ['Encoding', 'Rappresentare dati in modo trasportabile', 'No', 'Sempre, da chiunque', 'base64, URL-encoding, hex'],
        ['Hashing', 'Impronta di lunghezza fissa', 'No', 'Mai (per progetto)', 'SHA-256, bcrypt, argon2'],
        ['Cifratura', 'Nascondere il contenuto', 'Sì', 'Sì, con la chiave', 'AES, ChaCha20, RSA'],
      ],
    },
    {
      id: 'a-1',
      kind: 'callout',
      variant: 'danger',
      title: 'L’errore da non fare mai',
      text: '**L’encoding non è sicurezza.** `base64` non ha chiave: chiunque lo legge. Un token base64 in un cookie non è protetto, è solo scritto in un alfabeto diverso. Se in un report leggi "la password è cifrata in base64", quella password è in chiaro.',
    },
    {
      id: 'a-code',
      kind: 'code',
      language: 'bash',
      code: `echo -n 'password123' | base64
# cGFzc3dvcmQxMjM=          ← chiunque la rilegge

echo -n 'cGFzc3dvcmQxMjM=' | base64 -d
# password123               ← nessuna chiave, nessun segreto

echo -n 'password123' | sha256sum
# ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f`,
      annotations: {
        7: 'irreversibile — ma se la password è comune, una tabella precalcolata la trova in un istante',
      },
    },

    { id: 'b-h', kind: 'heading', level: 2, eyebrow: 'SECTION B · CHIAVI', text: 'Simmetrico e asimmetrico' },
    {
      id: 'b-compare',
      kind: 'comparison',
      left: {
        label: 'Simmetrico — una chiave sola',
        tone: 'neutral',
        language: 'text',
        code: `chiave K
cifra(K, testo)  → cifrato
decifra(K, cifrato) → testo

Veloce. Adatto a grandi volumi.

Il problema: come fai avere K
all'altro senza che qualcuno
la intercetti?`,
      },
      right: {
        label: 'Asimmetrico — una coppia',
        tone: 'neutral',
        language: 'text',
        code: `chiave pubblica  (si distribuisce)
chiave privata   (mai condivisa)

cifra(pubblica, testo) → cifrato
decifra(privata, cifrato) → testo

Lento. Risolve però proprio
il problema di sopra: non
serve un segreto condiviso
per cominciare.`,
      },
    },
    {
      id: 'b-1',
      kind: 'prose',
      text: 'TLS li usa **entrambi**, e questa è la chiave di lettura giusta: l’asimmetrico serve per accordarsi, in apertura di connessione, su una chiave simmetrica usa-e-getta; da lì in poi tutto il traffico viaggia con quella, perché è veloce. L’asimmetrico risolve la distribuzione, il simmetrico il volume.',
    },
    {
      id: 'b-seq',
      kind: 'sequence',
      actors: [
        { id: 'c', label: 'Client' },
        { id: 's', label: 'Server' },
      ],
      messages: [
        { from: 'c', to: 's', label: 'ClientHello', detail: 'Cifrari supportati e materiale per lo scambio di chiavi.' },
        { from: 's', to: 'c', label: 'Certificato + chiave pubblica', tone: 'accent', detail: 'Il certificato è firmato da una CA: è ciò che lega la chiave al nome di dominio.' },
        { from: 'c', to: 's', label: 'Verifica del certificato', detail: 'Firma valida? Dominio giusto? Non scaduto? Non revocato?' },
        { from: 'c', to: 's', label: 'Accordo su una chiave di sessione', tone: 'success' },
        { from: 's', to: 'c', label: 'Traffico cifrato simmetricamente', tone: 'success', detail: 'Veloce, e con chiavi che non sopravvivono alla sessione.' },
      ],
    },

    { id: 'c-h', kind: 'heading', level: 2, eyebrow: 'SECTION C · FIRME', text: 'Cosa dimostra una firma' },
    {
      id: 'c-1',
      kind: 'prose',
      text: 'Una firma digitale si costruisce al contrario della cifratura: si usa la chiave **privata** per produrla e la **pubblica** per verificarla. Dimostra due cose insieme: che il messaggio non è stato modificato (**integrità**) e che viene da chi possiede quella chiave privata (**autenticità**). Non lo nasconde: un messaggio firmato resta leggibile.',
    },
    {
      id: 'c-2',
      kind: 'prose',
      text: 'È il meccanismo dietro i certificati TLS, gli aggiornamenti software firmati e i {{JWT:JSON Web Token, un formato di token firmato}}. Nel livello Web smonterai un JWT e vedrai concretamente che il payload è leggibile da chiunque: l’unica cosa che impedisce di riscriverlo è la firma.',
    },

    { id: 'd-h', kind: 'heading', level: 2, eyebrow: 'SECTION D · PASSWORD', text: 'Dove sbagliare costa di più' },
    {
      id: 'd-1',
      kind: 'prose',
      text: 'Le password non si cifrano — si **hashano**, perché il server non ha alcun bisogno di poterle rileggere. Ma non con un hash qualunque: SHA-256 è progettato per essere *veloce*, e la velocità è esattamente ciò che avvantaggia chi prova miliardi di candidati al secondo con una GPU.',
    },
    {
      id: 'd-timeline',
      kind: 'timeline',
      entries: [
        { title: 'Peggio di tutto: in chiaro', text: 'Una lettura del database è la compromissione di ogni account, e di ogni altro sito dove la password è stata riusata.', tone: 'danger' },
        { title: 'Ancora sbagliato: MD5 / SHA-1 / SHA-256 nudi', text: 'Irreversibili sì, ma velocissimi: tabelle precalcolate e attacchi a dizionario ricostruiscono le password comuni in tempi ridicoli.', tone: 'danger' },
        { title: 'Meglio: hash + salt unico', text: 'Un valore casuale per utente rende inutili le tabelle precalcolate e impedisce di scoprire che due utenti hanno la stessa password.' },
        { title: 'Corretto: bcrypt, scrypt o argon2', text: 'Funzioni progettate per essere lente e costose in memoria, con un fattore di lavoro regolabile che si alza man mano che l’hardware migliora.', tone: 'success' },
      ],
    },
    {
      id: 'd-compare',
      kind: 'comparison',
      left: {
        label: 'Sbagliato',
        tone: 'bad',
        language: 'php',
        code: `$hash = md5($password);
// oppure
$hash = hash('sha256', $password);`,
        note: 'Veloce da calcolare = veloce da attaccare. Nessun salt, nessun costo.',
      },
      right: {
        label: 'Corretto',
        tone: 'good',
        language: 'php',
        code: `$hash = password_hash(
    $password,
    PASSWORD_ARGON2ID
);

password_verify($input, $hash);`,
        note: 'Salt generato e incorporato automaticamente, costo regolabile, confronto a tempo costante.',
      },
    },
    {
      id: 'd-quiz',
      kind: 'quiz',
      question: 'Trovi in un cookie il valore `eyJ1c2VyIjoiYWRtaW4ifQ==`. Cos’è?',
      options: [
        { id: 'a', text: 'Un valore cifrato: serve la chiave per leggerlo' },
        { id: 'b', text: 'Un hash dell’utente' },
        { id: 'c', text: 'JSON codificato in base64: `{"user":"admin"}`, leggibile e modificabile da chiunque' },
        { id: 'd', text: 'Una firma digitale' },
      ],
      correct: ['c'],
      explanation:
        'Il `==` finale e l’alfabeto tradiscono il base64. Decodificato è JSON in chiaro. Se il server si fida di quel valore senza firma, cambiare `admin` e ricodificare è tutto l’attacco. Il segnale operativo: quando vedi base64, decodificalo *sempre* — costa un secondo e a volte finisce lì.',
      skills: ['encoding'],
    },
    {
      id: 'd-quiz-2',
      kind: 'quiz',
      question: 'Perché aggiungere un salt casuale per utente, se l’hash è già irreversibile?',
      options: [
        { id: 'a', text: 'Rende l’hash più lungo e quindi più sicuro' },
        { id: 'b', text: 'Rende inutili le tabelle precalcolate e impedisce di vedere che due utenti hanno la stessa password' },
        { id: 'c', text: 'Permette al server di recuperare la password originale' },
        { id: 'd', text: 'Serve a cifrare il database' },
      ],
      correct: ['b'],
      explanation:
        'Senza salt, lo stesso input produce sempre lo stesso hash: una tabella calcolata una volta serve per tutti i database del mondo, e righe identiche rivelano password identiche. Con un salt unico ogni password va attaccata da sola. Attenzione però: il salt rende inefficiente l’attacco di massa, non lento il singolo tentativo — per quello serve una funzione costosa come argon2.',
      skills: ['crypto-basics'],
    },
    {
      id: 'e-kp',
      kind: 'keypoints',
      title: 'Da portarsi via',
      points: [
        'Encoding = trasporto, hashing = impronta, cifratura = segretezza. Solo la cifratura ha una chiave.',
        'Base64 non protegge nulla: decodificalo sempre, appena lo vedi.',
        'Asimmetrico per accordarsi, simmetrico per il volume: TLS fa entrambe.',
        'Una firma prova integrità e autenticità, non riservatezza.',
        'Le password vogliono argon2/bcrypt con salt, non SHA-256.',
      ],
    },
  ],
  exercises: [],
  recap: [
    'Tre operazioni distinte, distinguibili per scopo e reversibilità.',
    'TLS combina asimmetrico e simmetrico per risolvere due problemi diversi.',
    'Le firme dimostrano integrità e origine, e sono la base dei JWT.',
    'Hash veloci = password attaccabili: servono funzioni deliberatamente costose.',
  ],
  furtherReading: [
    { title: 'OWASP Password Storage Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html' },
    { title: 'Crypto 101', url: 'https://www.crypto101.io/' },
  ],
};
