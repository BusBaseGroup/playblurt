import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, remove, push, onValue,
  runTransaction, onDisconnect, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

// -----------------------------------------------------------------------------
// FIREBASE — already filled in for your Playblurt project.
// -----------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCicjorje95XEGXjilffNabuuOziRt3WcY",
  authDomain: "playblurt.firebaseapp.com",
  databaseURL: "https://playblurt-default-rtdb.firebaseio.com",
  projectId: "playblurt",
  storageBucket: "playblurt.firebasestorage.app",
  messagingSenderId: "701810881059",
  appId: "1:701810881059:web:6a9cd8ee3e809dca017796",
  measurementId: "G-LW6SS7F668"
};

// -----------------------------------------------------------------------------
// TWITCH LOGIN
// 1) Create a Twitch Developer application.
// 2) Add https://playblurt.co.uk/ as an OAuth Redirect URL.
// 3) Paste ONLY the public Client ID below. Never paste a Client Secret here.
// -----------------------------------------------------------------------------
const TWITCH_CLIENT_ID = "PASTE_TWITCH_CLIENT_ID_HERE";
const TWITCH_REDIRECT_URI = "https://playblurt.co.uk/";
const TWITCH_SESSION_KEY = "blurtTwitchSession";
const TWITCH_STATE_KEY = "blurtTwitchState";
const TWITCH_NONCE_KEY = "blurtTwitchNonce";
const TWITCH_PENDING_KEY = "blurtTwitchPending";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const cleanName = value => String(value || "").trim().replace(/\s+/g, " ").slice(0, 20);
const cleanQuestion = value => String(value || "").trim().replace(/\s+/g, " ").slice(0, 180);
const cleanAnswer = value => String(value || "").trim().replace(/\s+/g, " ").slice(0, 160);
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let me = null;
let roomCode = sessionStorage.getItem("blurtRoom") || "";
let roomUnsub = null;
let roomState = null;
let toastTimer = null;
let localLeaving = false;
let twitchUser = null;
let twitchCallbackMessage = "";

