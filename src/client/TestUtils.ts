// eslint-disable-next-line import/no-extraneous-dependencies
import { io, Socket } from 'socket.io-client';
import { Socket as ServerSocket } from 'socket.io';

import { AddressInfo } from 'net';
import http from 'http';
import { nanoid } from 'nanoid';
import { UserLocation } from '../CoveyTypes';
import { BoundingBox, ServerConversationArea } from './TownsServiceClient';
import CoveyTownController from '../lib/CoveyTownController';
import Player from '../types/Player';
import PlayerSession from '../types/PlayerSession';

export type RemoteServerPlayer = {
  location: UserLocation;
  _userName: string;
  _id: string;
};
const createdSocketClients: Socket[] = [];

/**
 * Socket clients need to be disconnected when you're done with them to prevent tests from stalling.
 * This helper function will clean up any sockets that were created from the createSocketClient helper below - it should
 * be called in the afterEach() handler in any test suite that calls createSocketClient (this should already be in place
 * in the handout code))
 */
export function cleanupSockets(): void {
  while (createdSocketClients.length) {
    const socket = createdSocketClients.pop();
    if (socket && socket.connected) {
      socket.disconnect();
    }
  }
}

type CreateSocketClientParms = {
  socket: Socket;
  socketConnected: Promise<void>;
  socketDisconnected: Promise<void>;
  playerMoved: Promise<RemoteServerPlayer>;
  newPlayerJoined: Promise<RemoteServerPlayer>;
  playerDisconnected: Promise<RemoteServerPlayer>;
};

/**
 * A handy test helper that will create a socket client that is properly configured to connect to the testing server.
 * This function also creates promises that will be resolved only once the socket is connected/disconnected/a player moved/
 * a new player has joined/a player has disconnected. These promises make it much easier to write a test that depends on
 * some action being fired on the socket, since you can simply write `await socketConnected;` (for any of these events).
 *
 * Feel free to use, not use, or modify this code as you feel fit.
 *
 * @param server The HTTP Server instance that the socket should connect to
 * @param sessionToken A Covey.Town session token to pass as authentication
 * @param coveyTownID A Covey.Town Town ID to pass to the server as our desired town
 */
export function createSocketClient(
  server: http.Server,
  sessionToken: string,
  coveyTownID: string,
): CreateSocketClientParms {
  const address = server.address() as AddressInfo;
  const socket = io(`http://localhost:${address.port}`, {
    auth: { token: sessionToken, coveyTownID },
    reconnection: false,
    timeout: 5000,
  });
  const connectPromise = new Promise<void>(resolve => {
    socket.on('connect', () => {
      resolve();
    });
  });
  const disconnectPromise = new Promise<void>(resolve => {
    socket.on('disconnect', () => {
      resolve();
    });
  });
  const playerMovedPromise = new Promise<RemoteServerPlayer>(resolve => {
    socket.on('playerMoved', (player: RemoteServerPlayer) => {
      resolve(player);
    });
  });
  const newPlayerPromise = new Promise<RemoteServerPlayer>(resolve => {
    socket.on('newPlayer', (player: RemoteServerPlayer) => {
      resolve(player);
    });
  });
  const playerDisconnectPromise = new Promise<RemoteServerPlayer>(resolve => {
    socket.on('playerDisconnect', (player: RemoteServerPlayer) => {
      resolve(player);
    });
  });
  createdSocketClients.push(socket);
  return {
    socket,
    socketConnected: connectPromise,
    socketDisconnected: disconnectPromise,
    playerMoved: playerMovedPromise,
    newPlayerJoined: newPlayerPromise,
    playerDisconnected: playerDisconnectPromise,
  };
}
export function setSessionTokenAndTownID(
  coveyTownID: string,
  sessionToken: string,
  socket: ServerSocket,
): void {
  // eslint-disable-next-line
  socket.handshake.auth = { token: sessionToken, coveyTownID };
}

export function createConversationForTesting(params?: {
  conversationLabel?: string;
  conversationTopic?: string;
  boundingBox?: BoundingBox;
  isTopicUndefined?: boolean;
}): ServerConversationArea {
  return {
    boundingBox: params?.boundingBox || { height: 100, width: 100, x: 400, y: 400 },
    label: params?.conversationLabel || nanoid(),
    occupantsByID: [],
    topic: params?.isTopicUndefined ? '' : params?.conversationTopic || nanoid(),
  };
}

export async function addPlayerToTown(testingTown: CoveyTownController): Promise<PlayerSession> {
  const player = new Player(nanoid());
  const playerSession = await testingTown.addPlayer(player);
  return playerSession;
}

export function addConversationAreaToTown(
  testingTown: CoveyTownController,
  boundingBox?: BoundingBox,
): ServerConversationArea | undefined {
  const newConversationArea = createConversationForTesting({
    boundingBox,
  });

  const result = testingTown.addConversationArea(newConversationArea);

  if (!result) {
    return undefined;
  }

  return newConversationArea;
}

export async function movePlayerToPosition(
  testingTown: CoveyTownController,
  player: Player,
  x: number,
  y: number,
  conversationArea?: ServerConversationArea | undefined,
): Promise<void> {
  const newLocation: UserLocation = {
    moving: false,
    rotation: 'front',
    x,
    y,
    conversationLabel: conversationArea?.label,
  };

  testingTown.updatePlayerLocation(player, newLocation);
}

export async function movePlayerToBoundingBox(
  testingTown: CoveyTownController,
  player: Player,
  boundingBox: BoundingBox,
  conversationArea?: ServerConversationArea | undefined,
): Promise<void> {
  movePlayerToPosition(testingTown, player, boundingBox.x, boundingBox.y, conversationArea);
}

type NewPlayerAndConversationArea = {
  playerSession: PlayerSession;
  conversationArea?: ServerConversationArea;
};

export async function addNewPlayerToNewArea(
  testingTown: CoveyTownController,
  newConversationAreaBox: BoundingBox,
): Promise<NewPlayerAndConversationArea> {
  const playerSession = await addPlayerToTown(testingTown);

  const conversationArea = addConversationAreaToTown(testingTown, newConversationAreaBox);
  if (!conversationArea) {
    return {
      playerSession,
    };
  }

  // move player inside the new conversation area
  movePlayerToBoundingBox(
    testingTown,
    playerSession.player,
    conversationArea.boundingBox,
    conversationArea,
  );

  return {
    conversationArea,
    playerSession,
  };
}
