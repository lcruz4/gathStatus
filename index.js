const { API_KEY, ROOM_KEY, NOTIFICATION_KEY } = require("./env");
const { Game } = require("@gathertown/gather-game-client");
global.WebSocket = require("isomorphic-ws");

let joinQ = [];
const statusMap = {};
const removeFromJoinQ = (playerId) => {
  joinQ = joinQ.filter((e) => e.playerId !== playerId);
};
const handleGathNotif = (playerName, isInGath) => {
  fetch(`https://ntfy.sh/${NOTIFICATION_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Title": "Gath Status",
      "Tags": "grapes",
    },
    body: isInGath ? `${playerName} is on da gathz! 🥳` : `${playerName} left gathz! 😭`,
  });
}

/**** setup ****/

// what's going on here is better explained in the docs:
// https://gathertown.notion.site/Gather-Websocket-API-bf2d5d4526db412590c3579c36141063
const game = new Game(ROOM_KEY, () =>
  Promise.resolve({ apiKey: API_KEY })
);
// replace with your spaceId of choice ^^^^^^^^^^^
game.connect();
game.subscribeToConnection((connected) => console.log("connected?", connected));

/**** the good stuff ****/

game.subscribeToEvent("playerSetsName", (data, context) => {
  const lastJoinEv = joinQ
    .filter((e) => e.playerId === context.playerId)
    .at(-1);
  const playerStatus = statusMap[context.playerId];

  if (lastJoinEv) {
    lastJoinEv.name = data.playerSetsName.name;
    if (lastJoinEv.name && playerStatus && playerStatus !== "DoNotDisturb") {
      handleGathNotif(data.playerSetsName.name, true);
      removeFromJoinQ(context.playerId);
    }
  }
});

game.subscribeToEvent("playerJoins", (_data, context) =>
  joinQ.push({
    playerId: context.playerId,
    name: null,
  })
);

game.subscribeToEvent("playerExits", (_data, context) => {
  if (statusMap[context.playerId] !== "DoNotDisturb") {
    handleGathNotif(context.player.name, false);
  }
  removeFromJoinQ(context.playerId);
  statusMap[context.playerId] = null;
});

game.subscribeToEvent("playerSetsAvailability", (data, context) => {
  const lastJoinEv = joinQ
    .filter((e) => e.playerId === context.playerId)
    .at(-1);
  const playerStatus = data.playerSetsAvailability.status;
  const previousStatus = statusMap[context.playerId];
  statusMap[context.playerId] = playerStatus;

  if (lastJoinEv) {
    if (lastJoinEv.name && playerStatus !== "DoNotDisturb") {
      removeFromJoinQ(context.playerId);

      handleGathNotif(lastJoinEv.name, true);
    }
  }

  if (
    !lastJoinEv &&
    previousStatus === "DoNotDisturb" &&
    playerStatus !== "DoNotDisturb"
  ) {
    handleGathNotif(context.player.name, true);
  }

  if (
    previousStatus &&
    previousStatus !== "DoNotDisturb" &&
    playerStatus === "DoNotDisturb"
  ) {
    handleGathNotif(context.player.name, false);
  }
});