// -----------------------------------------------------------------------------
// QUESTION BANK
// 150+ hand-written prompts plus generated variations. The final unique pool is
// well over 600 questions and is shuffled for every game.
// -----------------------------------------------------------------------------
const CURATED = [
  "What is the worst thing to hear on a first date?",
  "Invent a terrible name for a new theme park ride.",
  "What would make the world's worst superpower?",
  "What is something you should never shout in a library?",
  "Give a bad slogan for a luxury hotel.",
  "What's the strangest thing to find under your bed?",
  "Name a completely useless app.",
  "What would be the worst thing for a driving instructor to say?",
  "What is a terrible name for a pet?",
  "Invent a crisp flavour that nobody asked for.",
  "What would be the worst prize to win on a game show?",
  "Give a suspicious name for a restaurant.",
  "What is the worst possible wedding gift?",
  "What should never be included in a school lunch?",
  "Name a product that definitely should not have Bluetooth.",
  "What is a bad excuse for being late?",
  "Give a terrible name for a band.",
  "What would you not want your sat-nav to suddenly say?",
  "Invent a weird rule for a new country.",
  "What is the least impressive world record?",
  "What is a bad thing to put on a birthday cake?",
  "Name a job that would be much harder in roller skates.",
  "What is a terrible thing to hear from your barber?",
  "Give a bad title for a superhero film.",
  "What would be the worst thing to find in your pocket?",
  "What is the most pointless thing to make waterproof?",
  "Name something that should never be sold in a vending machine.",
  "What is a terrible password hint?",
  "What would be a bad replacement for a steering wheel?",
  "Give a terrible name for a new social network.",
  "What would make a very awkward family photo?",
  "Name a terrible attraction for a seaside town.",
  "What is something a pilot should not say before take-off?",
  "Invent the world's least useful kitchen gadget.",
  "What should never be written on a welcome mat?",
  "Name a bad thing to hear after pressing a big red button.",
  "What is the worst possible name for a cruise ship?",
  "What would be a terrible thing to receive in the post?",
  "Give a bad slogan for a dentist.",
  "What is the weirdest thing to bring to a job interview?",
  "Invent a terrible name for an energy drink.",
  "What would be an awful feature in a new car?",
  "What should never be announced over a supermarket tannoy?",
  "What is the worst thing to forget on holiday?",
  "Name a very suspicious item to find in a fridge.",
  "What would be the world's worst mascot?",
  "Give a bad name for a weather app.",
  "What would be the least relaxing spa treatment?",
  "Name something that should never have a self-destruct button.",
  "What is a terrible thing to say when meeting someone's parents?",
  "What is the worst possible thing to hear from a mechanic?",
  "Invent a terrible new Olympic sport.",
  "What should never be served at a fancy restaurant?",
  "What is the worst name for a Wi-Fi network?",
  "What would be a terrible surprise inside a birthday card?",
  "Name a ridiculous reason to call in sick.",
  "What is the last thing you want to hear from a dentist holding a drill?",
  "What would be a terrible name for a nightclub?",
  "Invent a useless button for a TV remote.",
  "What would be a terrible thing to add to a roller coaster?",
  "What is a suspicious thing for a hotel receptionist to whisper?",
  "What is the worst thing to accidentally send to the family group chat?",
  "Give a terrible slogan for an airline.",
  "What would be the worst smell for a new candle?",
  "What is a ridiculous thing to keep in a safe?",
  "Name a terrible subject for a motivational speech.",
  "What is the worst thing to hear from your taxi driver?",
  "What would be a terrible name for a children's TV show?",
  "Invent a new item that absolutely nobody needs.",
  "What is a terrible thing to see on the menu at breakfast?",
  "What would be the worst thing to hear from your doctor right before a test?",
  "What is the most suspicious way to answer the phone?",
  "Name a bad place to hide during hide-and-seek.",
  "What is a terrible reason to become famous?",
  "Give a bad slogan for a funeral director.",
  "What would be the worst thing for a teacher to write on the board?",
  "Invent a terrible new flavour of toothpaste.",
  "What is a bad thing to name your boat?",
  "What should never come out of a printer?",
  "What is the worst sentence to hear over an aircraft intercom?",
  "Name a strange thing to collect.",
  "What would be a terrible new feature for a microwave?",
  "What is a suspicious thing to see on your neighbour's driveway?",
  "Invent a bad name for a dating app.",
  "What is the worst thing to say while cutting someone's hair?",
  "What would be an awful replacement for money?",
  "Name a terrible thing to put in a sandwich.",
  "What would be the worst sound for an alarm clock?",
  "What is a ridiculous reason for a train to be delayed?",
  "Invent a terrible new school subject.",
  "What would be a bad slogan for a gym?",
  "What is the strangest thing to say at a drive-through?",
  "What is the worst possible thing to be allergic to?",
  "Name a terrible title for an autobiography.",
  "What would be a useless feature on a phone?",
  "What is the worst thing to hear in an escape room?",
  "Invent a terrible name for a takeaway.",
  "What should never be used as a doorstop?",
  "What is the worst thing to see when you open a parcel?",
  "Name a suspicious reason for someone to own 40 traffic cones.",
  "What would be the worst thing to hear from a lifeguard?",
  "What is a terrible name for a perfume?",
  "Invent the least exciting tourist attraction possible.",
  "What is a bad thing to shout on a quiet train?",
  "What would be the worst prize in a cereal box?",
  "Name a terrible flavour of ice cream.",
  "What should never be stored in a glovebox?",
  "What is a terrible thing to hear when the lights go out?",
  "Invent a pointless warning label.",
  "What would make the world's worst birthday party?",
  "What is a terrible excuse for forgetting someone's name?",
  "Give a bad slogan for a bank.",
  "What is the worst thing to discover after checking into a hotel?",
  "What would be a bad name for a new planet?",
  "Invent a terrible command for a voice assistant.",
  "What is the worst thing to say to a police officer who has pulled you over?",
  "Name a ridiculous item to bring camping.",
  "What is a bad thing to hear from the person fixing your computer?",
  "What would be the worst thing to happen during a live stream?",
  "Invent a terrible name for a football team.",
  "What should never be printed on a T-shirt?",
  "What is the worst thing to hear when you are halfway through a haircut?",
  "What is a terrible thing to find in a cereal bowl?",
  "Give a bad slogan for a theme park.",
  "What would be the worst thing for your phone to autocorrect your name to?",
  "Name a terrible thing to say during a wedding ceremony.",
  "What should never be used as a pillow?",
  "Invent a ridiculous law that would make daily life impossible.",
  "What would be a terrible name for a supermarket?",
  "What is the worst thing to hear from your driving examiner?",
  "Name something that absolutely does not need wheels.",
  "What would be the world's worst restaurant theme?",
  "What is a terrible way to start a work email?",
  "Invent the worst possible username.",
  "What is the strangest thing a parcel delivery driver could hand you?",
  "What would be a terrible thing to find in the boot of your car?",
  "Name a product nobody should buy second-hand.",
  "What is the worst thing to hear from the captain of a ferry?",
  "Give a terrible slogan for a pet shop.",
  "What is the most useless thing to put on a keyring?",
  "What would be the worst notification to get at 3am?",
  "Invent a new holiday that nobody would celebrate.",
  "What is a terrible thing to do on your first day at a new job?",
  "What would be the worst thing to see written on a bus destination display?",
  "Name a terrible replacement for a bus stop bell.",
  "What is the worst thing a passenger could ask a bus driver?",
  "Invent a ridiculous reason a bus service might be cancelled.",
  "What would be the least useful feature on a double-decker bus?",
  "What is the worst thing to hear over a bus PA system?",
  "Give a terrible slogan for a bus company.",
  "Name something that should never be left on the top deck of a bus.",
  "What would be the worst thing to happen five minutes into a road trip?",
  "Invent a horrible flavour for chewing gum.",
  "What is the worst thing to hear while standing in a lift?",
  "Name a terrible name for a smart speaker.",
  "What would be the worst possible ringtone?",
  "What is something you should never say when borrowing someone's car?",
  "Invent a terrible name for a pizza topping.",
  "What is the most suspicious thing to carry into a cinema?",
  "What would be a terrible sign to see at the entrance to a zoo?",
  "Name the worst thing to put in a time capsule.",
  "What would be the worst thing to hear from a plumber?",
  "Give a terrible slogan for a phone company.",
  "What is a ridiculous feature to add to a toaster?",
  "What should never be used as a bookmark?",
  "Invent a terrible name for a coffee shop.",
  "What is the worst thing to hear when your computer is updating?",
  "What would be the most awkward thing to win in a raffle?",
  "Name a bad place for a surprise party.",
  "What is the worst thing to realise after leaving the house?",
  "Invent a terrible new emoji.",
  "What is the worst thing to hear just before your internet cuts out?"
];

const PLACES = ["airport","cinema","supermarket","hospital","school","hotel","restaurant","bus station","train station","theme park","office","gym","library","museum","zoo","beach","wedding","funfair","petrol station","shopping centre","dentist","barber shop","campsite","football stadium","ferry terminal","car park","coffee shop","drive-through","swimming pool","taxi rank"];
const OBJECTS = ["toaster","fridge","washing machine","phone","laptop","TV","car","bus","train","bicycle","kettle","microwave","vacuum cleaner","doorbell","alarm clock","printer","sat-nav","remote control","headphones","camera","umbrella","backpack","shopping trolley","traffic light","lift","vending machine","ticket machine","calculator","hairdryer","wheelie bin","office chair","smartwatch","coffee machine","game controller","keyboard"];
const JOBS = ["doctor","dentist","bus driver","pilot","teacher","mechanic","plumber","barber","chef","police officer","taxi driver","lifeguard","builder","electrician","vet","delivery driver","driving instructor","train conductor","DJ","photographer","security guard","waiter","receptionist","football referee","newsreader"];
const FOODS = ["pizza","ice cream","crisps","sandwich","burger","cake","cereal","soup","chocolate","beans","toast","pasta","chips","sausage roll","milkshake","yoghurt","cheese","coffee","tea","doughnut","biscuit","curry","ketchup","popcorn","porridge"];
const EVENTS = ["first date","wedding","birthday party","job interview","driving test","school assembly","family dinner","holiday","road trip","funeral","sports day","office meeting","live stream","concert","quiz night","Christmas dinner","barbecue","graduation","house viewing","flight"];
const TECH = ["social network","dating app","weather app","banking app","sat-nav","smart speaker","video game","streaming service","AI assistant","phone update","website","group chat","email app","fitness tracker","smart fridge","self-checkout","ticket machine","online shop","password manager","VR headset"];
const TRANSPORT = ["bus","train","taxi","plane","ferry","tram","coach","bicycle","car","van","helicopter","boat","double-decker","school bus","airport shuttle"];

