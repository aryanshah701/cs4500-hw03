import { nanoid } from 'nanoid';
import { mock, mockDeep, mockReset } from 'jest-mock-extended';
import { Socket } from 'socket.io';
import TwilioVideo from './TwilioVideo';
import Player from '../types/Player';
import CoveyTownController from './CoveyTownController';
import CoveyTownListener from '../types/CoveyTownListener';
import { UserLocation } from '../CoveyTypes';
import PlayerSession from '../types/PlayerSession';
import { townSubscriptionHandler } from '../requestHandlers/CoveyTownRequestHandlers';
import CoveyTownsStore from './CoveyTownsStore';
import * as TestUtils from '../client/TestUtils';
import { ServerConversationArea } from '../client/TownsServiceClient';

const mockTwilioVideo = mockDeep<TwilioVideo>();
jest.spyOn(TwilioVideo, 'getInstance').mockReturnValue(mockTwilioVideo);

function generateTestLocation(): UserLocation {
  return {
    rotation: 'back',
    moving: Math.random() < 0.5,
    x: Math.floor(Math.random() * 100),
    y: Math.floor(Math.random() * 100),
  };
}

describe('CoveyTownController', () => {
  beforeEach(() => {
    mockTwilioVideo.getTokenForTown.mockClear();
  });
  it('constructor should set the friendlyName property', () => {
    const townName = `FriendlyNameTest-${nanoid()}`;
    const townController = new CoveyTownController(townName, false);
    expect(townController.friendlyName).toBe(townName);
  });
  describe('addPlayer', () => {
    it('should use the coveyTownID and player ID properties when requesting a video token', async () => {
      const townName = `FriendlyNameTest-${nanoid()}`;
      const townController = new CoveyTownController(townName, false);
      const newPlayerSession = await townController.addPlayer(new Player(nanoid()));
      expect(mockTwilioVideo.getTokenForTown).toBeCalledTimes(1);
      expect(mockTwilioVideo.getTokenForTown).toBeCalledWith(
        townController.coveyTownID,
        newPlayerSession.player.id,
      );
    });
  });
  describe('town listeners and events', () => {
    let testingTown: CoveyTownController;
    const mockListeners = [
      mock<CoveyTownListener>(),
      mock<CoveyTownListener>(),
      mock<CoveyTownListener>(),
    ];
    beforeEach(() => {
      const townName = `town listeners and events tests ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
      mockListeners.forEach(mockReset);
    });
    it('should notify added listeners of player movement when updatePlayerLocation is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);
      const newLocation = generateTestLocation();
      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      testingTown.updatePlayerLocation(player, newLocation);
      mockListeners.forEach(listener => expect(listener.onPlayerMoved).toBeCalledWith(player));
    });
    it('should notify added listeners of player disconnections when destroySession is called', async () => {
      const player = new Player('test player');
      const session = await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      testingTown.destroySession(session);
      mockListeners.forEach(listener =>
        expect(listener.onPlayerDisconnected).toBeCalledWith(player),
      );
    });
    it('should notify added listeners of new players when addPlayer is called', async () => {
      mockListeners.forEach(listener => testingTown.addTownListener(listener));

      const player = new Player('test player');
      await testingTown.addPlayer(player);
      mockListeners.forEach(listener => expect(listener.onPlayerJoined).toBeCalledWith(player));
    });
    it('should notify added listeners that the town is destroyed when disconnectAllPlayers is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      testingTown.disconnectAllPlayers();
      mockListeners.forEach(listener => expect(listener.onTownDestroyed).toBeCalled());
    });
    it('should not notify removed listeners of player movement when updatePlayerLocation is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const newLocation = generateTestLocation();
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.updatePlayerLocation(player, newLocation);
      expect(listenerRemoved.onPlayerMoved).not.toBeCalled();
    });
    it('should not notify removed listeners of player disconnections when destroySession is called', async () => {
      const player = new Player('test player');
      const session = await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.destroySession(session);
      expect(listenerRemoved.onPlayerDisconnected).not.toBeCalled();
    });
    it('should not notify removed listeners of new players when addPlayer is called', async () => {
      const player = new Player('test player');

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      const session = await testingTown.addPlayer(player);
      testingTown.destroySession(session);
      expect(listenerRemoved.onPlayerJoined).not.toBeCalled();
    });

    it('should not notify removed listeners that the town is destroyed when disconnectAllPlayers is called', async () => {
      const player = new Player('test player');
      await testingTown.addPlayer(player);

      mockListeners.forEach(listener => testingTown.addTownListener(listener));
      const listenerRemoved = mockListeners[1];
      testingTown.removeTownListener(listenerRemoved);
      testingTown.disconnectAllPlayers();
      expect(listenerRemoved.onTownDestroyed).not.toBeCalled();
    });
  });
  describe('townSubscriptionHandler', () => {
    const mockSocket = mock<Socket>();
    let testingTown: CoveyTownController;
    let player: Player;
    let session: PlayerSession;
    beforeEach(async () => {
      const townName = `connectPlayerSocket tests ${nanoid()}`;
      testingTown = CoveyTownsStore.getInstance().createTown(townName, false);
      mockReset(mockSocket);
      player = new Player('test player');
      session = await testingTown.addPlayer(player);
    });
    it('should reject connections with invalid town IDs by calling disconnect', async () => {
      TestUtils.setSessionTokenAndTownID(nanoid(), session.sessionToken, mockSocket);
      townSubscriptionHandler(mockSocket);
      expect(mockSocket.disconnect).toBeCalledWith(true);
    });
    it('should reject connections with invalid session tokens by calling disconnect', async () => {
      TestUtils.setSessionTokenAndTownID(testingTown.coveyTownID, nanoid(), mockSocket);
      townSubscriptionHandler(mockSocket);
      expect(mockSocket.disconnect).toBeCalledWith(true);
    });
    describe('with a valid session token', () => {
      it('should add a town listener, which should emit "newPlayer" to the socket when a player joins', async () => {
        TestUtils.setSessionTokenAndTownID(
          testingTown.coveyTownID,
          session.sessionToken,
          mockSocket,
        );
        townSubscriptionHandler(mockSocket);
        await testingTown.addPlayer(player);
        expect(mockSocket.emit).toBeCalledWith('newPlayer', player);
      });
      it('should add a town listener, which should emit "playerMoved" to the socket when a player moves', async () => {
        TestUtils.setSessionTokenAndTownID(
          testingTown.coveyTownID,
          session.sessionToken,
          mockSocket,
        );
        townSubscriptionHandler(mockSocket);
        testingTown.updatePlayerLocation(player, generateTestLocation());
        expect(mockSocket.emit).toBeCalledWith('playerMoved', player);
      });
      it('should add a town listener, which should emit "playerDisconnect" to the socket when a player disconnects', async () => {
        TestUtils.setSessionTokenAndTownID(
          testingTown.coveyTownID,
          session.sessionToken,
          mockSocket,
        );
        townSubscriptionHandler(mockSocket);
        testingTown.destroySession(session);
        expect(mockSocket.emit).toBeCalledWith('playerDisconnect', player);
      });
      it('should add a town listener, which should emit "townClosing" to the socket and disconnect it when disconnectAllPlayers is called', async () => {
        TestUtils.setSessionTokenAndTownID(
          testingTown.coveyTownID,
          session.sessionToken,
          mockSocket,
        );
        townSubscriptionHandler(mockSocket);
        testingTown.disconnectAllPlayers();
        expect(mockSocket.emit).toBeCalledWith('townClosing');
        expect(mockSocket.disconnect).toBeCalledWith(true);
      });
      describe('when a socket disconnect event is fired', () => {
        it('should remove the town listener for that socket, and stop sending events to it', async () => {
          TestUtils.setSessionTokenAndTownID(
            testingTown.coveyTownID,
            session.sessionToken,
            mockSocket,
          );
          townSubscriptionHandler(mockSocket);

          // find the 'disconnect' event handler for the socket, which should have been registered after the socket was connected
          const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect');
          if (disconnectHandler && disconnectHandler[1]) {
            disconnectHandler[1]();
            const newPlayer = new Player('should not be notified');
            await testingTown.addPlayer(newPlayer);
            expect(mockSocket.emit).not.toHaveBeenCalledWith('newPlayer', newPlayer);
          } else {
            fail('No disconnect handler registered');
          }
        });
        it('should destroy the session corresponding to that socket', async () => {
          TestUtils.setSessionTokenAndTownID(
            testingTown.coveyTownID,
            session.sessionToken,
            mockSocket,
          );
          townSubscriptionHandler(mockSocket);

          // find the 'disconnect' event handler for the socket, which should have been registered after the socket was connected
          const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect');
          if (disconnectHandler && disconnectHandler[1]) {
            disconnectHandler[1]();
            mockReset(mockSocket);
            TestUtils.setSessionTokenAndTownID(
              testingTown.coveyTownID,
              session.sessionToken,
              mockSocket,
            );
            townSubscriptionHandler(mockSocket);
            expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
          } else {
            fail('No disconnect handler registered');
          }
        });
      });
      it('should forward playerMovement events from the socket to subscribed listeners', async () => {
        TestUtils.setSessionTokenAndTownID(
          testingTown.coveyTownID,
          session.sessionToken,
          mockSocket,
        );
        townSubscriptionHandler(mockSocket);
        const mockListener = mock<CoveyTownListener>();
        testingTown.addTownListener(mockListener);
        // find the 'playerMovement' event handler for the socket, which should have been registered after the socket was connected
        const playerMovementHandler = mockSocket.on.mock.calls.find(
          call => call[0] === 'playerMovement',
        );
        if (playerMovementHandler && playerMovementHandler[1]) {
          const newLocation = generateTestLocation();
          player.location = newLocation;
          playerMovementHandler[1](newLocation);
          expect(mockListener.onPlayerMoved).toHaveBeenCalledWith(player);
        } else {
          fail('No playerMovement handler registered');
        }
      });
    });
  });

  describe('addConversationArea', () => {
    let testingTown: CoveyTownController;
    beforeEach(() => {
      const townName = `addConversationArea test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
    });
    it('a valid conversation area should be added to the list of conversation areas', () => {
      const newConversationArea = TestUtils.createConversationForTesting();
      const isConversationAdded = testingTown.addConversationArea(newConversationArea);
      expect(isConversationAdded).toBe(true);

      const areas = testingTown.conversationAreas;
      expect(areas.length).toEqual(1);
      expect(areas[0].label).toEqual(newConversationArea.label);
      expect(areas[0].topic).toEqual(newConversationArea.topic);
      expect(areas[0].boundingBox).toEqual(newConversationArea.boundingBox);
    });

    it('a conversation area without a falsy label should not be added', () => {
      const newConversationArea = TestUtils.createConversationForTesting({
        isTopicUndefined: true,
      });
      const isConversationAdded = testingTown.addConversationArea(newConversationArea);
      expect(isConversationAdded).toBe(false);
    });

    it('a conversation area with the same label as an existing conversation area should not be added', () => {
      // add a new conversation area with a test label and ensure it is added
      const conversationLabel = 'Test label';
      const boundingBox1 = { x: 5, y: 5, width: 5, height: 5 };
      const newConversationArea1 = TestUtils.createConversationForTesting({
        conversationLabel,
        boundingBox: boundingBox1,
      });

      const isConversationAdded1 = testingTown.addConversationArea(newConversationArea1);
      expect(isConversationAdded1).toBe(true);
      const areas = testingTown.conversationAreas;
      expect(areas.length).toBe(1);
      expect(areas[0].label).toBe(conversationLabel);

      // ensure another area with the same label cannot be added
      const boundingBox2 = { x: 50, y: 50, width: 5, height: 5 };
      const newConversationArea2 = TestUtils.createConversationForTesting({
        conversationLabel,
        boundingBox: boundingBox2,
      });

      const isConversationAdded2 = testingTown.addConversationArea(newConversationArea2);
      expect(isConversationAdded2).toBe(false);
    });

    it('a conversation area that is exactly on top of another conversation area should not be added', () => {
      const boundingBox = { x: 5, y: 5, width: 5, height: 5 };
      const conversationArea1 = TestUtils.createConversationForTesting({ boundingBox });

      const isConversationAdded1 = testingTown.addConversationArea(conversationArea1);
      expect(isConversationAdded1).toBe(true);

      const conversationArea2 = TestUtils.createConversationForTesting({ boundingBox });
      const isConversationAdded2 = testingTown.addConversationArea(conversationArea2);
      expect(isConversationAdded2).toBe(false);
    });

    it('a conversation area that overlaps with another conversation area should not be added', () => {
      const boundingBox1 = { x: 5, y: 5, width: 5, height: 5 };
      const conversationArea1 = TestUtils.createConversationForTesting({
        boundingBox: boundingBox1,
      });

      const isConversationAdded1 = testingTown.addConversationArea(conversationArea1);
      expect(isConversationAdded1).toBe(true);

      const boundingBox2 = { x: 2, y: 2, width: 5, height: 5 };
      const conversationArea2 = TestUtils.createConversationForTesting({
        boundingBox: boundingBox2,
      });
      const isConversationAdded2 = testingTown.addConversationArea(conversationArea2);
      expect(isConversationAdded2).toBe(false);
    });

    it('a conversation area adjacent to another conversation area can be added', () => {
      // x: 2.5 - 7.5, y: 2.5 - 7.5
      const boundingBox1 = { x: 5, y: 5, width: 5, height: 5 };
      const conversationArea1 = TestUtils.createConversationForTesting({
        boundingBox: boundingBox1,
      });

      const isConversationAdded1 = testingTown.addConversationArea(conversationArea1);
      expect(isConversationAdded1).toBe(true);

      // x: 7.5 - 12.5, y: 2.5 - 7.5
      const boundingBox2 = { x: 10, y: 5, width: 5, height: 5 };
      const conversationArea2 = TestUtils.createConversationForTesting({
        boundingBox: boundingBox2,
      });
      const isConversationAdded2 = testingTown.addConversationArea(conversationArea2);
      expect(isConversationAdded2).toBe(true);
    });

    it('a player in the center of bounding box of a new conversation area should be added to the occupants list', async () => {
      const newConversationAreaBox = { x: 5, y: 5, width: 5, height: 5 };

      // add a new player and move the player to a position
      const newPlayerSession = await TestUtils.addPlayerToTown(testingTown);
      TestUtils.movePlayerToBoundingBox(
        testingTown,
        newPlayerSession.player,
        newConversationAreaBox,
      );

      // add a conversation area on top of the player
      const newConversationArea = TestUtils.createConversationForTesting({
        boundingBox: newConversationAreaBox,
      });
      const isConversationAdded = testingTown.addConversationArea(newConversationArea);
      expect(isConversationAdded).toBe(true);

      const areas = testingTown.conversationAreas;
      expect(areas.length).toBe(1);

      // ensure the player is added to the occupant list
      const newConversationAreaOccupants = areas[0].occupantsByID;
      expect(newConversationAreaOccupants.length).toBe(1);
      expect(newConversationAreaOccupants).toContain(newPlayerSession.player.id);
    });

    it('a player somewhere in the bounding box of a new conversation area should be added to the occupants list', async () => {
      const newConversationAreaBox = { x: 5, y: 5, width: 5, height: 5 };

      // add a new player and move the player to somewhere in the conversation area
      const newPlayerSession = await TestUtils.addPlayerToTown(testingTown);
      const playerX = newConversationAreaBox.x - newConversationAreaBox.width / 3;
      const playerY = newConversationAreaBox.y - newConversationAreaBox.height / 3;
      TestUtils.movePlayerToPosition(testingTown, newPlayerSession.player, playerX, playerY);

      // add a conversation area on top of the player
      const newConversationArea = TestUtils.createConversationForTesting({
        boundingBox: newConversationAreaBox,
      });
      const isConversationAdded = testingTown.addConversationArea(newConversationArea);
      expect(isConversationAdded).toBe(true);

      const areas = testingTown.conversationAreas;
      expect(areas.length).toBe(1);

      // ensure the player is added to the occupant list
      const newConversationAreaOccupants = areas[0].occupantsByID;
      expect(newConversationAreaOccupants.length).toBe(1);
      expect(newConversationAreaOccupants).toContain(newPlayerSession.player.id);
    });

    it('players not in the bounding box of the new conversation area should not be added to the occupant list', async () => {
      const newConversationAreaBox = { x: 5, y: 5, width: 5, height: 5 };

      // add a new player and move the player to somewhere out of the conversation area
      const newPlayerSession = await TestUtils.addPlayerToTown(testingTown);
      const playerX = newConversationAreaBox.x + newConversationAreaBox.width;
      const playerY = newConversationAreaBox.y + newConversationAreaBox.height;
      TestUtils.movePlayerToPosition(testingTown, newPlayerSession.player, playerX, playerY);

      // add a conversation area on top of the player
      const newConversationArea = TestUtils.createConversationForTesting({
        boundingBox: newConversationAreaBox,
      });
      const isConversationAdded = testingTown.addConversationArea(newConversationArea);
      expect(isConversationAdded).toBe(true);

      const areas = testingTown.conversationAreas;
      expect(areas.length).toBe(1);

      // ensure the player is not added to the occupant list
      const newConversationAreaOccupants = areas[0].occupantsByID;
      expect(newConversationAreaOccupants.length).toBe(0);
    });

    it('players on the edge of the bounding box of the new conversation area should not be added to the occupant list', async () => {
      const newConversationAreaBox = { x: 5, y: 5, width: 5, height: 5 };

      // add a new player and move the player to the edge of the conversation area
      const newPlayerSession = await TestUtils.addPlayerToTown(testingTown);
      const playerX = newConversationAreaBox.x + newConversationAreaBox.width / 2;
      const playerY = newConversationAreaBox.y + newConversationAreaBox.height / 3;
      TestUtils.movePlayerToPosition(testingTown, newPlayerSession.player, playerX, playerY);

      // add a conversation area on top of the player
      const newConversationArea = TestUtils.createConversationForTesting({
        boundingBox: newConversationAreaBox,
      });
      const isConversationAdded = testingTown.addConversationArea(newConversationArea);
      expect(isConversationAdded).toBe(true);

      const areas = testingTown.conversationAreas;
      expect(areas.length).toBe(1);

      // ensure the player is not added to the occupant list
      const newConversationAreaOccupants = areas[0].occupantsByID;
      expect(newConversationAreaOccupants.length).toBe(0);
    });

    it('players added to the occupant list of the conversation area should have their activeConversationArea field updated', async () => {
      const newConversationAreaBox = { x: 5, y: 5, width: 5, height: 5 };

      // add a new player and move the player to a position
      const newPlayerSession = await TestUtils.addPlayerToTown(testingTown);
      TestUtils.movePlayerToBoundingBox(
        testingTown,
        newPlayerSession.player,
        newConversationAreaBox,
      );

      // add a conversation area on top of the player
      const newConversationArea = TestUtils.createConversationForTesting({
        boundingBox: newConversationAreaBox,
      });
      const isConversationAdded = testingTown.addConversationArea(newConversationArea);
      expect(isConversationAdded).toBe(true);

      const areas = testingTown.conversationAreas;
      expect(areas.length).toBe(1);

      // ensure the player's active conversation is the new conversationa area
      expect(newPlayerSession.player.activeConversationArea).toBeDefined();
      expect(newPlayerSession.player.activeConversationArea?.label).toBe(areas[0].label);
    });

    it('onConversationUpdate is emitted for all listeners subscribed to this town when a new conversation area is added', () => {
      const mockListeners = [
        mock<CoveyTownListener>(),
        mock<CoveyTownListener>(),
        mock<CoveyTownListener>(),
      ];
      mockListeners.forEach(listener => {
        testingTown.addTownListener(listener);
      });

      const newConversationArea = TestUtils.createConversationForTesting();
      const isConversationAdded = testingTown.addConversationArea(newConversationArea);
      expect(isConversationAdded).toBe(true);

      mockListeners.forEach(listener => {
        expect(listener.onConversationAreaUpdated).toHaveBeenCalledTimes(1);
        expect(listener.onConversationAreaUpdated).toHaveBeenCalledWith(newConversationArea);
      });
    });
  });
  describe('updatePlayerLocation', () => {
    let testingTown: CoveyTownController;
    let player: Player;

    beforeEach(async () => {
      const townName = `updatePlayerLocation test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);
      const playerSession = await TestUtils.addPlayerToTown(testingTown);
      player = playerSession.player;
    });

    it("should update the player's coords", () => {
      const newLocation: UserLocation = {
        moving: false,
        rotation: 'front',
        x: 25,
        y: 25,
      };

      testingTown.updatePlayerLocation(player, newLocation);

      const playerLocation = player.location;

      expect(playerLocation.x).toBe(newLocation.x);
      expect(playerLocation.y).toBe(newLocation.y);
      expect(playerLocation.rotation).toBe(newLocation.rotation);
      expect(playerLocation.rotation).toBe(newLocation.rotation);
    });

    describe('impact on conversation area', () => {
      const mockListeners = [
        mock<CoveyTownListener>(),
        mock<CoveyTownListener>(),
        mock<CoveyTownListener>(),
      ];

      beforeEach(() => {
        const newLocation = TestUtils.userLocation({ x: 10, y: 10 });
        testingTown.updatePlayerLocation(player, newLocation);
        mockListeners.forEach(mockReset);
      });

      it("should respect the conversation area reported by the player userLocation.conversationLabel, and not override it based on the player's x,y location", async () => {
        const newConversationArea = TestUtils.createConversationForTesting({
          boundingBox: { x: 10, y: 10, height: 5, width: 5 },
        });
        const result = testingTown.addConversationArea(newConversationArea);
        expect(result).toBe(true);

        const newLocation = TestUtils.userLocation({
          x: 25,
          y: 25,
          conversationLabel: newConversationArea.label,
        });
        testingTown.updatePlayerLocation(player, newLocation);
        expect(player.activeConversationArea?.label).toEqual(newConversationArea.label);
        expect(player.activeConversationArea?.topic).toEqual(newConversationArea.topic);
        expect(player.activeConversationArea?.boundingBox).toEqual(newConversationArea.boundingBox);

        const areas = testingTown.conversationAreas;
        expect(areas[0].occupantsByID.length).toBe(1);
        expect(areas[0].occupantsByID[0]).toBe(player.id);
      });

      describe('player goes from one conversation area to another', () => {
        let oldConversationArea: ServerConversationArea;
        let newConversationArea: ServerConversationArea;

        beforeEach(async () => {
          // add another player to the old conversation area so that it doesn't
          // get deleted when player 1 leaves
          const { player: player2 } = await TestUtils.addPlayerToTown(testingTown);
          const player2Location = TestUtils.userLocation({ x: 9, y: 9 });
          testingTown.updatePlayerLocation(player2, player2Location);

          // add a conversation area on top of 2 player's position
          const oldConversationAreaBox = { x: 10, y: 10, height: 5, width: 5 };
          oldConversationArea = TestUtils.createConversationForTesting({
            boundingBox: oldConversationAreaBox,
          });
          const isOldConversationAreaAdded = testingTown.addConversationArea(oldConversationArea);
          expect(isOldConversationAreaAdded).toBe(true);
          expect(oldConversationArea.occupantsByID).toHaveLength(2);

          // add another conversation area
          const newConversationAreaBox = { x: 100, y: 100, height: 5, width: 5 };
          newConversationArea = TestUtils.createConversationForTesting({
            boundingBox: newConversationAreaBox,
          });
          const isNewConversationAreaAdded = testingTown.addConversationArea(newConversationArea);
          expect(isNewConversationAreaAdded).toBe(true);
        });

        it("should update the player's active conversation area", async () => {
          testingTown.updatePlayerLocation(
            player,
            TestUtils.userLocation({ conversationLabel: newConversationArea.label }),
          );
          expect(player.activeConversationArea).toBe(newConversationArea);
        });

        it('should add the player to the occupant list of the new conversation area', async () => {
          testingTown.updatePlayerLocation(
            player,
            TestUtils.userLocation({ conversationLabel: newConversationArea.label }),
          );
          expect(newConversationArea.occupantsByID).toHaveLength(1);
          expect(newConversationArea.occupantsByID).toContain(player.id);
        });

        it('should remove the player to the occupant list of the old conversation area', async () => {
          testingTown.updatePlayerLocation(
            player,
            TestUtils.userLocation({ conversationLabel: newConversationArea.label }),
          );
          expect(oldConversationArea.occupantsByID).toHaveLength(1);
          expect(oldConversationArea.occupantsByID).not.toContain(player.id);
        });

        it('should emit onConversationUpdate events for both conversation areas', async () => {
          mockListeners.forEach(listener => {
            testingTown.addTownListener(listener);
          });

          testingTown.updatePlayerLocation(
            player,
            TestUtils.userLocation({ conversationLabel: newConversationArea.label }),
          );

          mockListeners.forEach(listener => {
            expect(listener.onConversationAreaUpdated).toHaveBeenCalledTimes(2);
            expect(listener.onConversationAreaUpdated).toHaveBeenCalledWith(newConversationArea);
            expect(listener.onConversationAreaUpdated).toHaveBeenCalledWith(oldConversationArea);
            expect(listener.onConversationAreaDestroyed).toHaveBeenCalledTimes(0);
          });
        });
      });

      describe('player goes from one conversation area to no conversation area', () => {
        let oldConversationArea: ServerConversationArea;

        beforeEach(async () => {
          // add another player to the old conversation area so that it doesn't
          // get deleted when player 1 leaves
          const { player: player2 } = await TestUtils.addPlayerToTown(testingTown);
          const player2Location = TestUtils.userLocation({ x: 9, y: 9 });
          testingTown.updatePlayerLocation(player2, player2Location);

          // add a conversation area on top of 2 player's position
          const oldConversationAreaBox = { x: 10, y: 10, height: 5, width: 5 };
          oldConversationArea = TestUtils.createConversationForTesting({
            boundingBox: oldConversationAreaBox,
          });
          const isOldConversationAreaAdded = testingTown.addConversationArea(oldConversationArea);
          expect(isOldConversationAreaAdded).toBe(true);
          expect(oldConversationArea.occupantsByID).toHaveLength(2);
        });

        it("should update the player's active conversation area to undef", async () => {
          testingTown.updatePlayerLocation(player, TestUtils.userLocation({}));
          expect(player.activeConversationArea).not.toBeDefined();
        });

        it('should remove the player from the occupant list of the old conversation area', async () => {
          testingTown.updatePlayerLocation(player, TestUtils.userLocation({}));
          expect(oldConversationArea.occupantsByID).toHaveLength(1);
          expect(oldConversationArea.occupantsByID).not.toContain(player.id);
        });

        it('should emit onConversationUpdate event for the old conversation area', async () => {
          mockListeners.forEach(listener => {
            testingTown.addTownListener(listener);
          });

          testingTown.updatePlayerLocation(player, TestUtils.userLocation({}));

          mockListeners.forEach(listener => {
            expect(listener.onConversationAreaUpdated).toHaveBeenCalledTimes(1);
            expect(listener.onConversationAreaUpdated).toHaveBeenCalledWith(oldConversationArea);
            expect(listener.onConversationAreaDestroyed).toHaveBeenCalledTimes(0);
          });
        });
      });

      describe('player goes from no conversation area to a conversation area', () => {
        let newConversationArea: ServerConversationArea;

        beforeEach(async () => {
          // add a conversation area
          const newConversationAreaBox = { x: 100, y: 100, height: 5, width: 5 };
          newConversationArea = TestUtils.createConversationForTesting({
            boundingBox: newConversationAreaBox,
          });
          const isNewConversationAreaAdded = testingTown.addConversationArea(newConversationArea);
          expect(isNewConversationAreaAdded).toBe(true);
        });

        it("should update the player's active conversation area to the new conversation area", async () => {
          testingTown.updatePlayerLocation(
            player,
            TestUtils.userLocation({ conversationLabel: newConversationArea.label }),
          );

          expect(player.activeConversationArea).toBe(newConversationArea);
        });

        it('should add the player to the occupant list of the new conversation area', async () => {
          testingTown.updatePlayerLocation(
            player,
            TestUtils.userLocation({ conversationLabel: newConversationArea.label }),
          );

          expect(newConversationArea.occupantsByID).toHaveLength(1);
          expect(newConversationArea.occupantsByID).toContain(player.id);
        });

        it('should emit onConversationUpdate only for the new conversation area', async () => {
          mockListeners.forEach(listener => {
            testingTown.addTownListener(listener);
          });

          testingTown.updatePlayerLocation(
            player,
            TestUtils.userLocation({ conversationLabel: newConversationArea.label }),
          );

          mockListeners.forEach(listener => {
            expect(listener.onConversationAreaUpdated).toHaveBeenCalledTimes(1);
            expect(listener.onConversationAreaUpdated).toHaveBeenCalledWith(newConversationArea);
            expect(listener.onConversationAreaDestroyed).toHaveBeenCalledTimes(0);
          });
        });
      });

      describe('player goes from no conversation area to no conversation area', () => {
        beforeEach(async () => {
          // add a few conversation areas
          TestUtils.addConversationAreaToTown(testingTown, { x: 20, y: 10, width: 5, height: 5 });
          TestUtils.addConversationAreaToTown(testingTown, { x: 30, y: 10, width: 5, height: 5 });
          TestUtils.addConversationAreaToTown(testingTown, { x: 40, y: 10, width: 5, height: 5 });
        });

        it("should have no effect on the player's active conversation area", async () => {
          testingTown.updatePlayerLocation(player, TestUtils.userLocation({}));
          expect(player.activeConversationArea).not.toBeDefined();
        });

        it('should have no effect on the occupant list of any of the conversation areas', async () => {
          testingTown.updatePlayerLocation(player, TestUtils.userLocation({}));
          testingTown.conversationAreas.forEach(area => {
            expect(area.occupantsByID).toHaveLength(0);
          });
        });

        it('should not emit any onConversationUpdate events', async () => {
          mockListeners.forEach(listener => {
            testingTown.addTownListener(listener);
          });

          testingTown.updatePlayerLocation(player, TestUtils.userLocation({}));

          mockListeners.forEach(listener => {
            expect(listener.onConversationAreaUpdated).toHaveBeenCalledTimes(0);
            expect(listener.onConversationAreaDestroyed).toHaveBeenCalledTimes(0);
          });
        });
      });

      describe('player stays in the same conversation area', () => {
        let conversationArea: ServerConversationArea;

        beforeEach(async () => {
          // add a conversation area on top of player's position
          const conversationAreaBox = { x: 10, y: 10, height: 5, width: 5 };
          conversationArea = TestUtils.createConversationForTesting({
            boundingBox: conversationAreaBox,
          });
          const isConversationAreaAdded = testingTown.addConversationArea(conversationArea);
          expect(isConversationAreaAdded).toBe(true);
          expect(conversationArea.occupantsByID).toHaveLength(1);

          // add multiple other conversation areas
          TestUtils.addConversationAreaToTown(testingTown, { x: 20, y: 10, width: 5, height: 5 });
          TestUtils.addConversationAreaToTown(testingTown, { x: 30, y: 10, width: 5, height: 5 });
          TestUtils.addConversationAreaToTown(testingTown, { x: 40, y: 10, width: 5, height: 5 });
        });

        it("should have no effect on the player's active conversation area", async () => {
          testingTown.updatePlayerLocation(
            player,
            TestUtils.userLocation({ x: 12, y: 12, conversationLabel: conversationArea.label }),
          );
          expect(player.activeConversationArea).toBe(conversationArea);
        });

        it('should have no effect on the occupant list of any of the conversation areas', async () => {
          testingTown.updatePlayerLocation(
            player,
            TestUtils.userLocation({ x: 12, y: 12, conversationLabel: conversationArea.label }),
          );

          testingTown.conversationAreas.forEach(area => {
            if (area.label === conversationArea.label) {
              expect(area.occupantsByID).toHaveLength(1);
            } else {
              expect(area.occupantsByID).toHaveLength(0);
            }
          });
        });

        it('should not emit any onConversationUpdate events', async () => {
          mockListeners.forEach(listener => {
            testingTown.addTownListener(listener);
          });

          testingTown.updatePlayerLocation(
            player,
            TestUtils.userLocation({ x: 12, y: 12, conversationLabel: conversationArea.label }),
          );

          mockListeners.forEach(listener => {
            expect(listener.onConversationAreaUpdated).toHaveBeenCalledTimes(0);
            expect(listener.onConversationAreaDestroyed).toHaveBeenCalledTimes(0);
          });
        });
      });

      describe('player leaves a conversation area in which they were the only one left', () => {
        let conversationArea: ServerConversationArea;

        beforeEach(async () => {
          // add a conversation area on top of player's position
          const conversationAreaBox = { x: 10, y: 10, height: 5, width: 5 };
          conversationArea = TestUtils.createConversationForTesting({
            boundingBox: conversationAreaBox,
          });
          const isConversationAreaAdded = testingTown.addConversationArea(conversationArea);
          expect(isConversationAreaAdded).toBe(true);
          expect(conversationArea.occupantsByID).toHaveLength(1);

          // add multiple other conversation areas
          TestUtils.addConversationAreaToTown(testingTown, { x: 20, y: 10, width: 5, height: 5 });
          TestUtils.addConversationAreaToTown(testingTown, { x: 30, y: 10, width: 5, height: 5 });
          TestUtils.addConversationAreaToTown(testingTown, { x: 40, y: 10, width: 5, height: 5 });
        });

        it('should emit onConversationDelete for the conversation area the player left', async () => {
          mockListeners.forEach(listener => {
            testingTown.addTownListener(listener);
          });

          testingTown.updatePlayerLocation(player, TestUtils.userLocation({}));

          mockListeners.forEach(listener => {
            expect(listener.onConversationAreaUpdated).toHaveBeenCalledTimes(0);
            expect(listener.onConversationAreaDestroyed).toHaveBeenCalledTimes(1);
            expect(listener.onConversationAreaDestroyed).toHaveBeenCalledWith(conversationArea);
          });
        });

        it('should delete the conversation area from the list of conversation areas', () => {
          const prevNumAreas = testingTown.conversationAreas.length;
          testingTown.updatePlayerLocation(player, TestUtils.userLocation({}));
          expect(testingTown.conversationAreas).toHaveLength(prevNumAreas - 1);
          expect(testingTown.conversationAreas).not.toContain(conversationArea);
        });
      });
    });
  });

  describe('destorySession', () => {
    let testingTown: CoveyTownController;
    let newConversationArea: ServerConversationArea;
    let newPlayerSession: PlayerSession;

    beforeEach(async () => {
      const townName = `destroySession test town ${nanoid()}`;
      testingTown = new CoveyTownController(townName, false);

      const newConversationAreaBox = { x: 10, y: 10, height: 5, width: 5 };
      const res = await TestUtils.addNewPlayerToNewArea(testingTown, newConversationAreaBox);

      if (!res.conversationArea) {
        fail('Failed to created the conversation area.');
      }

      newPlayerSession = res.playerSession;
      newConversationArea = res.conversationArea;
    });

    describe('update conversation area occupant list and emit appropriate events', () => {
      it('player is removed from their active conversation area when their session is destoryed', async () => {
        const occupantId = newPlayerSession.player.id;

        // ensure the player is within the conversation area before
        expect(newConversationArea.occupantsByID).toContain(occupantId);

        testingTown.destroySession(newPlayerSession);

        // ensure the player is removed from the conversation area
        expect(newConversationArea.occupantsByID).not.toContain(occupantId);
      });

      it('should emit onConversationUpdate/Destroy when a player with an active conversation area has their session removed', async () => {
        const mockListener = mock<CoveyTownListener>();
        testingTown.addTownListener(mockListener);

        testingTown.destroySession(newPlayerSession);

        // ensure onConversationArea updated listener is called with the player's active conversation area
        expect(mockListener.onConversationAreaDestroyed).toHaveBeenCalledTimes(1);
        expect(mockListener.onConversationAreaDestroyed).toHaveBeenCalledWith(newConversationArea);
      });

      it('conversation areas remain unchanged when a player is removed but they are not a players active conversation area', async () => {
        // create a conversation area with another new player
        const newConversationAreaBox = { x: 100, y: 100, height: 5, width: 5 };
        const res = await TestUtils.addNewPlayerToNewArea(testingTown, newConversationAreaBox);

        const newPlayerSession2 = res.playerSession;
        const newConversationArea2 = res.conversationArea;
        if (!newConversationArea2) {
          fail('Failed to create conversation area.');
        }

        const playerId1 = newPlayerSession.player.id;
        const playerId2 = newPlayerSession2.player.id;
        expect(newConversationArea2.occupantsByID).not.toContain(playerId1);
        expect(newConversationArea2.occupantsByID).toContain(playerId2);

        testingTown.destroySession(newPlayerSession);

        // ensure the conversation area remains unchanged
        expect(newConversationArea2.occupantsByID).not.toContain(playerId1);
        expect(newConversationArea2.occupantsByID).toContain(playerId2);
      });

      it('onConversationUpdate event is emitted only for the player that has their session removed', async () => {
        // create a conversation area with another new player
        const newConversationAreaBox = { x: 100, y: 100, height: 5, width: 5 };
        await TestUtils.addNewPlayerToNewArea(testingTown, newConversationAreaBox);

        const mockListener = mock<CoveyTownListener>();
        testingTown.addTownListener(mockListener);

        testingTown.destroySession(newPlayerSession);

        // only called once for the conversation area that is destroyed
        expect(mockListener.onConversationAreaDestroyed).toHaveBeenCalledTimes(1);
        expect(mockListener.onConversationAreaDestroyed).toHaveBeenCalledWith(newConversationArea);
      });
    });
  });
});
