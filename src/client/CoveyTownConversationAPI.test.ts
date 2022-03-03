import CORS from 'cors';
import Express from 'express';
import http from 'http';
import { nanoid } from 'nanoid';
import { AddressInfo } from 'net';
import { mock, mockReset } from 'jest-mock-extended';
import { AxiosError } from 'axios';
import CoveyTownController from '../lib/CoveyTownController';
import CoveyTownsStore from '../lib/CoveyTownsStore';
import addTownRoutes from '../router/towns';
import * as requestHandlers from '../requestHandlers/CoveyTownRequestHandlers';
import { createConversationForTesting } from './TestUtils';
import TownsServiceClient, { ServerConversationArea, TownJoinResponse } from './TownsServiceClient';
import PlayerSession from '../types/PlayerSession';
import * as utils from '../Utils';

type TestTownData = {
  friendlyName: string;
  coveyTownID: string;
  isPubliclyListed: boolean;
  townUpdatePassword: string;
};

describe('Create Conversation Area API', () => {
  let server: http.Server;
  let apiClient: TownsServiceClient;
  let testingTown: TestTownData;
  let testingSession: TownJoinResponse;
  let mockConversationAreaCreateHandler: jest.SpyInstance;

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

  beforeEach(async () => {
    testingTown = await createTownForTesting(undefined, true);
    testingSession = await apiClient.joinTown({
      userName: nanoid(),
      coveyTownID: testingTown.coveyTownID,
    });
  });

  afterEach(() => {
    mockConversationAreaCreateHandler.mockReset();
  });

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
    mockConversationAreaCreateHandler.mockRestore();
    await server.close();
  });

  it('Executes without error and calls the conversationAreaCreateHandler', async () => {
    mockConversationAreaCreateHandler = jest.spyOn(
      requestHandlers,
      'conversationAreaCreateHandler',
    );

    const conversationArea = createConversationForTesting();

    const requestData = {
      conversationArea,
      coveyTownID: testingTown.coveyTownID,
      sessionToken: testingSession.coveySessionToken,
    };

    await apiClient.createConversationArea(requestData);

    expect(mockConversationAreaCreateHandler).toHaveBeenCalledTimes(1);
    expect(mockConversationAreaCreateHandler).toHaveBeenCalledWith(requestData);
  });

  it('Throws an internal server error when conversationAreaCreateHandler throws 500 error with error message', async () => {
    mockConversationAreaCreateHandler = jest
      .spyOn(requestHandlers, 'conversationAreaCreateHandler')
      .mockImplementation(() => {
        throw new Error('Something went wrong');
      });

    const logError = jest.spyOn(utils, 'logError').mockImplementation(err => err);

    const conversationArea = createConversationForTesting();

    const requestData = {
      conversationArea,
      coveyTownID: testingTown.coveyTownID,
      sessionToken: testingSession.coveySessionToken,
    };

    try {
      await apiClient.createConversationArea(requestData);
    } catch (error) {
      const axiosError = error as AxiosError;
      expect(logError).toHaveBeenCalledTimes(1);
      expect(axiosError.response?.status).toBe(500);
      expect(axiosError.response?.data.message).toBe(
        'Internal server error, please see log in server for more details',
      );
    }
  });
});

describe('trying to create a conversation with an invalid token', () => {
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