function buildQuestionBank(){
  const q = [...CURATED];
  for(const x of PLACES){
    q.push(`What is the worst announcement to hear at a ${x}?`);
    q.push(`What is the strangest new rule a ${x} could introduce?`);
    q.push(`What would make you immediately leave a ${x}?`);
  }
  for(const x of OBJECTS){
    q.push(`What is the worst feature to add to a ${x}?`);
    q.push(`What should never be hidden inside a ${x}?`);
    q.push(`What is a terrible slogan for a ${x}?`);
  }
  for(const x of JOBS){
    q.push(`What is the worst thing to hear from a ${x}?`);
    q.push(`What would be a suspicious hobby for a ${x}?`);
  }
  for(const x of FOODS){
    q.push(`Invent a terrible new flavour of ${x}.`);
    q.push(`What is the worst ingredient to add to ${x}?`);
    q.push(`Give ${x} the worst possible luxury makeover.`);
  }
  for(const x of EVENTS){
    q.push(`What is the worst thing to say during a ${x}?`);
    q.push(`What is the most inappropriate thing to bring to a ${x}?`);
    q.push(`What would instantly ruin a ${x}?`);
  }
  for(const x of TECH){
    q.push(`What is the worst new feature for a ${x}?`);
    q.push(`What is the most worrying notification from a ${x}?`);
    q.push(`Give a terrible name to a new ${x}.`);
  }
  for(const x of TRANSPORT){
    q.push(`What is the worst thing to hear while travelling on a ${x}?`);
    q.push(`What is the least useful feature to add to a ${x}?`);
    q.push(`Give a terrible slogan for a ${x} company.`);
  }
  const weirdThings = ["rubber duck","garden gnome","traffic cone","banana","shopping basket","spoon","sock","cushion","wheelbarrow","toilet roll","coat hanger","lamp","mug","teddy bear","broom","ladder","watering can","flip-flop","snow globe","saucepan","bucket","door mat","toy dinosaur","cardboard box","alarm clock"];
  for(const x of weirdThings){
    q.push(`Give a ridiculous reason to carry a ${x} everywhere.`);
    q.push(`What secret job could a ${x} have at night?`);
    q.push(`What would be a terrible warning label for a ${x}?`);
  }
  return [...new Set(q)];
}
const QUESTION_BANK = buildQuestionBank();


