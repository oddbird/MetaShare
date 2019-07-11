import fetchMock from 'fetch-mock';

import * as actions from '@/store/user/actions';

import { storeWithApi } from './../../utils';

describe('login', () => {
  beforeEach(() => {
    window.socket = { subscribe: jest.fn() };
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'socket');
  });

  test('returns LoginAction', () => {
    const user = {
      username: 'Test User',
      email: 'test@foo.bar',
    };
    const expected = {
      type: 'USER_LOGGED_IN',
      payload: user,
    };

    expect(actions.login(user)).toEqual(expected);
  });

  test('subscribes to user ws events', () => {
    const user = {
      id: 'user-id',
      username: 'Test User',
      email: 'test@foo.bar',
    };
    const userSubscription = {
      model: 'user',
      id: 'user-id',
    };
    actions.login(user);

    expect(window.socket.subscribe).toHaveBeenCalledWith(userSubscription);
  });

  describe('with Raven', () => {
    beforeEach(() => {
      window.Raven = {
        isSetup: () => true,
        setUserContext: jest.fn(),
      };
    });

    afterEach(() => {
      Reflect.deleteProperty(window, 'Raven');
    });

    test('sets user context', () => {
      const user = {
        username: 'Test User',
        email: 'test@foo.bar',
      };
      actions.login(user);

      expect(window.Raven.setUserContext).toHaveBeenCalledWith(user);
    });
  });
});

describe('logout', () => {
  let store;

  beforeEach(() => {
    store = storeWithApi({});
    fetchMock.postOnce(window.api_urls.account_logout(), {
      status: 204,
      body: {},
    });
    window.socket = { reconnect: jest.fn() };
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'socket');
  });

  test('dispatches LogoutAction', () => {
    const loggedOut = {
      type: 'USER_LOGGED_OUT',
    };

    expect.assertions(1);
    return store.dispatch(actions.logout()).then(() => {
      expect(store.getActions()).toEqual([loggedOut]);
    });
  });

  test('reconnects socket', () => {
    expect.assertions(1);
    return store.dispatch(actions.logout()).then(() => {
      expect(window.socket.reconnect).toHaveBeenCalled();
    });
  });

  describe('with Raven', () => {
    beforeEach(() => {
      window.Raven = {
        isSetup: () => true,
        setUserContext: jest.fn(),
      };
    });

    afterEach(() => {
      Reflect.deleteProperty(window, 'Raven');
    });

    test('resets user context', () => {
      expect.assertions(1);
      return store.dispatch(actions.logout()).then(() => {
        expect(window.Raven.setUserContext).toHaveBeenCalledWith();
      });
    });
  });
});

describe('refetchAllData', () => {
  let url, objectPayload;

  beforeAll(() => {
    url = window.api_urls.product_list();
    objectPayload = {
      objectType: 'product',
      url,
      reset: true,
    };
  });

  describe('success', () => {
    test('GETs user from api', () => {
      const store = storeWithApi({});
      const user = { id: 'me' };
      fetchMock.getOnce(window.api_urls.user(), user);
      const started = { type: 'REFETCH_DATA_STARTED' };
      const succeeded = { type: 'REFETCH_DATA_SUCCEEDED' };
      const loggedIn = {
        type: 'USER_LOGGED_IN',
        payload: user,
      };
      const product = {
        id: 'p1',
        name: 'Product 1',
        slug: 'product-1',
        description: 'This is a test product.',
        repo_url: 'http://www.test.test',
      };
      const response = { next: null, results: [product] };
      fetchMock.getOnce(url, response);
      const productsStarted = {
        type: 'FETCH_OBJECTS_STARTED',
        payload: objectPayload,
      };
      const productsSucceeded = {
        type: 'FETCH_OBJECTS_SUCCEEDED',
        payload: {
          response,
          ...objectPayload,
        },
      };

      expect.assertions(1);
      return store.dispatch(actions.refetchAllData()).then(() => {
        expect(store.getActions()).toEqual([
          started,
          succeeded,
          loggedIn,
          productsStarted,
          productsSucceeded,
        ]);
      });
    });

    test('handles missing user', () => {
      const store = storeWithApi({});
      fetchMock.getOnce(window.api_urls.user(), 401);
      const started = { type: 'REFETCH_DATA_STARTED' };
      const succeeded = { type: 'REFETCH_DATA_SUCCEEDED' };
      const loggedOut = { type: 'USER_LOGGED_OUT' };

      expect.assertions(1);
      return store.dispatch(actions.refetchAllData()).then(() => {
        expect(store.getActions()).toEqual([started, succeeded, loggedOut]);
      });
    });
  });

  describe('error', () => {
    test('dispatches REFETCH_DATA_FAILED action', () => {
      const store = storeWithApi({});
      fetchMock.getOnce(window.api_urls.user(), 500);
      const started = { type: 'REFETCH_DATA_STARTED' };
      const failed = { type: 'REFETCH_DATA_FAILED' };

      expect.assertions(5);
      return store.dispatch(actions.refetchAllData()).catch(() => {
        const allActions = store.getActions();

        expect(allActions[0]).toEqual(started);
        expect(allActions[1].type).toEqual('ERROR_ADDED');
        expect(allActions[1].payload.message).toEqual('Internal Server Error');
        expect(allActions[2]).toEqual(failed);
        expect(window.console.error).toHaveBeenCalled();
      });
    });
  });
});
