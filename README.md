# BLURT

A live typed-answer multiplayer party game.
## Features
- Fresh randomized 6-character room code for every game, using letters and numbers
- Host + join flow
- Host can promote other players to co-host
- Hosts can kick players
- Hosts can ban a player's browser from rejoining that room
- Original room owner is protected from being demoted, kicked or banned by a co-host
- Random built-in questions
- Host-added custom questions
- Typed answers
- Anonymous voting
- Automatic scoring: 100 points per vote
- Running leaderboard after every round
- Final ranking with the winner displayed larger and bolder
- Mobile + desktop responsive UI

## Deploy
1. Create a Cloudflare account if needed.
2. Install Node.js if you do not already have it.
3. Open a terminal in this folder.
4. Deploy with Wrangler:
   `npx wrangler deploy`
5. Cloudflare will give the game a free `*.workers.dev` address.

## Ban behaviour
Bans are stored for that room against a persistent browser ID. A banned player cannot rejoin that room from the same browser profile. Like most browser-only identity systems, clearing site storage or using a different browser/device can bypass it; stronger account/IP-based moderation can be added later if needed.


## Co-host moderation

- The room owner can promote and demote hosts.
- Co-hosts can kick and ban players.
- Co-hosts cannot promote or demote hosts.
- The original room owner cannot be kicked, banned, or demoted.