function shuffled(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeCode() {
  let out = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += CODE_CHARS[b % CODE_CHARS.length];
  return out;
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

function toast(message) {
  clearTimeout(toastTimer);
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  toastTimer = setTimeout(() => element.classList.remove("show"), 3000);
}

function show(id) {
  $$(".screen").forEach(screen => screen.classList.toggle("active", screen.id === id));
}

function initials(name) {
  const words = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map(word => word[0]).join("") || "?").toUpperCase();
}

function twitchConfigured() {
  return TWITCH_CLIENT_ID && !TWITCH_CLIENT_ID.includes("PASTE_TWITCH") && TWITCH_CLIENT_ID.length > 8;
}

function getStoredTwitch() {
  try {
    return JSON.parse(sessionStorage.getItem(TWITCH_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function saveTwitchSession(value) {
  twitchUser = value;
  if (value) sessionStorage.setItem(TWITCH_SESSION_KEY, JSON.stringify(value));
  else sessionStorage.removeItem(TWITCH_SESSION_KEY);
  renderTwitchStatus();
}

async function fetchTwitchIdentity(accessToken) {
  const response = await fetch("https://id.twitch.tv/oauth2/userinfo", {
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (!response.ok) throw new Error("Your Twitch login has expired. Please sign in again.");
  const info = await response.json();
  const audiences = Array.isArray(info.aud) ? info.aud : [info.aud];
  if (!audiences.includes(TWITCH_CLIENT_ID)) throw new Error("Twitch returned a login for a different application.");

  return {
    id: String(info.sub || ""),
    displayName: String(info.preferred_username || "Twitch user").slice(0, 30),
    avatar: String(info.picture || ""),
    accessToken,
    verifiedAt: Date.now()
  };
}

function cleanOAuthUrl() {
  const clean = `${location.origin}${location.pathname}`;
  history.replaceState({}, document.title, clean);
}

async function restoreTwitchLogin() {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const oauthError = query.get("error");

  if (oauthError) {
    twitchCallbackMessage = query.get("error_description") || "Twitch login was cancelled.";
    sessionStorage.removeItem(TWITCH_PENDING_KEY);
    sessionStorage.removeItem(TWITCH_STATE_KEY);
    sessionStorage.removeItem(TWITCH_NONCE_KEY);
    cleanOAuthUrl();
  }

  const callbackToken = hash.get("access_token");
  if (callbackToken) {
    const expectedState = sessionStorage.getItem(TWITCH_STATE_KEY);
    const expectedNonce = sessionStorage.getItem(TWITCH_NONCE_KEY);
    const returnedState = hash.get("state");
    const idToken = hash.get("id_token");
    sessionStorage.removeItem(TWITCH_STATE_KEY);
    sessionStorage.removeItem(TWITCH_NONCE_KEY);

    if (!expectedState || returnedState !== expectedState) {
      sessionStorage.removeItem(TWITCH_PENDING_KEY);
      cleanOAuthUrl();
      throw new Error("Twitch login could not be verified. Please try again.");
    }

    if (idToken && expectedNonce) {
      try {
        const payloadPart = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = payloadPart.padEnd(payloadPart.length + ((4 - payloadPart.length % 4) % 4), "=");
        const payload = JSON.parse(atob(padded));
        const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        if (payload.nonce !== expectedNonce || !audience.includes(TWITCH_CLIENT_ID) || payload.iss !== "https://id.twitch.tv/oauth2") {
          throw new Error("invalid token claims");
        }
      } catch {
        sessionStorage.removeItem(TWITCH_PENDING_KEY);
        cleanOAuthUrl();
        throw new Error("Twitch login could not be verified. Please try again.");
      }
    }

    const identity = await fetchTwitchIdentity(callbackToken);
    saveTwitchSession(identity);
    twitchCallbackMessage = `Signed in as ${identity.displayName}.`;
    cleanOAuthUrl();
    return;
  }

  const stored = getStoredTwitch();
  if (!stored?.accessToken || !twitchConfigured()) {
    if (!twitchConfigured()) saveTwitchSession(null);
    return;
  }

  try {
    const identity = await fetchTwitchIdentity(stored.accessToken);
    saveTwitchSession(identity);
  } catch {
    saveTwitchSession(null);
  }
}

function startTwitchLogin(pending = { action: "none" }) {
  if (!twitchConfigured()) {
    toast("Twitch is not configured yet. Paste your Twitch Client ID into app.js first.");
    return;
  }

  const state = randomToken();
  const nonce = randomToken();
  sessionStorage.setItem(TWITCH_STATE_KEY, state);
  sessionStorage.setItem(TWITCH_NONCE_KEY, nonce);
  sessionStorage.setItem(TWITCH_PENDING_KEY, JSON.stringify(pending));

  const params = new URLSearchParams({
    response_type: "token id_token",
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: TWITCH_REDIRECT_URI,
    scope: "openid",
    state,
    nonce,
    claims: JSON.stringify({
      userinfo: {
        preferred_username: null,
        picture: null
      }
    })
  });

  location.href = `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

function disconnectTwitch() {
  if (roomState?.meta?.requireTwitch && roomState?.players?.[me?.uid]) {
    toast("You cannot disconnect Twitch while you are in a Twitch-required room.");
    return;
  }
  saveTwitchSession(null);
  toast("Twitch disconnected.");
}

function renderTwitchStatus() {
  const button = $("#twitchAuthBtn");
  const text = $("#twitchAuthText");
  const avatar = $("#twitchAvatar");
  if (!button || !text || !avatar) return;

  if (twitchUser) {
    button.classList.add("signed-in");
    text.textContent = twitchUser.displayName;
    if (twitchUser.avatar) {
      avatar.src = twitchUser.avatar;
      avatar.alt = `${twitchUser.displayName} Twitch profile picture`;
      avatar.classList.remove("hidden");
    } else {
      avatar.classList.add("hidden");
    }
    button.title = "Disconnect Twitch";
  } else {
    button.classList.remove("signed-in");
    text.textContent = twitchConfigured() ? "Sign in with Twitch" : "Twitch setup needed";
    avatar.classList.add("hidden");
    button.title = twitchConfigured() ? "Sign in with Twitch" : "Add your Twitch Client ID in app.js";
  }

  const hostState = $("#hostTwitchState");
  if (hostState) {
    if (twitchUser) {
      hostState.textContent = `Signed in as ${twitchUser.displayName}.`;
      hostState.classList.add("ready");
    } else if (!twitchConfigured()) {
      hostState.textContent = "Twitch needs a Client ID before this can be switched on.";
      hostState.classList.remove("ready");
    } else {
      hostState.textContent = "You will be sent to Twitch to verify before the room is created.";
      hostState.classList.remove("ready");
    }
  }

  const joinState = $("#joinTwitchState");
  if (joinState) {
    joinState.classList.toggle("signed", !!twitchUser);
    joinState.innerHTML = twitchUser
      ? `<span class="login-note-icon">◆</span><span>Signed in with Twitch as <strong>${esc(twitchUser.displayName)}</strong>.</span>`
      : `<span class="login-note-icon">◆</span><span>You can sign in with Twitch now, or BLURT will ask if the room requires it.</span>`;
  }

  syncHostNameMode();
}

function syncHostNameMode() {
  const input = $("#hostName");
  const checkbox = $("#requireTwitch");
  const help = $("#hostNameHelp");
  if (!input || !checkbox || !help) return;

  if (checkbox.checked && twitchUser) {
    input.value = twitchUser.displayName;
    input.readOnly = true;
    help.textContent = "Twitch verification is on, so your Twitch display name will be used.";
  } else {
    input.readOnly = false;
    help.textContent = checkbox.checked
      ? "You will use your Twitch display name after signing in."
      : "This is how you will appear in the room.";
  }
}

function role() {
  return roomState?.players?.[me?.uid]?.role || "player";
}
function isOwner() { return role() === "owner"; }
function isHost() { return role() === "owner" || role() === "host"; }
function roomRef(path = "") { return ref(db, `rooms/${roomCode}${path ? "/" + path : ""}`); }
function myPlayer() { return roomState?.players?.[me?.uid] || null; }
function playersArray() {
  return Object.entries(roomState?.players || {}).map(([uid, player]) => {
    const presence = roomState?.presence?.[uid] || {};
    return { uid, ...player, online: presence.online !== false, lastSeen: presence.lastSeen || 0 };
  });
}
function customArray() { return Object.entries(roomState?.customQuestions || {}).map(([id, value]) => ({ id, ...value })); }
function roundKey() { return String(roomState?.meta?.roundIndex ?? 0); }

async function ensureAuth() {
  if (auth.currentUser) return auth.currentUser;
  await signInAnonymously(auth);
  return new Promise(resolve => {
    const off = onAuthStateChanged(auth, user => {
      if (user) {
        off();
        resolve(user);
      }
    });
  });
}

function twitchPlayerFields() {
  if (!twitchUser) return {};
  return {
    twitchId: twitchUser.id,
    twitchName: twitchUser.displayName,
    twitchAvatar: twitchUser.avatar,
    twitchVerified: true
  };
}

async function createUniqueRoom(name, rounds, requireTwitch) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const code = makeCode();
    const player = {
      name,
      role: "owner",
      score: 0,
      joinedAt: Date.now(),
      ...twitchPlayerFields()
    };
    const data = {
      meta: {
        ownerUid: me.uid,
        phase: "lobby",
        rounds,
        roundIndex: 0,
        currentQuestion: "",
        questionQueue: [],
        requireTwitch: !!requireTwitch,
        createdAt: Date.now()
      },
      players: { [me.uid]: player },
      presence: { [me.uid]: { online: true, lastSeen: Date.now() } },
      bans: {},
      twitchBans: {},
      customQuestions: {},
      answers: {},
      votes: {}
    };

    const result = await runTransaction(ref(db, `rooms/${code}`), current => current === null ? data : undefined, { applyLocally: false });
    if (result.committed) return code;
  }
  throw new Error("Could not create a room code. Try again.");
}

async function setupPresence() {
  if (!roomCode || !me) return;
  const playerSnap = await get(ref(db, `rooms/${roomCode}/players/${me.uid}`));
  if (!playerSnap.exists()) return;

  const presence = ref(db, `rooms/${roomCode}/presence/${me.uid}`);
  await set(presence, { online: true, lastSeen: Date.now() });
  try {
    await onDisconnect(presence).set({ online: false, lastSeen: serverTimestamp() });
  } catch {}
}

function stopRoomListener() {
  if (roomUnsub) {
    roomUnsub();
    roomUnsub = null;
  }
}

async function leaveToHome(message = "") {
  localLeaving = true;
  stopRoomListener();
  roomCode = "";
  roomState = null;
  sessionStorage.removeItem("blurtRoom");
  $("#roomPill").classList.add("hidden");
  show("homeScreen");
  renderTwitchStatus();
  if (message) toast(message);
  setTimeout(() => { localLeaving = false; }, 50);
}

async function enterRoom(code) {
  stopRoomListener();
  roomCode = code;
  sessionStorage.setItem("blurtRoom", code);
  $("#roomPillCode").textContent = code;
  $("#roomPill").classList.remove("hidden");
  show("gameScreen");
  await setupPresence();

  roomUnsub = onValue(ref(db, `rooms/${code}`), snapshot => {
    const data = snapshot.val();
    if (!data) {
      if (!localLeaving) leaveToHome("That room no longer exists.");
      return;
    }
    if (data.bans?.[me.uid]) {
      leaveToHome("You have been banned from that room.");
      return;
    }
    if (twitchUser?.id && data.twitchBans?.[twitchUser.id]) {
      leaveToHome("Your Twitch account has been banned from that room.");
      return;
    }
    if (!data.players?.[me.uid]) {
      leaveToHome("You were kicked from the room.");
      return;
    }
    if (data.meta?.requireTwitch && !twitchUser) {
      leaveToHome("That room requires a Twitch login.");
      return;
    }
    roomState = data;
    render();
  }, error => toast(error.message));
}

async function createRoom() {
  const requireTwitch = $("#requireTwitch").checked;
  let name = cleanName($("#hostName").value);
  const rounds = Number($("#roundCount").value) || 5;

  if (requireTwitch && !twitchConfigured()) return toast("Add your Twitch Client ID in app.js before using Twitch-required rooms.");
  if (requireTwitch && !twitchUser) {
    startTwitchLogin({ action: "host", name, rounds, requireTwitch: true });
    return;
  }
  if (requireTwitch && twitchUser) name = twitchUser.displayName;
  if (!name) return toast("Enter your name first.");

  const button = $("#createRoomBtn");
  button.disabled = true;
  button.innerHTML = "CREATING…";
  try {
    const code = await createUniqueRoom(name, rounds, requireTwitch);
    await enterRoom(code);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = "CREATE ROOM <span>→</span>";
  }
}

async function joinRoom() {
  const code = $("#joinCode").value.trim().toUpperCase();
  let name = cleanName($("#joinName").value);
  if (code.length !== 6) return toast("Enter the full 6-character room code.");

  const button = $("#joinRoomBtn");
  button.disabled = true;
  button.innerHTML = "CHECKING ROOM…";

  try {
    const rr = ref(db, `rooms/${code}`);
    const snapshot = await get(rr);
    if (!snapshot.exists()) throw new Error("Room not found.");
    const room = snapshot.val();

    if (room.bans?.[me.uid]) throw new Error("You are banned from that room.");
    if (room.meta?.phase !== "lobby") throw new Error("That game has already started.");

    if (room.meta?.requireTwitch) {
      if (!twitchConfigured()) throw new Error("This room requires Twitch, but Twitch login is not configured on BLURT yet.");
      if (!twitchUser) {
        sessionStorage.setItem(TWITCH_PENDING_KEY, JSON.stringify({ action: "join", code, name }));
        startTwitchLogin({ action: "join", code, name });
        return;
      }
      if (room.twitchBans?.[twitchUser.id]) throw new Error("Your Twitch account is banned from that room.");
      const duplicateTwitch = Object.entries(room.players || {}).some(([uid, player]) => uid !== me.uid && player.twitchId === twitchUser.id);
      if (duplicateTwitch) throw new Error("That Twitch account is already in this room.");
      name = twitchUser.displayName;
    }

    if (!name) name = twitchUser?.displayName || "";
    if (!name) throw new Error("Enter your name.");

    const names = Object.entries(room.players || {})
      .filter(([uid]) => uid !== me.uid)
      .map(([, player]) => String(player.name).toLowerCase());
    if (names.includes(name.toLowerCase())) throw new Error("That name is already being used.");

    await set(ref(db, `rooms/${code}/players/${me.uid}`), {
      name,
      role: "player",
      score: 0,
      joinedAt: Date.now(),
      ...twitchPlayerFields()
    });
    await enterRoom(code);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = "JOIN ROOM <span>→</span>";
  }
}

async function resumePendingTwitchAction() {
  if (!twitchUser) return;
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem(TWITCH_PENDING_KEY) || "null"); } catch {}
  if (!pending) return;
  sessionStorage.removeItem(TWITCH_PENDING_KEY);

  if (pending.action === "host") {
    show("hostScreen");
    $("#requireTwitch").checked = true;
    $("#roundCount").value = String(pending.rounds || 5);
    $("#hostName").value = twitchUser.displayName;
    syncHostNameMode();
    await createRoom();
  } else if (pending.action === "join") {
    show("joinScreen");
    $("#joinCode").value = String(pending.code || "").toUpperCase();
    $("#joinName").value = twitchUser.displayName;
    await joinRoom();
  }
}

function phaseLabel() {
  return ({ lobby: "LOBBY", answering: "ANSWER", voting: "VOTE", results: "RESULTS", final: "FINAL" })[roomState?.meta?.phase] || "GAME";
}

function header() {
  const meta = roomState.meta;
  const left = meta.phase === "lobby"
    ? `ROOM ${roomCode}`
    : `QUESTION ${Math.min(meta.roundIndex + 1, meta.rounds)} OF ${meta.rounds}`;
  return `<div class="topline"><span class="round-label">${left}</span><span class="phase">${phaseLabel()}</span></div>`;
}

function currentAnswers() { return roomState?.answers?.[roundKey()] || {}; }
function currentVotes() { return roomState?.votes?.[roundKey()] || {}; }
function voteCounts() {
  const counts = {};
  for (const target of Object.values(currentVotes())) counts[target] = (counts[target] || 0) + 1;
  return counts;
}
function currentQuestion() { return roomState?.meta?.currentQuestion || ""; }

function avatarHTML(player, className = "player-avatar") {
  const name = player?.name || "Player";
  if (player?.twitchAvatar) return `<div class="${className}"><img src="${esc(player.twitchAvatar)}" alt=""></div>`;
  return `<div class="${className}">${esc(initials(name))}</div>`;
}

function mainHTML() {
  const meta = roomState.meta;
  const players = playersArray();

  if (meta.phase === "lobby") {
    return `${header()}
      <div class="game-kicker">SHARE THIS WITH YOUR PLAYERS</div>
      <div class="lobby-code-card">
        <div class="lobby-code-top">
          <div class="room-code-big">${esc(roomCode)}</div>
          <button id="copyCodeBtn" class="copy-code" type="button">COPY CODE</button>
        </div>
        <div class="room-badges">
          <span class="room-badge">${players.length} PLAYER${players.length === 1 ? "" : "S"}</span>
          <span class="room-badge">${meta.rounds} QUESTIONS</span>
          ${meta.requireTwitch ? `<span class="room-badge twitch">◆ TWITCH LOGIN REQUIRED</span>` : `<span class="room-badge">OPEN JOIN</span>`}
        </div>
      </div>
      <div class="waiting">Keep this screen open while everyone joins. ${meta.requireTwitch ? "Every player must verify with Twitch before they can enter." : "Players can use any display name."}</div>
      ${isHost() ? `<div class="host-actions"><button id="startBtn" class="btn primary" ${players.length < 2 ? "disabled" : ""}>START GAME →</button></div>` : ""}`;
  }

  if (meta.phase === "answering") {
    const answers = currentAnswers();
    const answered = !!answers[me.uid];
    return `${header()}
      <div class="game-kicker">YOUR ANSWER</div>
      <h2 class="question">${esc(currentQuestion())}</h2>
      ${answered
        ? `<div class="waiting">Your answer is locked in.<br><strong>${Object.keys(answers).length} / ${players.length}</strong> answers are in.</div>`
        : `<div class="answer-wrap"><textarea id="answerField" class="answer-field" maxlength="160" placeholder="Type something worth voting for…"></textarea><div class="answer-meta"><span>Keep it short. Make it good.</span><span>160 characters max</span></div><button id="submitAnswerBtn" class="btn primary">LOCK IN ANSWER</button></div>`}
      ${isHost() ? `<div class="host-actions"><button id="revealBtn" class="btn secondary" ${Object.keys(answers).length < 2 ? "disabled" : ""}>REVEAL ANSWERS</button><button id="endBtn" class="btn danger">END GAME</button></div>` : ""}`;
  }

  if (meta.phase === "voting") {
    const answers = currentAnswers();
    const votes = currentVotes();
    const myVote = votes[me.uid] || "";
    const list = Object.entries(answers).sort((a, b) => (a[1].sort || 0) - (b[1].sort || 0));
    return `${header()}
      <div class="game-kicker">PICK THE BEST ONE</div>
      <h2 class="question small">${esc(currentQuestion())}</h2>
      <div class="answers-grid">${list.map(([uid, answer]) => `<button class="answer-card ${uid === me.uid ? "mine" : ""} ${myVote === uid ? "selected" : ""}" data-vote="${uid}" ${myVote || uid === me.uid ? "disabled" : ""}>${esc(answer.text)}</button>`).join("")}</div>
      ${myVote ? `<div class="waiting">Vote locked in. <strong>${Object.keys(votes).length}</strong> vote${Object.keys(votes).length === 1 ? "" : "s"} received.</div>` : ""}
      ${isHost() ? `<div class="host-actions"><button id="scoreBtn" class="btn primary">SHOW RESULTS</button><button id="endBtn" class="btn danger">END GAME</button></div>` : ""}`;
  }

  if (meta.phase === "results") {
    const answers = currentAnswers();
    const counts = voteCounts();
    const rows = Object.entries(answers)
      .map(([uid, answer]) => ({ uid, text: answer.text, name: roomState.players?.[uid]?.name || "Player", votes: counts[uid] || 0 }))
      .sort((a, b) => b.votes - a.votes);
    return `${header()}
      <div class="game-kicker">ROUND RESULTS</div>
      <h2 class="question small">${esc(currentQuestion())}</h2>
      <div class="result-list">${rows.map(row => `<div class="result-card"><div class="result-answer">${esc(row.text)}</div><div class="result-meta"><span>${esc(row.name)}</span><span><strong>${row.votes}</strong> vote${row.votes === 1 ? "" : "s"} · <span class="points">+${row.votes * 100} PTS</span></span></div></div>`).join("")}</div>
      ${isHost() ? `<div class="host-actions"><button id="nextBtn" class="btn primary">${meta.roundIndex + 1 >= meta.rounds ? "FINAL SCORES" : "NEXT QUESTION →"}</button><button id="endBtn" class="btn danger">END GAME</button></div>` : ""}`;
  }

  if (meta.phase === "final") {
    const board = playersArray().sort((a, b) => (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name));
    const winner = board[0];
    return `${header()}
      <div class="game-kicker">FINAL RESULTS</div>
      ${winner ? `<div class="winner">${avatarHTML(winner, "winner-avatar")}<div class="winner-crown">WINNER</div><div class="winner-name">${esc(winner.name)}</div><div class="winner-score">${Number(winner.score || 0).toLocaleString()} POINTS</div></div>` : ""}
      <div class="leaderboard">${board.map((player, index) => `<div class="leader-row"><div class="leader-pos">#${index + 1}</div>${avatarHTML(player, "leader-avatar")}<div class="leader-name">${esc(player.name)}</div><div class="leader-score">${Number(player.score || 0).toLocaleString()}</div></div>`).join("")}</div>
      <div class="host-actions"><button id="homeBtn" class="btn ghost">BACK TO HOME</button></div>`;
  }

  return `<div class="waiting">Loading game…</div>`;
}

function playerRow(player) {
  const mine = player.uid === me.uid;
  const roleChip = player.role === "owner"
    ? `<span class="role owner">OWNER</span>`
    : player.role === "host" ? `<span class="role">HOST</span>` : "";
  const twitchChip = player.twitchVerified ? `<span class="verified-badge">◆ TWITCH</span>` : "";
  const ownerCanManage = isOwner() && !mine && player.role !== "owner";
  const cohostCanManage = role() === "host" && !mine && player.role === "player";
  const canKickBan = ownerCanManage || cohostCanManage;

  return `<div class="player-row ${player.online === false ? "offline" : ""}">
    <div class="player-main">
      ${avatarHTML(player)}
      <div class="player-copy">
        <div class="player-name">${esc(player.name)}</div>
        <div class="player-sub"><span class="online-dot"></span>${player.online === false ? "offline" : "online"}${roleChip}${twitchChip}</div>
      </div>
      <div class="player-score">${Number(player.score || 0).toLocaleString()}</div>
    </div>
    ${ownerCanManage || canKickBan ? `<div class="mod-row">${ownerCanManage ? (player.role === "host" ? `<button class="btn small secondary" data-demote="${player.uid}">REMOVE HOST</button>` : `<button class="btn small secondary" data-promote="${player.uid}">MAKE HOST</button>`) : ""}${canKickBan ? `<button class="btn small danger" data-kick="${player.uid}">KICK</button><button class="btn small danger" data-ban="${player.uid}">BAN</button>` : ""}</div>` : ""}
  </div>`;
}

function customHTML() {
  if (!isHost() || roomState.meta.phase !== "lobby") return "";
  const list = customArray();
  return `<div class="side-section">
    <div class="side-head"><h3 class="side-title">CUSTOM QUESTIONS</h3><span class="side-count">${list.length}</span></div>
    <div class="custom-row"><input id="customField" class="custom-field" maxlength="180" placeholder="Add a custom prompt"><button id="addQuestionBtn" class="btn primary small">ADD</button></div>
    ${list.length ? `<div class="custom-list">${list.map(question => `<div class="custom-item"><span>${esc(question.text)}</span><button data-remove-question="${question.id}" title="Remove">×</button></div>`).join("")}</div>` : `<div class="notice">BLURT already has ${QUESTION_BANK.length}+ built-in prompts. Your custom prompts are mixed into the random question pool.</div>`}
  </div>`;
}

function sideHTML() {
  const players = playersArray().sort((a, b) => (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name));
  const meta = roomState.meta;
  return `<div class="side-head"><h3 class="side-title">PLAYERS</h3><span class="side-count">${players.length}</span></div>
    <div class="player-list">${players.map(playerRow).join("")}</div>
    ${customHTML()}
    <div class="side-section security-card">
      <div class="side-head"><h3 class="side-title">ROOM SETTINGS</h3></div>
      <div class="security-line"><span>Twitch login</span><strong class="${meta.requireTwitch ? "twitch-on" : ""}">${meta.requireTwitch ? "REQUIRED" : "OPTIONAL"}</strong></div>
      <div class="security-line"><span>Scoring</span><strong>100 / VOTE</strong></div>
      <div class="security-line"><span>Questions</span><strong>${meta.rounds}</strong></div>
      <div class="notice">The owner controls host permissions. Co-hosts can run the game and kick or ban normal players, but cannot promote or demote hosts.</div>
    </div>`;
}

function render() {
  if (!roomState || !me) return;
  $("#roomPillCode").textContent = roomCode;
  $("#mainPanel").innerHTML = mainHTML();
  $("#sidePanel").innerHTML = sideHTML();
  bindGameEvents();
  renderTwitchStatus();
}

async function assertHost() {
  if (!isHost()) throw new Error("Only a host can do that.");
}
async function assertOwner() {
  if (!isOwner()) throw new Error("Only the room owner can change host permissions.");
}

async function startGame() {
  try {
    await assertHost();
    const custom = customArray().map(question => question.text);
    const queue = shuffled([...QUESTION_BANK, ...custom]).slice(0, roomState.meta.rounds);
    const result = await runTransaction(roomRef(), room => {
      if (!room || room.meta.phase !== "lobby") return;
      if (Object.keys(room.players || {}).length < 2) return;
      room.meta.phase = "answering";
      room.meta.roundIndex = 0;
      room.meta.questionQueue = queue;
      room.meta.currentQuestion = queue[0] || QUESTION_BANK[0];
      room.answers = {};
      room.votes = {};
      return room;
    }, { applyLocally: false });
    if (!result.committed) toast("You need at least 2 players and the game must still be in the lobby.");
  } catch (error) {
    toast(error.message);
  }
}

async function submitAnswer() {
  const text = cleanAnswer($("#answerField")?.value);
  if (!text) return toast("Type an answer first.");
  try {
    if (roomState.meta.phase !== "answering") throw new Error("Answers are closed.");
    await set(roomRef(`answers/${roundKey()}/${me.uid}`), { text, sort: Math.random() });
  } catch (error) {
    toast(error.message);
  }
}

async function revealAnswers() {
  try {
    await assertHost();
    const count = Object.keys(currentAnswers()).length;
    if (count < 2) throw new Error("Wait for at least 2 answers.");
    await runTransaction(roomRef("meta"), meta => {
      if (!meta || meta.phase !== "answering") return;
      meta.phase = "voting";
      return meta;
    }, { applyLocally: false });
  } catch (error) {
    toast(error.message);
  }
}

async function voteFor(uid) {
  try {
    if (roomState.meta.phase !== "voting") throw new Error("Voting is closed.");
    if (uid === me.uid) throw new Error("You cannot vote for your own answer.");
    if (currentVotes()[me.uid]) throw new Error("You already voted.");
    if (!currentAnswers()[uid]) throw new Error("That answer is no longer available.");
    await set(roomRef(`votes/${roundKey()}/${me.uid}`), uid);
  } catch (error) {
    toast(error.message);
  }
}

function scoreInsideTransaction(room, finalAfter = false) {
  if (!room || room.meta.phase !== "voting") return room;
  const key = String(room.meta.roundIndex);
  const votes = room.votes?.[key] || {};
  const counts = {};
  for (const target of Object.values(votes)) counts[target] = (counts[target] || 0) + 1;
  for (const [uid, count] of Object.entries(counts)) {
    if (room.players?.[uid]) room.players[uid].score = Number(room.players[uid].score || 0) + (count * 100);
  }
  room.meta.phase = finalAfter ? "final" : "results";
  if (finalAfter) room.meta.currentQuestion = "";
  return room;
}

async function scoreRound() {
  try {
    await assertHost();
    await runTransaction(roomRef(), room => scoreInsideTransaction(room, false), { applyLocally: false });
  } catch (error) {
    toast(error.message);
  }
}

async function nextRound() {
  try {
    await assertHost();
    await runTransaction(roomRef(), room => {
      if (!room || room.meta.phase !== "results") return;
      const next = Number(room.meta.roundIndex || 0) + 1;
      if (next >= Number(room.meta.rounds || 0)) {
        room.meta.phase = "final";
        room.meta.currentQuestion = "";
        return room;
      }
      room.meta.roundIndex = next;
      room.meta.phase = "answering";
      room.meta.currentQuestion = room.meta.questionQueue?.[next] || shuffled(QUESTION_BANK)[0];
      return room;
    }, { applyLocally: false });
  } catch (error) {
    toast(error.message);
  }
}

async function endGame() {
  if (!confirm("End the game and show final scores?")) return;
  try {
    await assertHost();
    await runTransaction(roomRef(), room => {
      if (!room) return;
      if (room.meta.phase === "voting") return scoreInsideTransaction(room, true);
      room.meta.phase = "final";
      room.meta.currentQuestion = "";
      return room;
    }, { applyLocally: false });
  } catch (error) {
    toast(error.message);
  }
}

async function addQuestion() {
  try {
    await assertHost();
    if (roomState.meta.phase !== "lobby") throw new Error("Custom questions can only be changed in the lobby.");
    const text = cleanQuestion($("#customField")?.value);
    if (!text) return;
    await push(roomRef("customQuestions"), { text, by: me.uid, createdAt: Date.now() });
  } catch (error) {
    toast(error.message);
  }
}

async function removeQuestion(id) {
  try {
    await assertHost();
    if (roomState.meta.phase !== "lobby") throw new Error("Custom questions can only be changed in the lobby.");
    await remove(roomRef(`customQuestions/${id}`));
  } catch (error) {
    toast(error.message);
  }
}

async function promote(uid) {
  try {
    await assertOwner();
    if (uid === me.uid) throw new Error("You are already the owner.");
    const target = roomState.players?.[uid];
    if (!target || target.role === "owner") throw new Error("That player cannot be promoted.");
    await update(roomRef(`players/${uid}`), { role: "host" });
  } catch (error) {
    toast(error.message);
  }
}

async function demote(uid) {
  try {
    await assertOwner();
    const target = roomState.players?.[uid];
    if (!target || target.role !== "host") throw new Error("That player is not a co-host.");
    await update(roomRef(`players/${uid}`), { role: "player" });
  } catch (error) {
    toast(error.message);
  }
}

async function kick(uid) {
  if (!confirm("Kick this player? They can join the room again later.")) return;
  try {
    await assertHost();
    const target = roomState.players?.[uid];
    if (!target || target.role === "owner") throw new Error("The owner cannot be kicked.");
    if (role() === "host" && target.role !== "player") throw new Error("Co-hosts can only kick normal players.");
    await remove(roomRef(`players/${uid}`));
  } catch (error) {
    toast(error.message);
  }
}

async function ban(uid) {
  if (!confirm("Ban this player from this room?")) return;
  try {
    await assertHost();
    const target = roomState.players?.[uid];
    if (!target || target.role === "owner") throw new Error("The owner cannot be banned.");
    if (role() === "host" && target.role !== "player") throw new Error("Co-hosts can only ban normal players.");

    const changes = {
      [`bans/${uid}`]: true,
      [`players/${uid}`]: null
    };
    if (target.twitchId) changes[`twitchBans/${target.twitchId}`] = true;
    await update(roomRef(), changes);
  } catch (error) {
    toast(error.message);
  }
}

async function copyRoomCode() {
  if (!roomCode) return;
  try {
    await navigator.clipboard.writeText(roomCode);
    toast(`Room code ${roomCode} copied.`);
  } catch {
    toast(`Room code: ${roomCode}`);
  }
}

function bindGameEvents() {
  $("#startBtn")?.addEventListener("click", startGame);
  $("#submitAnswerBtn")?.addEventListener("click", submitAnswer);
  $("#revealBtn")?.addEventListener("click", revealAnswers);
  $("#scoreBtn")?.addEventListener("click", scoreRound);
  $("#nextBtn")?.addEventListener("click", nextRound);
  $("#endBtn")?.addEventListener("click", endGame);
  $("#homeBtn")?.addEventListener("click", () => leaveToHome());
  $("#copyCodeBtn")?.addEventListener("click", copyRoomCode);
  $("#addQuestionBtn")?.addEventListener("click", addQuestion);
  $$('[data-vote]').forEach(button => button.addEventListener("click", () => voteFor(button.dataset.vote)));
  $$('[data-promote]').forEach(button => button.addEventListener("click", () => promote(button.dataset.promote)));
  $$('[data-demote]').forEach(button => button.addEventListener("click", () => demote(button.dataset.demote)));
  $$('[data-kick]').forEach(button => button.addEventListener("click", () => kick(button.dataset.kick)));
  $$('[data-ban]').forEach(button => button.addEventListener("click", () => ban(button.dataset.ban)));
  $$('[data-remove-question]').forEach(button => button.addEventListener("click", () => removeQuestion(button.dataset.removeQuestion)));
}

$("#openHostBtn").addEventListener("click", () => show("hostScreen"));
$("#openJoinBtn").addEventListener("click", () => show("joinScreen"));
$("#createRoomBtn").addEventListener("click", createRoom);
$("#joinRoomBtn").addEventListener("click", joinRoom);
$("#brandBtn").addEventListener("click", () => leaveToHome());
$("#roomPill").addEventListener("click", copyRoomCode);
$$("[data-home]").forEach(button => button.addEventListener("click", () => show("homeScreen")));
$("#joinCode").addEventListener("input", event => {
  event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
});
$("#requireTwitch").addEventListener("change", syncHostNameMode);
$("#twitchAuthBtn").addEventListener("click", () => twitchUser ? disconnectTwitch() : startTwitchLogin({ action: "none" }));

onAuthStateChanged(auth, async user => {
  if (!user) return;
  me = user;
  $("#boot").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
  renderTwitchStatus();

  if (roomCode) {
    const playerSnapshot = await get(ref(db, `rooms/${roomCode}/players/${me.uid}`));
    if (playerSnapshot.exists()) {
      await enterRoom(roomCode);
    } else {
      sessionStorage.removeItem("blurtRoom");
      roomCode = "";
      show("homeScreen");
    }
  }

  await resumePendingTwitchAction();
  if (twitchCallbackMessage) {
    toast(twitchCallbackMessage);
    twitchCallbackMessage = "";
  }
});

(async function boot() {
  try {
    if (twitchConfigured()) await restoreTwitchLogin();
    else renderTwitchStatus();
    await ensureAuth();
  } catch (error) {
    console.error(error);
    $("#boot .boot-text").textContent = error.message || "Could not start BLURT";
  }
})();

console.info(`BLURT loaded with ${QUESTION_BANK.length} unique built-in questions.`);
