const { API_KEY, ROOM_KEY, NOTIFICATION_KEY } = require('./env');
const { Game } = require('@gathertown/gather-game-client');
global.WebSocket = require('isomorphic-ws');

let joinQ = [];
const statusMap = {};
const removeFromJoinQ = (playerId) => {
  joinQ = joinQ.filter((e) => e.playerId !== playerId);
};

const logError = (message) => {
  fetch(`https://ntfy.sh/${NOTIFICATION_KEY.admin}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Title: 'Gath error log',
      Tags: 'gear',
    },
    body: message,
  });
};

const sendNotif = ({ playerId, title, tags, message }) => {
  const notifKeysToNotify = Object.keys(NOTIFICATION_KEY).filter(
    (key) => key !== 'admin' && key !== playerId
  );
  for (const notifId of notifKeysToNotify) {
    fetch(`https://ntfy.sh/${NOTIFICATION_KEY[notifId]}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Title: title || 'Gath Status',
        Tags: tags || 'grapes',
      },
      body: message,
    });
  }
};

const handleGathNotif = ({ id, name, message, isInGath }) => {
  if (typeof isInGath === 'undefined' && !message) {
    logError(
      `must pass isInGath or message! id: ${id}, name: ${name}, isInGath: ${isInGath}, message: ${message}.`
    );
  } else if (message) {
    sendNotif({
      playerId: id,
      message,
    });
  } else {
    sendNotif({
      playerId: id,
      message: isInGath
        ? `${name} is on da gathz! 🥳`
        : `${name} left gathz! 😭`,
    });
  }
};

/**** setup ****/

// what's going on here is better explained in the docs:
// https://gathertown.notion.site/Gather-Websocket-API-bf2d5d4526db412590c3579c36141063
const game = new Game(ROOM_KEY, () => Promise.resolve({ apiKey: API_KEY }));
// replace with your spaceId of choice ^^^^^^^^^^^
game.connect();
game.subscribeToConnection((connected) => console.log('connected?', connected));

/**** the good stuff ****/

game.subscribeToEvent('playerSetsName', (data, context) => {
  const lastJoinEv = joinQ
    .filter((e) => e.playerId === context.playerId)
    .at(-1);
  const playerStatus = statusMap[context.playerId];

  if (lastJoinEv) {
    lastJoinEv.name = data.playerSetsName.name;
    if (lastJoinEv.name && playerStatus && playerStatus !== 'DoNotDisturb') {
      handleGathNotif({
        id: context.player.id,
        name: data.playerSetsName.name,
        isInGath: true,
      });
      removeFromJoinQ(context.playerId);
    }
  }
});

game.subscribeToEvent('playerJoins', (_data, context) =>
  joinQ.push({
    playerId: context.playerId,
    name: null,
  })
);

game.subscribeToEvent('playerExits', (_data, context) => {
  if (statusMap[context.playerId] !== 'DoNotDisturb') {
    handleGathNotif({
      id: context.player.id,
      name: context.player.name,
      isInGath: false,
    });
  }
  removeFromJoinQ(context.playerId);
  statusMap[context.playerId] = null;
});

game.subscribeToEvent('playerSetsAvailability', (data, context) => {
  const lastJoinEv = joinQ
    .filter((e) => e.playerId === context.playerId)
    .at(-1);
  const playerStatus = data.playerSetsAvailability.status;
  const previousStatus = statusMap[context.playerId];
  statusMap[context.playerId] = playerStatus;

  if (lastJoinEv) {
    if (lastJoinEv.name && playerStatus !== 'DoNotDisturb') {
      removeFromJoinQ(context.playerId);

      handleGathNotif({
        id: context.player.id,
        name: lastJoinEv.name,
        isInGath: true,
      });
    }
  }

  if (
    !lastJoinEv &&
    previousStatus === 'DoNotDisturb' &&
    playerStatus !== 'DoNotDisturb'
  ) {
    handleGathNotif({
      id: context.player.id,
      name: context.player.name,
      isInGath: true,
    });
  }

  if (
    previousStatus &&
    previousStatus !== 'DoNotDisturb' &&
    playerStatus === 'DoNotDisturb'
  ) {
    handleGathNotif({
      id: context.player.id,
      name: context.player.name,
      isInGath: false,
    });
  }
});

game.subscribeToEvent('playerInteractsWithObject', (data, context) => {
  console.log(JSON.stringify(game.players, null));
  debugger;
  const playerName = context?.player?.name;
  const objectId = data?.playerInteractsWithObject?.key;
  const bird = context?.map?.objects?.[objectId];
  const message =
    bird?.properties?.message ??
    '... nothing! This bish forgot to make the bird a note!';

  if (bird._name === 'Calling bird') {
    handleGathNotif({
      id: context.player.id,
      name: playerName,
      message: `${playerName} says ${message}`,
    });
  }
});
