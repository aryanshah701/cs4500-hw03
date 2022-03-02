import CORS from 'cors';
import Express from 'express';
import http from 'http';
import { nanoid } from 'nanoid';
import { AddressInfo } from 'net';
import { mock, mockReset } from 'jest-mock-extended';
import CoveyTownController from '../lib/CoveyTownController';
import CoveyTownsStore from '../lib/CoveyTownsStore';
import addTownRoutes from '../router/towns';
import * as requestHandlers from '../requestHandlers/CoveyTownRequestHandlers';
import { createConversationForTesting } from './TestUtils';
import TownsServiceClient, { ServerConversationArea } from './TownsServiceClient';
import PlayerSession from '../types/PlayerSession';

type TestTownData = {
  friendlyName: string;
  coveyTownID: string;
  isPubliclyListed: boolean;
  townUpdatePassword: string;
};

describe('Create Conversation Area API', () => {
  let server: http.Server;
  let apiClient: TownsServiceClient;

  async function createTownForTesting(
    friendlyNameToUse?: string,
    isPublic = false,
  ): Promise<TestTownData> {
    const friendlyName =
      friendlyNameToUse !== undefined
        ? friendlyNameToUse
        : `${isPublic ? 'Public' : 'Private'}TestingTown=${nanoid()}`;
    const ret = await apiClient.createTown({
      friendlyName,
      isPubliclyListed: isPublic,
    });
    return {
      friendlyName,
      isPubliclyListed: isPublic,
      coveyTownID: ret.coveyTownID,
      townUpdatePassword: ret.coveyTownPassword,
    };
  }

  beforeAll(async () => {
    const app = Express();
    app.use(CORS());
    server = http.createServer(app);

    addTownRoutes(server, app);
    await server.listen();
    const address = server.address() as AddressInfo;

    apiClient = new TownsServiceClient(`http://127.0.0.1:${address.port}`);
  });

  afterAll(async () => {
    await server.close();
  });
  it('Executes without error when creating a new conversation', async () => {
    const testingTown = await createTownForTesting(undefined, true);
    const testingSession = await apiClient.joinTown({
      userName: nanoid(),
      coveyTownID: testingTown.coveyTownID,
    });
    await apiClient.createConversationArea({
      conversationArea: createConversationForTesting(),
      coveyTownID: testingTown.coveyTownID,
      sessionToken: testingSession.coveySessionToken,
    });
  });
});
describe('conversationAreaCreateHandler', () => {
  const mockCoveyTownStore = mock<CoveyTownsStore>();
  const mockCoveyTownController = mock<CoveyTownController>();

  beforeAll(() => {
    // Set up a spy for CoveyTownsStore that will always return our mockCoveyTownsStore as the singleton instance
    jest.spyOn(CoveyTownsStore, 'getInstance').mockReturnValue(mockCoveyTownStore);
  });

  beforeEach(() => {
    // Reset all mock calls, and ensure that getControllerForTown will always return the same mock controller
    mockReset(mockCoveyTownController);
    mockReset(mockCoveyTownStore);
    mockCoveyTownStore.getControllerForTown.mockReturnValue(mockCoveyTownController);
  });

  describe('trying to create a conversation with an invalid token', () => {
    let coveyTownID: string;
    let conversationArea: ServerConversationArea;
    let invalidSessionToken: string;

    beforeEach(() => {
      coveyTownID = nanoid();
      conversationArea = createConversationForTesting();

      // Make sure to return 'undefined' regardless of what session token is passed
      mockCoveyTownController.getSessionByToken.mockReturnValueOnce(undefined);

      invalidSessionToken = nanoid();
    });

    it('Checks for a valid session token before creating a conversation area', () => {
      requestHandlers.conversationAreaCreateHandler({
        conversationArea,
        coveyTownID,
        sessionToken: invalidSessionToken,
      });

      expect(mockCoveyTownController.getSessionByToken).toBeCalledWith(invalidSessionToken);
      expect(mockCoveyTownController.addConversationArea).not.toHaveBeenCalled();
    });

    it('Should respond with isOk false and an error message', () => {
      const responseEnvelope = requestHandlers.conversationAreaCreateHandler({
        conversationArea,
        coveyTownID,
        sessionToken: invalidSessionToken,
      });

      expect(responseEnvelope.isOK).toBe(false);
      expect(responseEnvelope.message).toBe(
        `Unable to create conversation area ${conversationArea.label} with topic ${conversationArea.topic}`,
      );
      expect(responseEnvelope.response).toMatchObject({});
    });
  });
  describe('trying to create a conversation with an valid token but invalid area', () => {
    let coveyTownID: string;
    let conversationArea: ServerConversationArea;
    let validSessionToken: string;

    beforeEach(() => {
      coveyTownID = nanoid();
      conversationArea = createConversationForTesting();

      const mockSession = mock<PlayerSession>();
      mockCoveyTownController.getSessionByToken.mockReturnValueOnce(mockSession);

      // addConversation always fails
      mockCoveyTownController.addConversationArea.mockReturnValueOnce(false);

      validSessionToken = nanoid();
    });

    it('Calls the addConversationArea with the conversation area if the session is valid', () => {
      requestHandlers.conversationAreaCreateHandler({
        conversationArea,
        coveyTownID,
        sessionToken: validSessionToken,
      });

      expect(mockCoveyTownController.addConversationArea).toHaveBeenCalledTimes(1);
      expect(mockCoveyTownController.addConversationArea).toHaveBeenCalledWith(conversationArea);
    });

    it('Should respond with isOk false and an error message', () => {
      const responseEnvelope = requestHandlers.conversationAreaCreateHandler({
        conversationArea,
        coveyTownID,
        sessionToken: validSessionToken,
      });

      expect(responseEnvelope.isOK).toBe(false);
      expect(responseEnvelope.message).toBe(
        `Unable to create conversation area ${conversationArea.label} with topic ${conversationArea.topic}`,
      );
      expect(responseEnvelope.response).toMatchObject({});
    });
  });

  describe('trying to create a conversation with an valid token and valid area', () => {
    let coveyTownID: string;
    let conversationArea: ServerConversationArea;
    let validSessionToken: string;

    beforeEach(() => {
      coveyTownID = nanoid();
      conversationArea = createConversationForTesting();

      const mockSession = mock<PlayerSession>();
      mockCoveyTownController.getSessionByToken.mockReturnValueOnce(mockSession);

      // addConversation always fails
      mockCoveyTownController.addConversationArea.mockReturnValueOnce(true);

      validSessionToken = nanoid();
    });

    it('Calls the addConversationArea with the conversation area if the session is valid', () => {
      requestHandlers.conversationAreaCreateHandler({
        conversationArea,
        coveyTownID,
        sessionToken: validSessionToken,
      });

      expect(mockCoveyTownController.addConversationArea).toHaveBeenCalledTimes(1);
      expect(mockCoveyTownController.addConversationArea).toHaveBeenCalledWith(conversationArea);
    });

    it('Should respond with isOk true and no error message', () => {
      const responseEnvelope = requestHandlers.conversationAreaCreateHandler({
        conversationArea,
        coveyTownID,
        sessionToken: validSessionToken,
      });

      expect(responseEnvelope.isOK).toBe(true);
      expect(responseEnvelope.message).not.toBeDefined();
      expect(responseEnvelope.response).toMatchObject({});
    });
  });
});
