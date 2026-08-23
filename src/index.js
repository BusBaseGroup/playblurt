const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function makeCode(length = 6) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += CODE_CHARS[b % CODE_CHARS.length];
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/create" && request.method === "POST") {
      let body = {};
      try { body = await request.json(); } catch {}
      const hostName = String(body.hostName || "Host").trim().slice(0, 20) || "Host";
      const rounds = Math.max(1, Math.min(10, Number(body.rounds) || 5));

      for (let i = 0; i < 20; i++) {
        const code = makeCode(6);
        const id = env.ROOMS.idFromName(code);
        const stub = env.ROOMS.get(id);
        const hostToken = crypto.randomUUID();
        const res = await stub.fetch("https://room.internal/init", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, hostName, hostToken, rounds }),
        });
        if (res.ok) return json({ code, hostToken, rounds });
      }
      return json({ error: "Could not create a room. Try again." }, 503);
    }

    if (url.pathname.startsWith("/ws/")) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const code = url.pathname.split("/").pop().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) return new Response("Bad room code", { status: 400 });
      const id = env.ROOMS.idFromName(code);
      return env.ROOMS.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.room = null;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      this.room = await this.state.storage.get("room") || null;
    });
  }

  async persist() {
    await this.state.storage.put("room", this.room);
  }

  publicState() {
    if (!this.room) return { exists: false };
    const r = this.room;
    const players = Object.values(r.players).map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.connected,
      isHost: Boolean(p.isHost),
      isOwner: Boolean(p.isOwner),
      answered: Boolean(r.answers[p.id]),
      voted: Boolean(r.votes[p.id]),
    }));

    let answers = [];
    if (r.phase === "voting" || r.phase === "results" || r.phase === "final") {
      answers = Object.entries(r.answers).map(([playerId, answer]) => ({
        id: playerId,
        text: answer,
        ownerId: r.phase === "results" || r.phase === "final" ? playerId : undefined,
        ownerName: r.phase === "results" || r.phase === "final" ? r.players[playerId]?.name : undefined,
        votes: r.phase === "results" || r.phase === "final"
          ? Object.values(r.votes).filter(v => v === playerId).length
          : undefined,
      }));
      if (r.phase === "voting") answers.sort((a, b) => a.text.localeCompare(b.text));
      if (r.phase === "results") answers.sort((a, b) => (b.votes || 0) - (a.votes || 0));
    }

    const leaderboard = [...players]
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .map((p, i) => ({ ...p, place: i + 1 }));

    return {
      exists: true,
      code: r.code,
      phase: r.phase,
      rounds: r.rounds,
      round: r.round,
      question: r.currentQuestion,
      players,
      answers,
      leaderboard,
      customQuestions: r.customQuestions,
      questionsLeft: r.queue.length,
      winner: r.phase === "final" ? leaderboard[0] || null : null,
    };
  }

  send(ws, type, payload = {}) {
    try { ws.send(JSON.stringify({ type, ...payload })); } catch {}
  }

  broadcast(type, payload = {}) {
    for (const ws of this.state.getWebSockets()) this.send(ws, type, payload);
  }

  broadcastState() {
    this.broadcast("state", { state: this.publicState() });
  }

  socketsForPlayer(playerId) {
    return this.state.getWebSockets().filter(ws => {
      const meta = ws.deserializeAttachment() || {};
      return meta.playerId === playerId;
    });
  }

  disconnectPlayer(playerId, code, reason, messageType) {
    for (const socket of this.socketsForPlayer(playerId)) {
      if (messageType) this.send(socket, messageType, { message: reason });
      try { socket.close(code, reason); } catch {}
    }
  }

  removePlayer(playerId) {
    delete this.room.answers[playerId];
    delete this.room.votes[playerId];
    for (const [voterId, targetId] of Object.entries(this.room.votes)) {
      if (targetId === playerId) delete this.room.votes[voterId];
    }
    delete this.room.players[playerId];
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === "/init" && request.method === "POST") {
      if (this.room) return json({ error: "Room already exists" }, 409);
      const body = await request.json();
      this.room = {
        code: body.code,
        hostToken: body.hostToken,
        hostName: body.hostName,
        rounds: body.rounds,
        phase: "lobby",
        round: 0,
        currentQuestion: null,
        ownerId: null,
        players: {},
        customQuestions: [],
        queue: [],
        answers: {},
        votes: {},
        bannedClientIds: {},
      };
      await this.persist();
      return json({ ok: true });
    }

    if (request.headers.get("Upgrade") === "websocket") {
      if (!this.room) return new Response("Room not found", { status: 404 });
      const params = url.searchParams;
      const name = (params.get("name") || "Player").trim().slice(0, 20) || "Player";
      const playerId = params.get("playerId") || crypto.randomUUID();
      const clientId = params.get("clientId") || playerId;
      const hostToken = params.get("hostToken") || "";
      const ownerAuth = Boolean(hostToken && hostToken === this.room.hostToken);

      if (this.room.bannedClientIds?.[clientId]) {
        return new Response("Banned from this room", { status: 403 });
      }

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ playerId, clientId });

      if (!this.room.players[playerId]) {
        const becomesOwner = ownerAuth && !this.room.ownerId;
        this.room.players[playerId] = {
          id: playerId,
          clientId,
          name,
          score: 0,
          connected: true,
          isHost: ownerAuth,
          isOwner: becomesOwner,
        };
        if (becomesOwner) this.room.ownerId = playerId;
      } else {
        const p = this.room.players[playerId];
        p.connected = true;
        p.name = name;
        p.clientId = clientId;
        if (ownerAuth) {
          p.isHost = true;
          p.isOwner = true;
          this.room.ownerId = playerId;
        }
      }
      await this.persist();

      const joined = this.room.players[playerId];
      this.send(server, "welcome", {
        playerId,
        isHost: Boolean(joined?.isHost),
        isOwner: Boolean(joined?.isOwner),
        state: this.publicState(),
      });
      this.broadcastState();
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws, message) {
    await this.ready;
    let data;
    try { data = JSON.parse(message); } catch { return; }
    const meta = ws.deserializeAttachment() || {};
    const player = this.room?.players?.[meta.playerId];
    if (!this.room || !player) return;

    const hostOnly = new Set([
      "addQuestion", "removeQuestion", "setRounds", "start", "reveal", "score", "next", "end",
      "kickPlayer", "banPlayer"
    ]);
    const ownerOnly = new Set(["promoteHost", "demoteHost"]);
    if (hostOnly.has(data.type) && !player.isHost) {
      return this.send(ws, "error", { message: "Only a host can do that." });
    }
    if (ownerOnly.has(data.type) && !player.isOwner) {
      return this.send(ws, "error", { message: "Only the room owner can change host permissions." });
    }

    switch (data.type) {
      case "addQuestion": {
        if (this.room.phase !== "lobby") break;
        const q = String(data.question || "").trim().slice(0, 180);
        if (q && !this.room.customQuestions.includes(q)) this.room.customQuestions.push(q);
        break;
      }
      case "removeQuestion": {
        if (this.room.phase !== "lobby") break;
        const i = Number(data.index);
        if (Number.isInteger(i) && i >= 0 && i < this.room.customQuestions.length) this.room.customQuestions.splice(i, 1);
        break;
      }
      case "setRounds": {
        if (this.room.phase !== "lobby") break;
        this.room.rounds = Math.max(1, Math.min(10, Number(data.rounds) || 5));
        break;
      }
      case "promoteHost": {
        const target = this.room.players[String(data.playerId || "")];
        if (!target) break;
        target.isHost = true;
        break;
      }
      case "demoteHost": {
        const target = this.room.players[String(data.playerId || "")];
        if (!target) break;
        if (target.isOwner) return this.send(ws, "error", { message: "The original host cannot be demoted." });
        if (target.id === player.id) return this.send(ws, "error", { message: "You cannot demote yourself." });
        target.isHost = false;
        break;
      }
      case "kickPlayer": {
        const targetId = String(data.playerId || "");
        const target = this.room.players[targetId];
        if (!target) break;
        if (target.isOwner) return this.send(ws, "error", { message: "The original host cannot be kicked." });
        if (targetId === player.id) return this.send(ws, "error", { message: "You cannot kick yourself." });
        this.removePlayer(targetId);
        this.disconnectPlayer(targetId, 4001, "You were kicked from the room.", "kicked");
        break;
      }
      case "banPlayer": {
        const targetId = String(data.playerId || "");
        const target = this.room.players[targetId];
        if (!target) break;
        if (target.isOwner) return this.send(ws, "error", { message: "The original host cannot be banned." });
        if (targetId === player.id) return this.send(ws, "error", { message: "You cannot ban yourself." });
        const targetClientId = target.clientId || target.id;
        this.room.bannedClientIds[targetClientId] = {
          name: target.name,
          bannedAt: Date.now(),
        };
        this.removePlayer(targetId);
        this.disconnectPlayer(targetId, 4003, "You were banned from the room.", "banned");
        break;
      }
      case "start": {
        if (this.room.phase !== "lobby") break;
        if (Object.values(this.room.players).filter(p => p.connected).length < 2) {
          return this.send(ws, "error", { message: "You need at least 2 players." });
        }
        this.prepareQueue();
        this.room.round = 0;
        this.startNextQuestion();
        break;
      }
      case "answer": {
        if (this.room.phase !== "answering") break;
        if (this.room.answers[meta.playerId]) break;
        const answer = String(data.answer || "").trim().slice(0, 140);
        if (answer) this.room.answers[meta.playerId] = answer;
        break;
      }
      case "reveal": {
        if (this.room.phase !== "answering") break;
        if (Object.keys(this.room.answers).length < 2) {
          return this.send(ws, "error", { message: "Wait for at least 2 answers." });
        }
        this.room.phase = "voting";
        break;
      }
      case "vote": {
        if (this.room.phase !== "voting") break;
        const target = String(data.target || "");
        if (!this.room.answers[target]) break;
        if (target === meta.playerId) {
          return this.send(ws, "error", { message: "You can't vote for your own answer." });
        }
        this.room.votes[meta.playerId] = target;
        break;
      }
      case "score": {
        if (this.room.phase !== "voting") break;
        for (const target of Object.values(this.room.votes)) {
          if (this.room.players[target]) this.room.players[target].score += 100;
        }
        this.room.phase = "results";
        break;
      }
      case "next": {
        if (this.room.phase !== "results") break;
        if (this.room.round >= this.room.rounds) {
          this.room.phase = "final";
          this.room.currentQuestion = null;
        } else {
          this.startNextQuestion();
        }
        break;
      }
      case "end": {
        if (!["answering", "voting", "results"].includes(this.room.phase)) break;
        if (this.room.phase === "voting") {
          for (const target of Object.values(this.room.votes)) {
            if (this.room.players[target]) this.room.players[target].score += 100;
          }
        }
        this.room.phase = "final";
        this.room.currentQuestion = null;
        break;
      }
    }

    await this.persist();
    this.broadcastState();
  }

  async webSocketClose(ws) {
    await this.ready;
    const meta = ws.deserializeAttachment() || {};
    if (this.room?.players?.[meta.playerId]) {
      this.room.players[meta.playerId].connected = false;
      await this.persist();
      this.broadcastState();
    }
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  prepareQueue() {
    const builtIns = [
      "What is the worst thing to hear on a first date?",
      "Invent a terrible name for a new theme park ride.",
      "What would make the world's worst superpower?",
      "What is something you should never shout in a library?",
      "Give a bad slogan for a luxury hotel.",
      "What's the strangest thing to find under your bed?",
      "Name a completely useless app.",
      "What would be the worst thing for a driving instructor to say?",
      "What is a terrible name for a pet?",
      "Invent a new flavour of crisps that nobody asked for.",
      "What would be the worst prize to win on a game show?",
      "Give a suspicious name for a restaurant.",
      "What is the worst possible wedding gift?",
      "What should never be included in a school lunch?",
      "Name a product that definitely shouldn't have Bluetooth.",
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
      "What is a terrible thing to say when meeting someone's parents?"
    ];
    const all = [...builtIns, ...this.room.customQuestions];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    this.room.queue = all;
  }

  startNextQuestion() {
    if (!this.room.queue.length) this.prepareQueue();
    this.room.round += 1;
    this.room.phase = "answering";
    this.room.currentQuestion = this.room.queue.shift();
    this.room.answers = {};
    this.room.votes = {};
  }
}
